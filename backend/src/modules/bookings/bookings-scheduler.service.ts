import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RedisService } from '../../redis/redis.service';
import { BookingStatus, BookableResourceType, UserRole } from '@prisma/client';

export interface BookingRemindersSummary {
  bookingsChecked: number;
  remindersSent: number;
  skippedAlreadyReminded: number;
}

export interface GuestParkingCapacitySummary {
  tenantsChecked: number;
  tenantsFull: number;
  alertsSent: number;
}

const GUEST_PARKING_FULL_FLAG_TTL_SECONDS = 24 * 60 * 60; // safety-net TTL only

@Injectable()
export class BookingsSchedulerService {
  private readonly logger = new Logger(BookingsSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Cron check running every 5 minutes to send push reminders to residents
   * for confirmed bookings starting in approximately 30 minutes (25m - 35m window).
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleUpcomingBookingReminders(): Promise<BookingRemindersSummary> {
    this.logger.log('[CRON] Starting upcoming booking reminders check...');

    let bookingsChecked = 0;
    let remindersSent = 0;
    let skippedAlreadyReminded = 0;

    const TTL_SECONDS = 3600; // 1 hour debounce TTL

    const now = new Date();
    const windowStart = new Date(now.getTime() + 25 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 35 * 60 * 1000);

    let bookings: any[] = [];
    try {
      bookings = await this.prisma.booking.findMany({
        where: {
          status: BookingStatus.CONFIRMED,
          startTime: {
            gte: windowStart,
            lte: windowEnd,
          },
        },
        select: {
          id: true,
          resourceId: true,
          bookedById: true,
          startTime: true,
          endTime: true,
          resource: {
            select: {
              name: true,
            },
          },
        },
      });
    } catch (err: any) {
      this.logger.error(
        `[CRON] Failed to query upcoming bookings: ${err.message}`,
        err.stack,
      );
      return {
        bookingsChecked,
        remindersSent,
        skippedAlreadyReminded,
      };
    }

    for (const booking of bookings) {
      bookingsChecked++;

      try {
        const redisKey = `bookings:reminder:${booking.id}`;
        const alreadyReminded = await this.redisService.get(redisKey);
        if (alreadyReminded) {
          skippedAlreadyReminded++;
          continue;
        }

        const timeStr = new Intl.DateTimeFormat('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Almaty',
        }).format(new Date(booking.startTime));

        const resourceName = booking.resource?.name || 'Пространство';
        const title = '⏰ Скоро бронирование';
        const body = `${resourceName} — бронирование начинается в ${timeStr}.`;

        await this.notificationsService.sendToUser(booking.bookedById, {
          title,
          body,
          data: {
            type: 'BOOKING_UPCOMING_REMINDER',
            bookingId: booking.id,
            resourceId: booking.resourceId,
          },
        });

        await this.redisService.set(redisKey, '1', TTL_SECONDS);
        remindersSent++;
      } catch (itemErr: any) {
        this.logger.error(
          `[CRON] Error processing upcoming booking reminder for booking ${booking.id}: ${itemErr.message}`,
          itemErr.stack,
        );
      }
    }

    this.logger.log(
      `[CRON] Upcoming booking reminders check completed: ${bookingsChecked} checked, ${remindersSent} reminders sent, ${skippedAlreadyReminded} skipped (already reminded).`,
    );

    return {
      bookingsChecked,
      remindersSent,
      skippedAlreadyReminded,
    };
  }

  /**
   * Cron check running every 30 minutes: alerts SECURITY/DISPATCHER when
   * every active GUEST_PARKING resource of a tenant currently has a
   * CONFIRMED booking covering this instant (i.e. guest parking is full).
   * State-transition debounce via Redis — alerts once when it BECOMES
   * full, stays silent while it remains full, and can alert again after
   * recovering and becoming full a second time.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleGuestParkingCapacityCheck(): Promise<GuestParkingCapacitySummary> {
    this.logger.log('[CRON] Starting guest parking capacity check...');

    let tenantsChecked = 0;
    let tenantsFull = 0;
    let alertsSent = 0;

    const now = new Date();

    let resources: { id: string; tenantId: string }[] = [];
    try {
      resources = await this.prisma.bookableResource.findMany({
        where: {
          type: BookableResourceType.GUEST_PARKING,
          isActive: true,
        },
        select: { id: true, tenantId: true },
      });
    } catch (err: any) {
      this.logger.error(
        `[CRON] Failed to fetch guest parking resources: ${err.message}`,
        err.stack,
      );
      return { tenantsChecked, tenantsFull, alertsSent };
    }

    if (resources.length === 0) {
      return { tenantsChecked, tenantsFull, alertsSent };
    }

    const resourceIds = resources.map((r) => r.id);

    let occupiedBookings: { resourceId: string }[] = [];
    try {
      occupiedBookings = await this.prisma.booking.findMany({
        where: {
          resourceId: { in: resourceIds },
          status: BookingStatus.CONFIRMED,
          startTime: { lte: now },
          endTime: { gt: now },
        },
        select: { resourceId: true },
      });
    } catch (err: any) {
      this.logger.error(
        `[CRON] Failed to fetch active guest parking bookings: ${err.message}`,
        err.stack,
      );
      return { tenantsChecked, tenantsFull, alertsSent };
    }

    const occupiedResourceIds = new Set(occupiedBookings.map((b) => b.resourceId));

    const resourcesByTenant = new Map<string, string[]>();
    for (const resource of resources) {
      const list = resourcesByTenant.get(resource.tenantId) || [];
      list.push(resource.id);
      resourcesByTenant.set(resource.tenantId, list);
    }

    for (const [tenantId, tenantResourceIds] of resourcesByTenant.entries()) {
      tenantsChecked++;

      try {
        const isFull = tenantResourceIds.every((id) => occupiedResourceIds.has(id));
        const redisKey = `bookings:guest-parking-full:${tenantId}`;

        if (isFull) {
          tenantsFull++;

          const alreadyFlagged = await this.redisService.get(redisKey);
          if (alreadyFlagged) {
            continue;
          }

          await this.notificationsService.sendToTenantRoles(
            tenantId,
            [UserRole.SECURITY, UserRole.DISPATCHER],
            {
              title: '🅿️ Гостевой паркинг заполнен',
              body: `Все ${tenantResourceIds.length} мест для гостевого паркинга сейчас заняты по бронированию.`,
              data: {
                type: 'GUEST_PARKING_FULL',
                tenantId,
              },
            },
          );

          await this.redisService.set(redisKey, '1', GUEST_PARKING_FULL_FLAG_TTL_SECONDS);
          alertsSent++;
        } else {
          const alreadyFlagged = await this.redisService.get(redisKey);
          if (alreadyFlagged) {
            await this.redisService.del(redisKey);
          }
        }
      } catch (tenantErr: any) {
        this.logger.error(
          `[CRON] Error processing guest parking capacity check for tenant ${tenantId}: ${tenantErr.message}`,
          tenantErr.stack,
        );
      }
    }

    this.logger.log(
      `[CRON] Guest parking capacity check completed: ${tenantsChecked} tenants checked, ${tenantsFull} full, ${alertsSent} alerts sent.`,
    );

    return { tenantsChecked, tenantsFull, alertsSent };
  }
}
