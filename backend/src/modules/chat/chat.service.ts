import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UserRole } from '@prisma/client';
import { CreateChatMessageDto } from './dto/chat.dto';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

  /**
   * Проверка доступа пользователя к ресурсам тенанта.
   * - SUPERADMIN: доступ ко всем ЖК.
   * - Персонал (HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER, SECURITY): доступ только к своему ЖК (user.tenantId === tenantId).
   * - Жители (OWNER, TENANT): доступ только при наличии верифицированного владения/проживания в зданиях данного ЖК.
   * Возвращает true, если пользователь является персоналом (или SUPERADMIN), и false, если жителем.
   */
  async assertAccessToTenant(user: any, tenantId: string): Promise<boolean> {
    if (!user) {
      throw new ForbiddenException({
        code: 'CHAT.AUTH_REQUIRED',
        message: 'Требуется авторизация',
      });
    }

    if (user.role === UserRole.SUPERADMIN) {
      return true;
    }

    const staffRoles = [
      UserRole.HOA_ADMIN,
      UserRole.HOA_CHAIRMAN,
      UserRole.DISPATCHER,
      UserRole.SECURITY,
    ];

    if (staffRoles.includes(user.role)) {
      if (user.tenantId !== tenantId) {
        throw new ForbiddenException({
          code: 'CHAT.STAFF_CROSS_TENANT_FORBIDDEN',
          message: 'Персонал имеет доступ только к ресурсам своего жилого комплекса',
        });
      }
      return true;
    }

    // Проверяем подтвержденное владение/проживание в здании данного ЖК
    const verifiedOwnership = await this.prisma.unitOwnership.findFirst({
      where: {
        userId: user.id,
        isVerified: true,
        unit: {
          building: {
            tenantId,
          },
        },
      },
    });

    if (!verifiedOwnership) {
      throw new ForbiddenException({
        code: 'CHAT.RESIDENT_ACCESS_FORBIDDEN',
        message: 'У вас нет подтвержденного доступа к ресурсам данного жилого комплекса',
      });
    }

    return false;
  }

  /**
   * Проверка прав сотрудника диспетчерской/УК (DISPATCHER, HOA_ADMIN, SUPERADMIN).
   */
  assertStaffRole(user: any): void {
    if (!user) {
      throw new ForbiddenException({
        code: 'CHAT.AUTH_REQUIRED',
        message: 'Требуется авторизация',
      });
    }
    const allowedStaffRoles = [UserRole.DISPATCHER, UserRole.HOA_ADMIN, UserRole.SUPERADMIN];
    if (!allowedStaffRoles.includes(user.role)) {
      throw new ForbiddenException({
        code: 'CHAT.DISPATCHER_ACCESS_FORBIDDEN',
        message: 'Недостаточно прав для доступа к чату диспетчера',
      });
    }
  }

  /**
   * Определение жилого комплекса пользователя (зеркально SosService.trigger).
   */
  private async resolveResidentTenant(user: any): Promise<string> {
    if (!user || !user.id) {
      throw new ForbiddenException({
        code: 'CHAT.AUTH_REQUIRED',
        message: 'Требуется авторизация',
      });
    }

    const ownership = await this.prisma.unitOwnership.findFirst({
      where: { userId: user.id },
      include: {
        unit: {
          include: { building: true },
        },
      },
    });

    const tenantId = user.tenantId || ownership?.unit?.building?.tenantId;
    if (!tenantId) {
      throw new BadRequestException({
        code: 'CHAT.TENANT_UNRESOLVED',
        message: 'Не удалось определить жилой комплекс пользователя',
      });
    }

    return tenantId;
  }

  // =============================================================
  // Resident-facing
  // =============================================================

  /**
   * Получить или создать диалог жителя с диспетчерской.
   * Возвращает диалог со списком сообщений и обновляет lastReadByResidentAt.
   */
  async getMyConversation(user: any) {
    const tenantId = await this.resolveResidentTenant(user);
    await this.assertAccessToTenant(user, tenantId);

    let conversation = await this.prisma.conversation.findUnique({
      where: {
        tenantId_residentId: {
          tenantId,
          residentId: user.id,
        },
      },
      include: {
        resident: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 100,
          include: {
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      try {
        conversation = await this.prisma.conversation.create({
          data: {
            tenantId,
            residentId: user.id,
            lastReadByResidentAt: new Date(),
          },
          include: {
            resident: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
              },
            },
            messages: {
              orderBy: { createdAt: 'asc' },
              take: 100,
              include: {
                sender: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    role: true,
                  },
                },
              },
            },
          },
        });
      } catch {
        // Если уже был создан параллельно — достаем существующий
        conversation = await this.prisma.conversation.findUnique({
          where: {
            tenantId_residentId: {
              tenantId,
              residentId: user.id,
            },
          },
          include: {
            resident: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
              },
            },
            messages: {
              orderBy: { createdAt: 'asc' },
              take: 100,
              include: {
                sender: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    role: true,
                  },
                },
              },
            },
          },
        });
      }
    } else {
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastReadByResidentAt: new Date() },
      });
      conversation.lastReadByResidentAt = new Date();
    }

    return conversation;
  }

  /**
   * Отправка сообщения жителем в свой диалог.
   */
  async sendResidentMessage(user: any, dto: CreateChatMessageDto) {
    const text = dto.text && dto.text.trim() ? dto.text.trim() : null;
    const photoUrl = dto.photoUrl && dto.photoUrl.trim() ? dto.photoUrl.trim() : null;

    if (!text && !photoUrl) {
      throw new BadRequestException({
        code: 'CHAT.MESSAGE_TEXT_OR_PHOTO_REQUIRED',
        message: 'Сообщение должно содержать текст или фото',
      });
    }

    const tenantId = await this.resolveResidentTenant(user);
    await this.assertAccessToTenant(user, tenantId);

    // Get or create conversation (with race safety)
    let conversation = await this.prisma.conversation.findUnique({
      where: {
        tenantId_residentId: {
          tenantId,
          residentId: user.id,
        },
      },
    });

    if (!conversation) {
      try {
        conversation = await this.prisma.conversation.create({
          data: {
            tenantId,
            residentId: user.id,
            lastReadByResidentAt: new Date(),
          },
        });
      } catch {
        conversation = await this.prisma.conversation.findUnique({
          where: {
            tenantId_residentId: {
              tenantId,
              residentId: user.id,
            },
          },
        });
      }
    }

    const message = await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        senderId: user.id,
        text,
        photoUrl,
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastReadByResidentAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Оповещение персонала ЖК (DISPATCHER, HOA_ADMIN)
    try {
      await this.notificationsService.sendToTenantRoles(
        tenantId,
        [UserRole.DISPATCHER, UserRole.HOA_ADMIN],
        {
          title: 'Новое сообщение от жителя',
          body: `${user.firstName || 'Житель'}: ${text || 'Фотография'}`,
          data: { conversationId: conversation.id, type: 'CHAT_MESSAGE' },
        },
      );
    } catch (e) {
      this.logger.warn(`Failed to send push notification to staff: ${e}`);
    }

    // Real-time событие для WebSocket шлюза
    try {
      this.eventEmitter?.emit('chat.message.created', {
        message,
        conversationId: conversation.id,
        tenantId,
      });
    } catch (e) {
      this.logger.warn(`Failed to emit chat.message.created event: ${e}`);
    }

    return message;
  }

  // =============================================================
  // Staff-facing (DISPATCHER, HOA_ADMIN, SUPERADMIN)
  // =============================================================

  /**
   * Список диалогов жилого комплекса для диспетчерской.
   */
  async getTenantConversations(tenantId: string, user: any) {
    this.assertStaffRole(user);
    await this.assertAccessToTenant(user, tenantId);

    const conversations = await this.prisma.conversation.findMany({
      where: { tenantId },
      include: {
        resident: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            ownerships: {
              where: { isVerified: true },
              select: {
                unit: {
                  select: {
                    unitNumber: true,
                    building: { select: { blockName: true } },
                  },
                },
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const conversationsWithUnread = await Promise.all(
      conversations.map(async (conv) => {
        const unreadCount = await this.prisma.chatMessage.count({
          where: {
            conversationId: conv.id,
            ...(conv.lastReadByStaffAt ? { createdAt: { gt: conv.lastReadByStaffAt } } : {}),
          },
        });

        return {
          id: conv.id,
          tenantId: conv.tenantId,
          residentId: conv.residentId,
          resident: conv.resident,
          lastReadByResidentAt: conv.lastReadByResidentAt,
          lastReadByStaffAt: conv.lastReadByStaffAt,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
          lastMessage: conv.messages[0] || null,
          unreadCount,
        };
      }),
    );

    return conversationsWithUnread;
  }

  /**
   * Сообщения конкретного диалога для сотрудника диспетчерской.
   * Обновляет lastReadByStaffAt.
   */
  async getConversationMessages(id: string, user: any) {
    this.assertStaffRole(user);

    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        resident: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            ownerships: {
              where: { isVerified: true },
              select: {
                unit: {
                  select: {
                    unitNumber: true,
                    building: { select: { blockName: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException({
        code: 'CHAT.CONVERSATION_NOT_FOUND',
        message: 'Диалог не найден',
      });
    }

    await this.assertAccessToTenant(user, conversation.tenantId);

    await this.prisma.conversation.update({
      where: { id },
      data: { lastReadByStaffAt: new Date() },
    });

    const messages = await this.prisma.chatMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
    });

    return {
      ...conversation,
      lastReadByStaffAt: new Date(),
      messages,
    };
  }

  /**
   * Отправка ответа сотрудником диспетчерской / УК в диалог с жителем.
   */
  async sendStaffMessage(id: string, user: any, dto: CreateChatMessageDto) {
    this.assertStaffRole(user);

    const text = dto.text && dto.text.trim() ? dto.text.trim() : null;
    const photoUrl = dto.photoUrl && dto.photoUrl.trim() ? dto.photoUrl.trim() : null;

    if (!text && !photoUrl) {
      throw new BadRequestException({
        code: 'CHAT.MESSAGE_TEXT_OR_PHOTO_REQUIRED',
        message: 'Сообщение должно содержать текст или фото',
      });
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
    });

    if (!conversation) {
      throw new NotFoundException({
        code: 'CHAT.CONVERSATION_NOT_FOUND',
        message: 'Диалог не найден',
      });
    }

    await this.assertAccessToTenant(user, conversation.tenantId);

    const message = await this.prisma.chatMessage.create({
      data: {
        conversationId: id,
        senderId: user.id,
        text,
        photoUrl,
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
    });

    await this.prisma.conversation.update({
      where: { id },
      data: {
        lastReadByStaffAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Оповещение жильца о полученном ответе
    try {
      await this.notificationsService.sendToUser(conversation.residentId, {
        title: 'Ответ от диспетчера',
        body: text || 'Фотография',
        data: { conversationId: id, type: 'CHAT_MESSAGE' },
      });
    } catch (e) {
      this.logger.warn(`Failed to send push notification to resident: ${e}`);
    }

    // Real-time событие для WebSocket шлюза
    try {
      this.eventEmitter?.emit('chat.message.created', {
        message,
        conversationId: id,
        tenantId: conversation.tenantId,
      });
    } catch (e) {
      this.logger.warn(`Failed to emit chat.message.created event: ${e}`);
    }

    return message;
  }
}
