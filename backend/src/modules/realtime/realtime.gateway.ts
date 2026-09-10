import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatService } from '../chat/chat.service';
import { SosService } from '../sos/sos.service';
import { UserRole } from '@prisma/client';

const getAllowedOrigins = (): string[] => {
  return (
    process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
};

@Injectable()
@WebSocketGateway({
  cors: {
    origin: getAllowedOrigins(),
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly jwtSecret: string;
  private readonly connectedUsers = new Map<string, string>(); // socketId -> userId

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
    private readonly sosService: SosService,
  ) {
    this.jwtSecret = this.configService.get<string>('JWT_ACCESS_SECRET') || '';
    if (!this.jwtSecret) {
      this.logger.error('CRITICAL: JWT_ACCESS_SECRET is not defined in environment!');
    }
  }

  /**
   * Socket-level auth.
   * Extracts JWT token from handshake auth or headers, verifies it,
   * validates user active status and tokenVersion, or disconnects immediately.
   */
  async handleConnection(client: Socket) {
    try {
      const rawToken =
        client.handshake.auth?.token ||
        (client.handshake.headers?.authorization
          ? client.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
          : null);

      if (!rawToken || typeof rawToken !== 'string') {
        this.logger.warn(`[WS] Connection rejected: missing token (socket ${client.id})`);
        client.disconnect(true);
        return;
      }

      const payload = this.jwtService.verify(rawToken, { secret: this.jwtSecret });
      if (!payload || payload.type !== 'access') {
        this.logger.warn(`[WS] Connection rejected: invalid token type (socket ${client.id})`);
        client.disconnect(true);
        return;
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          tenant: true,
          ownerships: {
            include: {
              unit: {
                include: { building: true },
              },
            },
          },
        },
      });

      if (!user || !user.isActive) {
        this.logger.warn(`[WS] Connection rejected: user not found or inactive (socket ${client.id})`);
        client.disconnect(true);
        return;
      }

      if (payload.tokenVersion !== undefined && user.tokenVersion !== payload.tokenVersion) {
        this.logger.warn(`[WS] Connection rejected: tokenVersion mismatch (socket ${client.id})`);
        client.disconnect(true);
        return;
      }

      (client as any).user = user;
      this.connectedUsers.set(client.id, user.id);
      this.logger.log(`[WS] Client authenticated: user ${user.id} (${user.role}), socket ${client.id}`);
    } catch (err: any) {
      this.logger.warn(`[WS] Connection rejected: ${err?.message} (socket ${client.id})`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.connectedUsers.delete(client.id);
    this.logger.log(`[WS] Client disconnected: socket ${client.id}`);
  }

  // =========================================================================
  // Room Subscriptions
  // =========================================================================

  @SubscribeMessage('chat:join')
  async handleChatJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId?: string; tenantId?: string },
  ) {
    const user = (client as any).user;
    if (!user) {
      client.emit('error', { code: 'AUTH.UNAUTHORIZED', message: 'Требуется авторизация' });
      return;
    }

    // 1. Join conversation room: chat:conversation:<conversationId>
    if (data?.conversationId) {
      const convId = data.conversationId;
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: convId },
      });

      if (!conversation) {
        client.emit('error', { code: 'CHAT.CONVERSATION_NOT_FOUND', message: 'Диалог не найден' });
        return;
      }

      const staffRoles = [
        UserRole.SUPERADMIN,
        UserRole.HOA_ADMIN,
        UserRole.DISPATCHER,
        UserRole.SECURITY,
      ];

      try {
        if (staffRoles.includes(user.role)) {
          // Staff must belong to same tenant (or superadmin)
          await this.chatService.assertAccessToTenant(user, conversation.tenantId);
        } else {
          // Resident must own the conversation AND belong to the tenant
          if (conversation.residentId !== user.id) {
            client.emit('error', {
              code: 'CHAT.RESIDENT_ACCESS_FORBIDDEN',
              message: 'Доступ к чужому диалогу запрещен',
            });
            return;
          }
          await this.chatService.assertAccessToTenant(user, conversation.tenantId);
        }

        const room = `chat:conversation:${convId}`;
        client.join(room);
        client.emit('chat:joined', { room, conversationId: convId });
        this.logger.log(`[WS] User ${user.id} joined room ${room}`);
      } catch (err: any) {
        client.emit('error', {
          code: err?.response?.code || 'FORBIDDEN',
          message: err?.response?.message || 'Доступ к диалогу запрещен',
        });
      }
    }

    // 2. Join tenant inbox room: chat:tenant:<tenantId>:inbox
    if (data?.tenantId) {
      const tId = data.tenantId;
      try {
        this.chatService.assertStaffRole(user);
        await this.chatService.assertAccessToTenant(user, tId);

        const room = `chat:tenant:${tId}:inbox`;
        client.join(room);
        client.emit('chat:inbox:joined', { room, tenantId: tId });
        this.logger.log(`[WS] Staff ${user.id} joined inbox room ${room}`);
      } catch (err: any) {
        client.emit('error', {
          code: err?.response?.code || 'CHAT.DISPATCHER_ACCESS_FORBIDDEN',
          message: err?.response?.message || 'Недостаточно прав для доступа к входящим ЖК',
        });
      }
    }
  }

  @SubscribeMessage('chat:leave')
  handleChatLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId?: string; tenantId?: string },
  ) {
    if (data?.conversationId) {
      client.leave(`chat:conversation:${data.conversationId}`);
    }
    if (data?.tenantId) {
      client.leave(`chat:tenant:${data.tenantId}:inbox`);
    }
  }

  @SubscribeMessage('sos:join')
  handleSosJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { tenantId: string },
  ) {
    const user = (client as any).user;
    if (!user) {
      client.emit('error', { code: 'AUTH.UNAUTHORIZED', message: 'Требуется авторизация' });
      return;
    }

    const tId = data?.tenantId;
    if (!tId) {
      client.emit('error', { code: 'SOS.TENANT_REQUIRED', message: 'tenantId обязателен' });
      return;
    }

    try {
      this.sosService.assertStaffOrChairmanRole(user, tId);
      const room = `sos:tenant:${tId}`;
      client.join(room);
      client.emit('sos:joined', { room, tenantId: tId });
      this.logger.log(`[WS] User ${user.id} joined SOS room ${room}`);
    } catch (err: any) {
      client.emit('error', {
        code: err?.response?.code || 'SOS.LOG_ACCESS_FORBIDDEN',
        message: err?.response?.message || 'Недостаточно прав для просмотра сигналов SOS этого ЖК',
      });
    }
  }

  @SubscribeMessage('sos:leave')
  handleSosLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { tenantId: string },
  ) {
    if (data?.tenantId) {
      client.leave(`sos:tenant:${data.tenantId}`);
    }
  }

  // =========================================================================
  // Domain Event Listeners
  // =========================================================================

  @OnEvent('chat.message.created')
  handleChatMessageCreated(payload: { message: any; conversationId: string; tenantId: string }) {
    if (!this.server) return;

    // Relay to active conversation room
    this.server
      .to(`chat:conversation:${payload.conversationId}`)
      .emit('chat:message', payload.message);

    // Relay to tenant staff inbox room
    this.server
      .to(`chat:tenant:${payload.tenantId}:inbox`)
      .emit('chat:inbox:message', {
        conversationId: payload.conversationId,
        message: payload.message,
      });
  }

  @OnEvent('sos.alert.triggered')
  handleSosAlertTriggered(payload: { alert: any; tenantId: string }) {
    if (!this.server) return;

    this.server
      .to(`sos:tenant:${payload.tenantId}`)
      .emit('sos:alert:triggered', payload.alert);
  }

  @OnEvent('sos.alert.updated')
  handleSosAlertUpdated(payload: { alert: any; tenantId: string }) {
    if (!this.server) return;

    this.server
      .to(`sos:tenant:${payload.tenantId}`)
      .emit('sos:alert:updated', payload.alert);
  }
}
