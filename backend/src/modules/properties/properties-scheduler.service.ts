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

  /**
   * Ежедневная проверка сроков аренды:
   * 1. Автоматическое закрытие доступа при наступлении даты окончания (leaseEndDate < now).
   * 2. Напоминание собственнику за 7 дней до окончания срока аренды жильца.
   */
  @Cron('0 8 * * *', { timeZone: 'Asia/Almaty' })
  async handleLeaseExpirationsAndReminders(): Promise<{ expiredClosed: number; remindersSent: number }> {
    this.logger.log('[CRON] Starting lease expiration and reminder check...');
    let expiredClosed = 0;
    let remindersSent = 0;
    const now = new Date();

    // 1. Истекшие аренды
    try {
      const expiredOwnerships = await this.prisma.unitOwnership.findMany({
        where: {
          isVerified: true,
          leaseEndDate: {
            not: null,
            lt: now,
          },
        },
        include: {
          unit: { include: { building: true } },
          user: true,
        },
      });

      for (const ownership of expiredOwnerships) {
        try {
          await this.prisma.$transaction(async (tx) => {
            await tx.unitOwnership.delete({
              where: { id: ownership.id },
            });

            await tx.guestPass.updateMany({
              where: {
                unitId: ownership.unitId,
                creatorId: ownership.userId,
                isRevoked: false,
              },
              data: {
                isRevoked: true,
                revokedAt: new Date(),
              },
            });

            const remainingActive = await tx.unitOwnership.count({
              where: {
                userId: ownership.userId,
                isVerified: true,
                OR: [{ leaseEndDate: null }, { leaseEndDate: { gte: now } }],
              },
            });

            if (remainingActive === 0) {
              await tx.user.update({
                where: { id: ownership.userId },
                data: {
                  tokenVersion: { increment: 1 },
                  accessPinHash: null,
                  accessPinSetAt: null,
                  isVerified: false,
                  tenantId: null,
                },
              });
            } else {
              await tx.user.update({
                where: { id: ownership.userId },
                data: {
                  tokenVersion: { increment: 1 },
                },
              });
            }
          });

          try {
            await this.prisma.auditLog.create({
              data: {
                tenantId: ownership.unit.building.tenantId,
                actorId: null,
                action: 'LEASE_EXPIRED',
                targetType: 'UnitOwnership',
                targetId: ownership.id,
                metadata: {
                  unitId: ownership.unitId,
                  residentUserId: ownership.userId,
                  leaseEndDate: ownership.leaseEndDate,
                },
              },
            });
          } catch {
            // best-effort
          }

          expiredClosed++;
        } catch (itemErr: any) {
          this.logger.error(`[CRON] Error expiring lease for ownership ${ownership.id}: ${itemErr.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`[CRON] Error querying expired leases: ${err.message}`);
    }

    // 2. Напоминания за 7 дней
    try {
      const in6Days = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);
      const in8Days = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);

      const expiringSoon = await this.prisma.unitOwnership.findMany({
        where: {
          isVerified: true,
          leaseEndDate: {
            gte: in6Days,
            lte: in8Days,
          },
        },
        include: {
          unit: {
            include: {
              building: true,
              ownerships: {
                where: { ownershipType: 'OWNER', isVerified: true },
              },
            },
          },
          user: true,
        },
      });

      for (const item of expiringSoon) {
        try {
          const redisKey = `properties:lease-reminder:${item.id}`;
          const already = await this.redisService.get(redisKey);
          if (already) continue;

          const recipientId = item.invitedById || item.unit.ownerships?.[0]?.userId;
          if (recipientId) {
            await this.notificationsService.sendToUser(recipientId, {
              title: '⏳ Окончание срока аренды',
              body: `Срок аренды для жильца в кв. №${item.unit.unitNumber} истекает через 7 дней`,
              data: {
                type: 'LEASE_EXPIRING_SOON',
                unitId: item.unitId,
                ownershipId: item.id,
              },
            });

            await this.redisService.set(redisKey, '1', 7 * 24 * 60 * 60);
            remindersSent++;
          }
        } catch (itemErr: any) {
          this.logger.error(`[CRON] Error sending lease reminder for ownership ${item.id}: ${itemErr.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`[CRON] Error querying expiring leases: ${err.message}`);
    }

    this.logger.log(`[CRON] Lease check finished: ${expiredClosed} expired closed, ${remindersSent} reminders sent.`);
    return { expiredClosed, remindersSent };
  }
}
