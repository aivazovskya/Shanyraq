import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RedisService } from '../../redis/redis.service';
import { RequestCategory, RequestPriority, RequestStatus, UserRole } from '@prisma/client';

export interface ServiceRequestSlaSummary {
  requestsChecked: number;
  requestsOverdue: number;
  remindersSent: number;
  skippedAlreadyReminded: number;
}

export const SLA_THRESHOLD_HOURS: Record<RequestPriority, number> = {
  [RequestPriority.EMERGENCY]: 4,
  [RequestPriority.HIGH]: 24,
  [RequestPriority.MEDIUM]: 72,
  [RequestPriority.LOW]: 168,
};

export const PRIORITY_NAMES: Record<RequestPriority, string> = {
  [RequestPriority.EMERGENCY]: 'Аварийный',
  [RequestPriority.HIGH]: 'Высокий',
  [RequestPriority.MEDIUM]: 'Средний',
  [RequestPriority.LOW]: 'Низкий',
};

export const CATEGORY_NAMES: Record<RequestCategory, string> = {
  [RequestCategory.PLUMBING]: 'Сантехника',
  [RequestCategory.ELECTRICAL]: 'Электрика',
  [RequestCategory.ELEVATOR]: 'Лифт',
  [RequestCategory.HEATING]: 'Отопление',
  [RequestCategory.YARD_TERRITORY]: 'Дворовая территория',
  [RequestCategory.INTERCOM_ACCESS]: 'Домофон и СКУД',
  [RequestCategory.CLEANING]: 'Уборка',
  [RequestCategory.OTHER]: 'Другое',
};

@Injectable()
export class ServiceRequestsSlaSchedulerService {
  private readonly logger = new Logger(ServiceRequestsSlaSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Hourly cron sweep alerting staff about stuck service requests
   * that have remained inactive beyond their priority-specific SLA threshold.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleServiceRequestSlaCheck(): Promise<ServiceRequestSlaSummary> {
    this.logger.log('[CRON] Starting service requests SLA check...');

    let requestsChecked = 0;
    let requestsOverdue = 0;
    let remindersSent = 0;
    let skippedAlreadyReminded = 0;

    let requests: any[] = [];
    try {
      requests = await this.prisma.serviceRequest.findMany({
        where: {
          status: {
            in: [
              RequestStatus.PENDING,
              RequestStatus.ASSIGNED,
              RequestStatus.IN_PROGRESS,
            ],
          },
        },
        include: {
          unit: {
            select: {
              unitNumber: true,
            },
          },
          assignee: {
            select: {
              id: true,
            },
          },
        },
      });
    } catch (err: any) {
      this.logger.error(
        `[CRON] Failed to fetch service requests for SLA check: ${err.message}`,
        err.stack,
      );
      return {
        requestsChecked,
        requestsOverdue,
        remindersSent,
        skippedAlreadyReminded,
      };
    }

    const now = new Date();

    for (const request of requests) {
      requestsChecked++;

      try {
        const thresholdHours =
          SLA_THRESHOLD_HOURS[request.priority as RequestPriority] ?? 72;
        const elapsedMs = now.getTime() - new Date(request.updatedAt).getTime();
        const elapsedHours = elapsedMs / (1000 * 60 * 60);

        if (elapsedHours < thresholdHours) {
          continue;
        }

        requestsOverdue++;

        const redisKey = `service-requests:sla:${request.id}`;
        const alreadyReminded = await this.redisService.get(redisKey);
        if (alreadyReminded) {
          skippedAlreadyReminded++;
          continue;
        }

        const elapsedWholeHours = Math.floor(elapsedHours);
        const durationStr =
          elapsedWholeHours >= 48
            ? `${Math.floor(elapsedWholeHours / 24)} дн.`
            : `${elapsedWholeHours} ч.`;

        const catName =
          CATEGORY_NAMES[request.category as RequestCategory] || request.category;
        const prioName =
          PRIORITY_NAMES[request.priority as RequestPriority] || request.priority;
        const unitPart = request.unit?.unitNumber
          ? `кв. №${request.unit.unitNumber}`
          : 'помещение';

        const title = `⏰ Заявка №${request.id.slice(0, 8)} требует внимания`;
        const body = `Заявка (${unitPart}, ${catName}, приоритет: ${prioName}) находится без движения ${durationStr}.`;

        const payload = {
          title,
          body,
          data: {
            type: 'SERVICE_REQUEST_SLA_BREACH',
            requestId: request.id,
            priority: request.priority,
          },
        };

        if (request.assigneeId) {
          await this.notificationsService.sendToUser(request.assigneeId, payload);
        } else {
          await this.notificationsService.sendToTenantRoles(
            request.tenantId,
            [UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.DISPATCHER],
            payload,
          );
        }

        const ttlSeconds = thresholdHours * 3600;
        await this.redisService.set(redisKey, '1', ttlSeconds);
        remindersSent++;
      } catch (reqErr: any) {
        this.logger.error(
          `[CRON] Error processing SLA reminder for request ${request.id}: ${reqErr.message}`,
          reqErr.stack,
        );
      }
    }

    this.logger.log(
      `[CRON] Service requests SLA check completed: ${requestsChecked} checked, ${requestsOverdue} overdue, ${remindersSent} reminders sent, ${skippedAlreadyReminded} skipped (already reminded).`,
    );

    return {
      requestsChecked,
      requestsOverdue,
      remindersSent,
      skippedAlreadyReminded,
    };
  }
}
