import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RedisService } from '../../redis/redis.service';
import { getAlmatyCurrentPeriod } from '../finance/finance-scheduler.service';
import { ChargeCalculationMethod, MeterType, ReadingStatus } from '@prisma/client';

export interface MeterRemindersSummary {
  tenantsChecked: number;
  metersNeedingReading: number;
  remindersSent: number;
  skippedAlreadyReminded: number;
}

export const METER_TYPE_NAMES: Record<MeterType, string> = {
  [MeterType.COLD_WATER]: 'холодная вода',
  [MeterType.HOT_WATER]: 'горячая вода',
  [MeterType.ELECTRICITY]: 'электроэнергия',
  [MeterType.OTHER]: 'прибор учета',
};

@Injectable()
export class MetersSchedulerService {
  private readonly logger = new Logger(MetersSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Automated monthly meter reading reminders.
   * Runs at 10:00 on the 25th day of every month in Asia/Almaty timezone.
   */
  @Cron('0 10 25 * *', { timeZone: 'Asia/Almaty' })
  async handleMeterReadingReminders(): Promise<MeterRemindersSummary> {
    const { year, month } = getAlmatyCurrentPeriod();
    const periodStr = `${String(month).padStart(2, '0')}.${year}`;

    this.logger.log(
      `[CRON] Starting meter reading reminders check for period ${periodStr} (Asia/Almaty)...`,
    );

    let tenantsChecked = 0;
    let metersNeedingReading = 0;
    let remindersSent = 0;
    let skippedAlreadyReminded = 0;

    // 35 days in seconds (past month-end to ensure once-per-month debouncing)
    const TTL_SECONDS = 35 * 24 * 60 * 60;

    let tenants: any[] = [];
    try {
      tenants = await this.prisma.tenant.findMany();
    } catch (err: any) {
      this.logger.error(`[CRON] Failed to fetch tenants for meter reminders: ${err.message}`, err.stack);
      return { tenantsChecked, metersNeedingReading, remindersSent, skippedAlreadyReminded };
    }

    for (const tenant of tenants) {
      tenantsChecked++;

      try {
        // Find active PER_CONSUMPTION tariffs with a meterType for this tenant
        const tariffs = await this.prisma.tariffItem.findMany({
          where: {
            tenantId: tenant.id,
            isActive: true,
            calculationMethod: ChargeCalculationMethod.PER_CONSUMPTION,
            meterType: { not: null },
          },
        });

        const activeMeterTypes = Array.from(
          new Set(tariffs.map((t) => t.meterType).filter(Boolean)),
        ) as MeterType[];

        if (activeMeterTypes.length === 0) {
          continue;
        }

        // Find active meters matching those meterTypes in this tenant
        const meters = await this.prisma.meter.findMany({
          where: {
            isActive: true,
            type: { in: activeMeterTypes },
            unit: {
              building: {
                tenantId: tenant.id,
              },
            },
          },
          include: {
            unit: {
              include: {
                ownerships: {
                  where: {
                    isVerified: true,
                    // ANY verified ownership: OWNER or TENANT!
                  },
                  select: {
                    userId: true,
                  },
                },
              },
            },
            readings: {
              where: {
                periodMonth: month,
                periodYear: year,
              },
            },
          },
        });

        for (const meter of meters) {
          // @@unique([meterId, periodMonth, periodYear]) ensures at most 1 reading
          const currentReading = meter.readings?.[0];
          // Reminder needed if no reading exists, or if reading was rejected (needs resubmission)
          const needsReminder = !currentReading || currentReading.status === ReadingStatus.REJECTED;

          if (!needsReminder) {
            continue;
          }

          metersNeedingReading++;

          const redisKey = `meters:reminder:${meter.id}:${year}-${month}`;
          try {
            const alreadyReminded = await this.redisService.get(redisKey);
            if (alreadyReminded) {
              skippedAlreadyReminded++;
              continue;
            }

            const verifiedOwnerships = meter.unit?.ownerships || [];
            if (verifiedOwnerships.length === 0) {
              continue;
            }

            const typeName = METER_TYPE_NAMES[meter.type] || 'прибор учета';
            const title = 'Напоминание о передаче показаний счётчика';
            const body = `Пожалуйста, передайте показания счётчика (${typeName}) для квартиры №${meter.unit.unitNumber} за ${periodStr}.`;

            let sentToAtLeastOne = false;

            for (const ownership of verifiedOwnerships) {
              try {
                await this.notificationsService.sendToUser(ownership.userId, {
                  title,
                  body,
                  data: {
                    type: 'METER_READING_REMINDER',
                    meterId: meter.id,
                  },
                });
                remindersSent++;
                sentToAtLeastOne = true;
              } catch (userErr: any) {
                this.logger.error(
                  `[CRON] Failed to send meter reminder to user ${ownership.userId} for meter ${meter.id}: ${userErr.message}`,
                );
              }
            }

            if (sentToAtLeastOne) {
              await this.redisService.set(redisKey, '1', TTL_SECONDS);
            }
          } catch (meterErr: any) {
            this.logger.error(
              `[CRON] Error processing meter reminder for meter ${meter.id}: ${meterErr.message}`,
            );
          }
        }
      } catch (tenantErr: any) {
        this.logger.error(
          `[CRON] Error processing meter reminders for tenant ${tenant.id}: ${tenantErr.message}`,
        );
      }
    }

    this.logger.log(
      `[CRON] Meter reminders completed: ${tenantsChecked} tenants, ${metersNeedingReading} meters needing reading, ${remindersSent} reminders sent, ${skippedAlreadyReminded} skipped (already reminded).`,
    );

    return {
      tenantsChecked,
      metersNeedingReading,
      remindersSent,
      skippedAlreadyReminded,
    };
  }
}
