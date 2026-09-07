import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
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

    const tokens = devices.map((d) => d.token);
    return this.dispatchPushNotifications(tokens, payload);
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
