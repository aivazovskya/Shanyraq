import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { FinanceService } from './finance.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RedisService } from '../../redis/redis.service';

/**
 * Derives current year and month for Asia/Almaty timezone.
 */
export function getAlmatyCurrentPeriod(date: Date = new Date()): { year: number; month: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Almaty',
    year: 'numeric',
    month: 'numeric',
  });
  const parts = formatter.formatToParts(date);
  const month = parseInt(parts.find((p) => p.type === 'month')?.value || '1', 10);
  const year = parseInt(parts.find((p) => p.type === 'year')?.value || '2026', 10);
  return { year, month };
}

@Injectable()
export class FinanceSchedulerService {
  private readonly logger = new Logger(FinanceSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly financeService: FinanceService,
    private readonly notificationsService: NotificationsService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Subtask A: Automated monthly charge generation.
   * Runs at 03:00 on the 1st day of every month in Asia/Almaty timezone.
   */
  @Cron('0 3 1 * *', { timeZone: 'Asia/Almaty' })
  async handleMonthlyChargeGeneration(): Promise<{
    totalTenants: number;
    processedCount: number;
    failedCount: number;
    totalCreated: number;
    totalSkipped: number;
  }> {
    const { year, month } = getAlmatyCurrentPeriod();
    this.logger.log(
      `[CRON] Starting automated monthly charge generation for ${year}-${month} (Asia/Almaty)...`,
    );

    const tenants = await this.prisma.tenant.findMany();
    let processedCount = 0;
    let failedCount = 0;
    let totalCreated = 0;
    let totalSkipped = 0;

    for (const tenant of tenants) {
      try {
        const result = await this.financeService.generateCharges(tenant.id, {
          month,
          year,
        });
        processedCount++;
        totalCreated += result.createdCount ?? 0;
        totalSkipped += result.skippedCount ?? 0;
      } catch (err: any) {
        failedCount++;
        this.logger.error(
          `[CRON] Failed to generate charges for tenant ${tenant.id} (${tenant.name || 'unnamed'}): ${err.message}`,
          err.stack,
        );
      }
    }

    this.logger.log(
      `[CRON] Monthly charge generation completed: ${tenants.length} tenants total, ${processedCount} succeeded, ${failedCount} failed. Charges created: ${totalCreated}, charges skipped: ${totalSkipped}.`,
    );

    return {
      totalTenants: tenants.length,
      processedCount,
      failedCount,
      totalCreated,
      totalSkipped,
    };
  }

  /**
   * Subtask B: Overdue-balance reminder push.
   * Runs at 10:00 on the 5th day of every month in Asia/Almaty timezone.
   */
  @Cron('0 10 5 * *', { timeZone: 'Asia/Almaty' })
  async handleOverdueReminders(): Promise<{
    overdueAccountsCount: number;
    remindedAccountsCount: number;
    skippedAlreadyRemindedCount: number;
    notificationsSentCount: number;
  }> {
    const { year, month } = getAlmatyCurrentPeriod();
    this.logger.log(
      `[CRON] Starting overdue-balance reminders check for ${year}-${month} (Asia/Almaty)...`,
    );

    const overdueAccounts = await this.prisma.personalAccount.findMany({
      where: {
        balance: { lt: 0 },
      },
      include: {
        unit: {
          include: {
            ownerships: {
              where: { isVerified: true },
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    let remindedAccountsCount = 0;
    let skippedAlreadyRemindedCount = 0;
    let notificationsSentCount = 0;

    // 35 days in seconds (past month-end to ensure once-per-month debouncing)
    const TTL_SECONDS = 35 * 24 * 60 * 60;

    for (const account of overdueAccounts) {
      const redisKey = `finance:reminder:${account.id}:${year}-${month}`;
      const alreadyReminded = await this.redisService.get(redisKey);

      if (alreadyReminded) {
        skippedAlreadyRemindedCount++;
        continue;
      }

      const verifiedOwnerships = account.unit?.ownerships || [];
      if (verifiedOwnerships.length === 0) {
        continue;
      }

      const debtAmount = Math.round(Math.abs(account.balance) * 100) / 100;
      const title = 'Напоминание о задолженности';
      const body = `По вашему лицевому счету №${account.accountNumber} имеется задолженность в размере ${debtAmount} ₸. Пожалуйста, оплатите счет.`;

      let sentToAtLeastOne = false;

      for (const ownership of verifiedOwnerships) {
        try {
          await this.notificationsService.sendToUser(ownership.userId, {
            title,
            body,
            data: {
              type: 'DEBT_REMINDER',
              accountId: account.id,
              accountNumber: account.accountNumber,
              debtAmount,
            },
          });
          notificationsSentCount++;
          sentToAtLeastOne = true;
        } catch (err: any) {
          this.logger.error(
            `[CRON] Failed to send overdue reminder to user ${ownership.userId} for account ${account.id}: ${err.message}`,
          );
        }
      }

      if (sentToAtLeastOne) {
        await this.redisService.set(redisKey, '1', TTL_SECONDS);
        remindedAccountsCount++;
      }
    }

    this.logger.log(
      `[CRON] Overdue reminders completed: ${overdueAccounts.length} accounts with debt, ${remindedAccountsCount} reminded, ${skippedAlreadyRemindedCount} skipped (already reminded), ${notificationsSentCount} push notifications sent.`,
    );

    return {
      overdueAccountsCount: overdueAccounts.length,
      remindedAccountsCount,
      skippedAlreadyRemindedCount,
      notificationsSentCount,
    };
  }
}
