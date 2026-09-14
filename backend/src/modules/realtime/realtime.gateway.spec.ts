import { Test, TestingModule } from '@nestjs/testing';
import { RealtimeGateway } from './realtime.gateway';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatService } from '../chat/chat.service';
import { SosService } from '../sos/sos.service';
import { UserRole } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';

describe('RealtimeGateway (WebSocket)', () => {
  let gateway: RealtimeGateway;
  let jwtService: any;
  let prismaMock: any;
  let chatServiceMock: any;
  let sosServiceMock: any;
  let serverMock: any;

  const jwtSecret = 'test_jwt_secret_key';

  const residentUser = {
    id: 'resident-1',
    role: UserRole.RESIDENT_OWNER,
    tenantId: 'tenant-1',
    isActive: true,
    tokenVersion: 1,
  };

  const staffTenantA = {
    id: 'staff-a',
    role: UserRole.DISPATCHER,
    tenantId: 'tenant-1',
    isActive: true,
    tokenVersion: 1,
  };

  const staffTenantB = {
    id: 'staff-b',
    role: UserRole.DISPATCHER,
    tenantId: 'tenant-2',
    isActive: true,
    tokenVersion: 1,
  };

  beforeEach(async () => {
    jwtService = {
      verify: jest.fn(),
    };

    prismaMock = {
      user: {
        findUnique: jest.fn(),
      },
      conversation: {
        findUnique: jest.fn(),
      },
    };

    chatServiceMock = {
      assertAccessToTenant: jest.fn(),
      assertStaffRole: jest.fn(),
    };

    sosServiceMock = {
      assertStaffOrChairmanRole: jest.fn(),
    };

    serverMock = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RealtimeGateway,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'JWT_ACCESS_SECRET') return jwtSecret;
              return null;
            }),
          },
        },
        { provide: JwtService, useValue: jwtService },
        { provide: PrismaService, useValue: prismaMock },
        { provide: ChatService, useValue: chatServiceMock },
        { provide: SosService, useValue: sosServiceMock },
      ],
    }).compile();

    gateway = module.get<RealtimeGateway>(RealtimeGateway);
    gateway.server = serverMock;
  });

  describe('handleConnection (Authentication & Handshake)', () => {
    it('должен отклонять подключение при отсутствии токена', async () => {
      const socketMock: any = {
        id: 'sock-1',
        handshake: { auth: {}, headers: {} },
        disconnect: jest.fn(),
      };

      await gateway.handleConnection(socketMock);
      expect(socketMock.disconnect).toHaveBeenCalledWith(true);
      expect(socketMock.user).toBeUndefined();
    });

    it('должен отклонять подключение при невалидном токене', async () => {
      const socketMock: any = {
        id: 'sock-2',
        handshake: { auth: { token: 'invalid.jwt.token' } },
        disconnect: jest.fn(),
      };

      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt malformed');
      });

      await gateway.handleConnection(socketMock);
      expect(socketMock.disconnect).toHaveBeenCalledWith(true);
      expect(socketMock.user).toBeUndefined();
    });

    it('должен отклонять подключение, если передан refresh-токен вместо access-токена', async () => {
      const socketMock: any = {
        id: 'sock-3',
        handshake: { auth: { token: 'refresh.token' } },
        disconnect: jest.fn(),
      };

      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        type: 'refresh',
      });

      await gateway.handleConnection(socketMock);
      expect(socketMock.disconnect).toHaveBeenCalledWith(true);
    });

    it('должен отклонять подключение, если пользователь заблокирован (isActive = false)', async () => {
      const socketMock: any = {
        id: 'sock-4',
        handshake: { auth: { token: 'valid.token' } },
        disconnect: jest.fn(),
      };

      jwtService.verify.mockReturnValue({
        sub: 'user-inactive',
        type: 'access',
        tokenVersion: 1,
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-inactive',
        isActive: false,
        tokenVersion: 1,
      });

      await gateway.handleConnection(socketMock);
      expect(socketMock.disconnect).toHaveBeenCalledWith(true);
    });

    it('должен успешно аутентифицировать сокет с валидным access-токеном', async () => {
      const socketMock: any = {
        id: 'sock-5',
        handshake: { auth: { token: 'valid.token' } },
        disconnect: jest.fn(),
      };

      jwtService.verify.mockReturnValue({
        sub: residentUser.id,
        type: 'access',
        tokenVersion: 1,
      });

      prismaMock.user.findUnique.mockResolvedValue(residentUser);

      await gateway.handleConnection(socketMock);
      expect(socketMock.disconnect).not.toHaveBeenCalled();
      expect(socketMock.user).toEqual(residentUser);
    });
  });

  describe('chat:join (Room Authorization)', () => {
    it('должен отклонять неаутентифицированный сокет', async () => {
      const socketMock: any = {
        id: 'sock-anon',
        emit: jest.fn(),
        join: jest.fn(),
      };

      await gateway.handleChatJoin(socketMock, { conversationId: 'conv-1' });
      expect(socketMock.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ code: 'AUTH.UNAUTHORIZED' }),
      );
      expect(socketMock.join).not.toHaveBeenCalled();
    });

    it('должен отклонять жителя, пытающегося присоединиться к чужому диалогу', async () => {
      const socketMock: any = {
        id: 'sock-res-1',
        user: residentUser,
        emit: jest.fn(),
        join: jest.fn(),
      };

      prismaMock.conversation.findUnique.mockResolvedValue({
        id: 'conv-other',
        residentId: 'someone-else',
        tenantId: 'tenant-1',
      });

      await gateway.handleChatJoin(socketMock, { conversationId: 'conv-other' });
      expect(socketMock.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ code: 'CHAT.RESIDENT_ACCESS_FORBIDDEN' }),
      );
      expect(socketMock.join).not.toHaveBeenCalled();
    });

    it('должен разрешать жителю присоединяться к своему диалогу', async () => {
      const socketMock: any = {
        id: 'sock-res-1',
        user: residentUser,
        emit: jest.fn(),
        join: jest.fn(),
      };

      prismaMock.conversation.findUnique.mockResolvedValue({
        id: 'conv-mine',
        residentId: residentUser.id,
        tenantId: 'tenant-1',
      });

      chatServiceMock.assertAccessToTenant.mockResolvedValue(true);

      await gateway.handleChatJoin(socketMock, { conversationId: 'conv-mine' });
      expect(socketMock.join).toHaveBeenCalledWith('chat:conversation:conv-mine');
      expect(socketMock.emit).toHaveBeenCalledWith(
        'chat:joined',
        expect.objectContaining({ conversationId: 'conv-mine' }),
      );
    });

    it('должен отклонять сотрудника ЖК B при попытке присоединиться к входящим ЖК A (chat:tenant:A:inbox)', async () => {
      const socketMock: any = {
        id: 'sock-staff-b',
        user: staffTenantB,
        emit: jest.fn(),
        join: jest.fn(),
      };

      chatServiceMock.assertAccessToTenant.mockImplementation(() => {
        throw new ForbiddenException({
          code: 'CHAT.STAFF_CROSS_TENANT_FORBIDDEN',
          message: 'Персонал имеет доступ только к ресурсам своего жилого комплекса',
        });
      });

      await gateway.handleChatJoin(socketMock, { tenantId: 'tenant-1' });
      expect(socketMock.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ code: 'CHAT.STAFF_CROSS_TENANT_FORBIDDEN' }),
      );
      expect(socketMock.join).not.toHaveBeenCalled();
    });

    it('должен разрешать сотруднику ЖК A присоединяться к входящим своего ЖК', async () => {
      const socketMock: any = {
        id: 'sock-staff-a',
        user: staffTenantA,
        emit: jest.fn(),
        join: jest.fn(),
      };

      chatServiceMock.assertAccessToTenant.mockResolvedValue(true);

      await gateway.handleChatJoin(socketMock, { tenantId: 'tenant-1' });
      expect(socketMock.join).toHaveBeenCalledWith('chat:tenant:tenant-1:inbox');
      expect(socketMock.emit).toHaveBeenCalledWith(
        'chat:inbox:joined',
        expect.objectContaining({ tenantId: 'tenant-1' }),
      );
    });
  });

  describe('sos:join (Room Authorization)', () => {
    it('должен отклонять сотрудника ЖК B при попытке присоединиться к SOS-комнате ЖК A', async () => {
      const socketMock: any = {
        id: 'sock-staff-b',
        user: staffTenantB,
        emit: jest.fn(),
        join: jest.fn(),
      };

      sosServiceMock.assertStaffOrChairmanRole.mockImplementation(() => {
        throw new ForbiddenException({
          code: 'SOS.CROSS_TENANT_VIEW_FORBIDDEN',
          message: 'Вы не можете просматривать сигналы SOS другого ЖК',
        });
      });

      await gateway.handleSosJoin(socketMock, { tenantId: 'tenant-1' });
      expect(socketMock.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ code: 'SOS.CROSS_TENANT_VIEW_FORBIDDEN' }),
      );
      expect(socketMock.join).not.toHaveBeenCalled();
    });

    it('должен разрешать сотруднику ЖК A присоединиться к SOS-комнате своего ЖК', async () => {
      const socketMock: any = {
        id: 'sock-staff-a',
        user: staffTenantA,
        emit: jest.fn(),
        join: jest.fn(),
      };

      sosServiceMock.assertStaffOrChairmanRole.mockReturnValue(undefined);

      await gateway.handleSosJoin(socketMock, { tenantId: 'tenant-1' });
      expect(socketMock.join).toHaveBeenCalledWith('sos:tenant:tenant-1');
      expect(socketMock.emit).toHaveBeenCalledWith(
        'sos:joined',
        expect.objectContaining({ tenantId: 'tenant-1' }),
      );
    });
  });

  describe('Domain Event Relaying', () => {
    it('должен транслировать chat.message.created в комнату диалога и в inbox ЖК', () => {
      const payload = {
        message: { id: 'msg-1', text: 'Привет' },
        conversationId: 'conv-10',
        tenantId: 'tenant-1',
      };

      gateway.handleChatMessageCreated(payload);

      expect(serverMock.to).toHaveBeenCalledWith('chat:conversation:conv-10');
      expect(serverMock.emit).toHaveBeenCalledWith('chat:message', payload.message);

      expect(serverMock.to).toHaveBeenCalledWith('chat:tenant:tenant-1:inbox');
      expect(serverMock.emit).toHaveBeenCalledWith('chat:inbox:message', {
        conversationId: 'conv-10',
        message: payload.message,
      });
    });

    it('должен транслировать sos.alert.triggered в комнату ЖК', () => {
      const payload = {
        alert: { id: 'sos-1', status: 'ACTIVE' },
        tenantId: 'tenant-1',
      };

      gateway.handleSosAlertTriggered(payload);
      expect(serverMock.to).toHaveBeenCalledWith('sos:tenant:tenant-1');
      expect(serverMock.emit).toHaveBeenCalledWith('sos:alert:triggered', payload.alert);
    });

    it('должен транслировать sos.alert.updated в комнату ЖК', () => {
      const payload = {
        alert: { id: 'sos-1', status: 'RESOLVED' },
        tenantId: 'tenant-1',
      };

      gateway.handleSosAlertUpdated(payload);
      expect(serverMock.to).toHaveBeenCalledWith('sos:tenant:tenant-1');
      expect(serverMock.emit).toHaveBeenCalledWith('sos:alert:updated', payload.alert);
    });

    it('Task 0068: должен транслировать chat.conversation.resolved в inbox ЖК', () => {
      const resolvedAt = new Date();
      const payload = {
        conversationId: 'conv-10',
        tenantId: 'tenant-1',
        isResolved: true,
        resolvedAt,
        resolvedById: 'staff-a',
      };

      gateway.handleChatConversationResolved(payload);

      expect(serverMock.to).toHaveBeenCalledWith('chat:tenant:tenant-1:inbox');
      expect(serverMock.emit).toHaveBeenCalledWith('chat:inbox:conversation-status', {
        conversationId: 'conv-10',
        isResolved: true,
        resolvedAt,
        resolvedById: 'staff-a',
      });
    });
  });
});
