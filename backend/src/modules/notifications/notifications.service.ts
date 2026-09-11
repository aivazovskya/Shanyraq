import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { RegisterDeviceDto, UpdateNotificationPreferencesDto } from './dto/notifications.dto';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
}

export type NotificationCategory = 'CHAT' | 'SERVICE_REQUEST' | 'ANNOUNCEMENT' | 'FINANCE';

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  'CHAT',
  'SERVICE_REQUEST',
  'ANNOUNCEMENT',
  'FINANCE',
];

export const CATEGORY_MAP: Record<string, NotificationCategory> = {
  CHAT_MESSAGE: 'CHAT',
  SERVICE_REQUEST: 'SERVICE_REQUEST',
  ANNOUNCEMENT: 'ANNOUNCEMENT',
  DEBT_REMINDER: 'FINANCE',
};

export const DEFAULT_NOTIFICATION_PREFERENCES: Record<NotificationCategory, boolean> = {
  CHAT: true,
  SERVICE_REQUEST: true,
  ANNOUNCEMENT: true,
  FINANCE: true,
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService) {}

  resolveCategory(type?: string): NotificationCategory | null {
    if (!type || type === 'SOS_ALERT') {
      return null;
    }
    return CATEGORY_MAP[type] || null;
  }

  async getPreferences(userId: string): Promise<Record<NotificationCategory, boolean>> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPreferences: true },
    });

    const prefs = (user?.notificationPreferences as Record<string, boolean> | null) || {};
    return {
      CHAT: prefs.CHAT !== false,
      SERVICE_REQUEST: prefs.SERVICE_REQUEST !== false,
      ANNOUNCEMENT: prefs.ANNOUNCEMENT !== false,
      FINANCE: prefs.FINANCE !== false,
    };
  }

  async updatePreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<Record<NotificationCategory, boolean>> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPreferences: true },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Пользователь не найден',
      });
    }

    const current = (user.notificationPreferences as Record<string, boolean> | null) || {};
    const updated: Record<string, boolean> = { ...current };

    for (const cat of NOTIFICATION_CATEGORIES) {
      if (dto[cat] !== undefined) {
        updated[cat] = Boolean(dto[cat]);
      }
    }

    // Defensive protection: ensure SOS is never stored
    delete (updated as any)['SOS'];
    delete (updated as any)['SOS_ALERT'];

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        notificationPreferences: updated,
      },
    });

    return {
      CHAT: updated.CHAT !== false,
      SERVICE_REQUEST: updated.SERVICE_REQUEST !== false,
      ANNOUNCEMENT: updated.ANNOUNCEMENT !== false,
      FINANCE: updated.FINANCE !== false,
    };
  }

  private async getUsersPreferences(userIds: string[]): Promise<Map<string, Record<NotificationCategory, boolean>>> {
    const map = new Map<string, Record<NotificationCategory, boolean>>();
    if (!userIds || userIds.length === 0) return map;

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, notificationPreferences: true },
    });

    for (const u of users) {
      const p = (u.notificationPreferences as Record<string, boolean> | null) || {};
      map.set(u.id, {
        CHAT: p.CHAT !== false,
        SERVICE_REQUEST: p.SERVICE_REQUEST !== false,
        ANNOUNCEMENT: p.ANNOUNCEMENT !== false,
        FINANCE: p.FINANCE !== false,
      });
    }
    return map;
  }

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
    const category = this.resolveCategory(payload.data?.type);
    if (category) {
      const prefs = await this.getPreferences(userId);
      if (!prefs[category]) {
        this.logger.debug(`[PUSH] Категория ${category} отключена пользователем ${userId}, пропуск отправки`);
        return { sent: 0 };
      }
    }

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

    let uniqueUserIds = Array.from(new Set(devices.map((d) => d.userId).filter(Boolean)));
    let eligibleDevices = devices;

    const category = this.resolveCategory(payload.data?.type);
    if (category && uniqueUserIds.length > 0) {
      const prefsMap = await this.getUsersPreferences(uniqueUserIds);
      uniqueUserIds = uniqueUserIds.filter((uid) => {
        const prefs = prefsMap.get(uid);
        return prefs ? prefs[category] !== false : true;
      });
      const allowedSet = new Set(uniqueUserIds);
      eligibleDevices = devices.filter((d) => allowedSet.has(d.userId));
    }

    if (uniqueUserIds.length === 0 || eligibleDevices.length === 0) {
      return { sent: 0 };
    }

    await this.persistNotifications(uniqueUserIds, payload);

    const tokens = eligibleDevices.map((d) => d.token);
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

    let uniqueUserIds = Array.from(new Set(devices.map((d) => d.userId).filter(Boolean)));
    let eligibleDevices = devices;

    const category = this.resolveCategory(payload.data?.type);
    if (category && uniqueUserIds.length > 0) {
      const prefsMap = await this.getUsersPreferences(uniqueUserIds);
      uniqueUserIds = uniqueUserIds.filter((uid) => {
        const prefs = prefsMap.get(uid);
        return prefs ? prefs[category] !== false : true;
      });
      const allowedSet = new Set(uniqueUserIds);
      eligibleDevices = devices.filter((d) => allowedSet.has(d.userId));
    }

    if (uniqueUserIds.length === 0 || eligibleDevices.length === 0) {
      return { sent: 0 };
    }

    await this.persistNotifications(uniqueUserIds, payload);

    const tokens = eligibleDevices.map((d) => d.token);
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
