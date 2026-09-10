import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { RegisterDeviceDto } from './dto/notifications.dto';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService) {}

  async registerDevice(userId: string, dto: RegisterDeviceDto) {
    const record = await this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      update: {
        userId,
        platform: dto.platform,
        lastSeenAt: new Date(),
      },
      create: {
        userId,
        token: dto.token,
        platform: dto.platform,
      },
    });

    this.logger.log(`[PUSH] Зарегистрирован токен устройства для пользователя ${userId} (${dto.platform})`);
    return {
      success: true,
      deviceTokenId: record.id,
      platform: record.platform,
    };
  }

  async unregisterDevice(token: string) {
    try {
      await this.prisma.deviceToken.delete({
        where: { token },
      });
      this.logger.log(`[PUSH] Токен устройства ${token} удален`);
    } catch {
      // If token not found, treat as success (idempotent)
    }

    return { success: true };
  }

  async sendToUser(userId: string, payload: PushPayload) {
    await this.persistNotifications([userId], payload);

    const devices = await this.prisma.deviceToken.findMany({
      where: { userId },
    });

    if (devices.length === 0) {
      this.logger.debug(`[PUSH] У пользователя ${userId} нет активных device-токенов`);
      return { sent: 0 };
    }

    const tokens = devices.map((d) => d.token);
    return this.dispatchPushNotifications(tokens, payload);
  }

  async sendToTenant(tenantId: string, payload: PushPayload) {
    const devices = await this.prisma.deviceToken.findMany({
      where: {
        user: {
          tenantId,
        },
      },
    });

    if (devices.length === 0) {
      this.logger.debug(`[PUSH] В ЖК ${tenantId} нет зарегистрированных устройств`);
      return { sent: 0 };
    }

    const uniqueUserIds = Array.from(new Set(devices.map((d) => d.userId).filter(Boolean)));
    await this.persistNotifications(uniqueUserIds, payload);

    const tokens = devices.map((d) => d.token);
    return this.dispatchPushNotifications(tokens, payload);
  }

  async sendToTenantRoles(tenantId: string, roles: UserRole[], payload: PushPayload) {
    const devices = await this.prisma.deviceToken.findMany({
      where: {
        user: {
          tenantId,
          role: { in: roles },
        },
      },
    });

    if (devices.length === 0) {
      this.logger.debug(
        `[PUSH] В ЖК ${tenantId} для ролей ${roles.join(', ')} нет зарегистрированных устройств`,
      );
      return { sent: 0 };
    }

    const uniqueUserIds = Array.from(new Set(devices.map((d) => d.userId).filter(Boolean)));
    await this.persistNotifications(uniqueUserIds, payload);

    const tokens = devices.map((d) => d.token);
    return this.dispatchPushNotifications(tokens, payload);
  }

  private async persistNotifications(userIds: string[], payload: PushPayload) {
    if (!userIds || userIds.length === 0) return;
    try {
      if (!this.prisma.notification) return;
      const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
      if (uniqueIds.length === 0) return;

      await this.prisma.notification.createMany({
        data: uniqueIds.map((userId) => ({
          userId,
          title: payload.title,
          body: payload.body,
          ...(payload.data !== undefined ? { data: payload.data } : {}),
        })),
      });
    } catch (err: any) {
      this.logger.warn(`[NOTIFICATIONS] Не удалось сохранить уведомления в БД: ${err?.message}`);
    }
  }

  async getNotifications(userId: string, query?: { take?: number; skip?: number }) {
    const take = query?.take ? Math.min(Math.max(1, Number(query.take)), 100) : 20;
    const skip = query?.skip ? Math.max(0, Number(query.skip)) : 0;

    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });

    return {
      count,
      unreadCount: count,
    };
  }

  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException({
        code: 'NOTIFICATIONS.NOT_FOUND',
        message: 'Уведомление не найдено',
      });
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException({
        code: 'NOTIFICATIONS.FORBIDDEN',
        message: 'Нет доступа к чужому уведомлению',
      });
    }

    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });

    return {
      success: true,
      updated: result.count,
    };
  }

  private async dispatchPushNotifications(tokens: string[], payload: PushPayload) {
    const expoTokens = tokens.filter((t) => t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['));
    const standardTokens = tokens.filter((t) => !t.startsWith('ExponentPushToken[') && !t.startsWith('ExpoPushToken['));

    this.logger.log(
      `[PUSH] 📲 Отправка пуш-уведомления "${payload.title}": ${payload.body} (Получателей: ${tokens.length})`,
    );

    // 1. Dispatch Expo push notifications if applicable
    if (expoTokens.length > 0 && typeof fetch !== 'undefined') {
      try {
        const messages = expoTokens.map((token) => ({
          to: token,
          sound: 'default',
          title: payload.title,
          body: payload.body,
          data: payload.data || {},
          priority: 'high',
        }));

        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(messages),
        });

        if (!response.ok) {
          this.logger.warn(`[PUSH-EXPO] Ошибка ответа от Expo Push API: status ${response.status}`);
        }
      } catch (err: any) {
        this.logger.warn(`[PUSH-EXPO] Ошибка соединения с Expo Push Gateway: ${err?.message}`);
      }
    }

    if (standardTokens.length > 0) {
      this.logger.log(`[PUSH-FCM/APNS] Локальная эмуляция отправки на ${standardTokens.length} нативных токенов`);
    }

    return {
      sent: tokens.length,
      timestamp: new Date().toISOString(),
    };
  }
}
