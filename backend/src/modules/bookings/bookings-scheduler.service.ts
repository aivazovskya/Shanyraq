import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RedisService } from '../../redis/redis.service';
import { BookingStatus } from '@prisma/client';

export interface BookingRemindersSummary {
  bookingsChecked: number;
  remindersSent: number;
  skippedAlreadyReminded: number;
}

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
}
