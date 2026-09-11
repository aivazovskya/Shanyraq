import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RedisService } from '../../redis/redis.service';
import { UserRole } from '@prisma/client';

export interface StaleVerificationRemindersSummary {
  pendingChecked: number;
  staleCount: number;
  remindersSent: number;
  skippedAlreadyReminded: number;
}

export const VERIFICATION_STALE_THRESHOLD_DAYS = 5;

@Injectable()
export class PropertiesSchedulerService {
  private readonly logger = new Logger(PropertiesSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Ежедневное напоминание персоналу о заявках на верификацию прав
   * собственности, которые остаются без решения дольше
   * VERIFICATION_STALE_THRESHOLD_DAYS дней.
   */
  @Cron('0 9 * * *', { timeZone: 'Asia/Almaty' })
  async handleStaleVerificationReminders(): Promise<StaleVerificationRemindersSummary> {
    this.logger.log('[CRON] Starting stale ownership verification check...');

    let pendingChecked = 0;
    let staleCount = 0;
    let remindersSent = 0;
    let skippedAlreadyReminded = 0;

    const cutoff = new Date(
      Date.now() - VERIFICATION_STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000,
    );

    let pendingOwnerships: any[] = [];
    try {
      pendingOwnerships = await this.prisma.unitOwnership.findMany({
        where: {
          isVerified: false,
          createdAt: { lt: cutoff },
        },
        include: {
          unit: {
            include: { building: true },
          },
          user: {
            select: { firstName: true, lastName: true },
          },
        },
      });
    } catch (err: any) {
      this.logger.error(
        `[CRON] Failed to fetch pending ownership verifications: ${err.message}`,
        err.stack,
      );
      return { pendingChecked, staleCount, remindersSent, skippedAlreadyReminded };
    }

    const ttlSeconds = VERIFICATION_STALE_THRESHOLD_DAYS * 24 * 60 * 60;

    for (const ownership of pendingOwnerships) {
      pendingChecked++;
      staleCount++;

      try {
        const tenantId = ownership.unit?.building?.tenantId;
        if (!tenantId) {
          continue;
        }

        const redisKey = `properties:verification-reminder:${ownership.id}`;
        const alreadyReminded = await this.redisService.get(redisKey);
        if (alreadyReminded) {
          skippedAlreadyReminded++;
          continue;
        }

        const claimantName = [ownership.user?.firstName, ownership.user?.lastName]
          .filter(Boolean)
          .join(' ') || 'Житель';
        const unitNumber = ownership.unit?.unitNumber || '?';
        const blockName = ownership.unit?.building?.blockName || '';
        const waitingDays = Math.floor(
          (Date.now() - new Date(ownership.createdAt).getTime()) / (24 * 60 * 60 * 1000),
        );
        const unitPart = blockName ? `кв. №${unitNumber}, блок ${blockName}` : `кв. №${unitNumber}`;

        await this.notificationsService.sendToTenantRoles(
          tenantId,
          [UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.DISPATCHER],
          {
            title: '📋 Заявка на верификацию ожидает решения',
            body: `${claimantName} — ${unitPart} — ожидает подтверждения права собственности ${waitingDays} дн.`,
            data: {
              type: 'OWNERSHIP_VERIFICATION_STALE',
              ownershipId: ownership.id,
            },
          },
        );

        await this.redisService.set(redisKey, '1', ttlSeconds);
        remindersSent++;
      } catch (itemErr: any) {
        this.logger.error(
          `[CRON] Error processing stale verification reminder for ownership ${ownership.id}: ${itemErr.message}`,
          itemErr.stack,
        );
      }
    }

    this.logger.log(
      `[CRON] Stale ownership verification check completed: ${pendingChecked} checked, ${staleCount} stale, ${remindersSent} reminders sent, ${skippedAlreadyReminded} skipped (already reminded).`,
    );

    return { pendingChecked, staleCount, remindersSent, skippedAlreadyReminded };
  }
}
