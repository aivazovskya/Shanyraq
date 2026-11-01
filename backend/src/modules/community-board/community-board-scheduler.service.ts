import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ListingStatus, ListingType } from '@prisma/client';

export interface CommunityBoardArchivalSummary {
  listingsChecked: number;
  listingsArchived: number;
}

export const ARCHIVE_THRESHOLD_DAYS = 90;

export interface AdExpirySummary {
  adsExpired: number;
}

export interface AdExpiringWarningSummary {
  adsWarned: number;
}

@Injectable()
export class CommunityBoardSchedulerService {
  private readonly logger = new Logger(CommunityBoardSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Ежедневная авто-архивация объявлений доски, которые остаются ACTIVE
   * дольше ARCHIVE_THRESHOLD_DAYS дней — держит доску актуальной без
   * ручного вмешательства модератора.
   */
  @Cron('0 4 * * *', { timeZone: 'Asia/Almaty' })
  async handleStaleListingArchival(): Promise<CommunityBoardArchivalSummary> {
    this.logger.log('[CRON] Starting community board stale listing archival check...');

    let listingsChecked = 0;
    let listingsArchived = 0;

    const cutoff = new Date(Date.now() - ARCHIVE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

    let listings: any[] = [];
    try {
      listings = await this.prisma.communityListing.findMany({
        where: {
          status: ListingStatus.ACTIVE,
          type: { not: ListingType.AD }, // у рекламы свой срок (adEndsAt)
          createdAt: { lt: cutoff },
        },
        select: {
          id: true,
          tenantId: true,
          authorId: true,
          title: true,
        },
      });
    } catch (err: any) {
      this.logger.error(
        `[CRON] Failed to fetch stale community board listings: ${err.message}`,
        err.stack,
      );
      return { listingsChecked, listingsArchived };
    }

    for (const listing of listings) {
      listingsChecked++;

      try {
        await this.prisma.communityListing.update({
          where: { id: listing.id },
          data: { status: ListingStatus.ARCHIVED },
        });

        await this.notificationsService.sendToUser(listing.authorId, {
          title: '📦 Объявление перемещено в архив',
          body: `Ваше объявление "${listing.title}" автоматически перемещено в архив как неактивное более ${ARCHIVE_THRESHOLD_DAYS} дней. Вы можете снова опубликовать его, отредактировав статус.`,
          data: {
            type: 'COMMUNITY_LISTING_ARCHIVED',
            listingId: listing.id,
          },
        });

        listingsArchived++;
      } catch (itemErr: any) {
        this.logger.error(
          `[CRON] Error archiving community board listing ${listing.id}: ${itemErr.message}`,
          itemErr.stack,
        );
      }
    }

    this.logger.log(
      `[CRON] Community board archival check completed: ${listingsChecked} checked, ${listingsArchived} archived.`,
    );

    return { listingsChecked, listingsArchived };
  }

  /**
   * Ежедневно предупреждает авторов активной рекламы за 3 дня до окончания срока.
   * Окно проверки: adEndsAt между now и now + 3 дня с проверкой уже отправленного
   * уведомления (COMMUNITY_AD_EXPIRING) для идемпотентности.
   */
  @Cron('15 4 * * *', { timeZone: 'Asia/Almaty' })
  async handleExpiringAds(): Promise<AdExpiringWarningSummary> {
    let adsWarned = 0;
    const now = new Date();
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    let ads: any[] = [];
    try {
      ads = await this.prisma.communityListing.findMany({
        where: {
          type: ListingType.AD,
          status: ListingStatus.ACTIVE,
          adEndsAt: {
            gte: now,
            lte: in3Days,
          },
        },
        select: { id: true, authorId: true, title: true, adEndsAt: true },
      });
    } catch (err: any) {
      this.logger.error(`[CRON] Failed to fetch expiring ads: ${err.message}`, err.stack);
      return { adsWarned };
    }

    for (const ad of ads) {
      try {
        const alreadyWarned = await this.prisma.notification.findFirst({
          where: {
            userId: ad.authorId,
            AND: [
              { data: { path: ['type'], equals: 'COMMUNITY_AD_EXPIRING' } },
              { data: { path: ['listingId'], equals: ad.id } },
            ],
          },
        });
        if (alreadyWarned) {
          continue;
        }

        await this.notificationsService.sendToUser(ad.authorId, {
          title: '⏳ Реклама закончится через 3 дня',
          body: `Срок размещения рекламы "${ad.title}" истекает через 3 дня. Чтобы продлить, подайте рекламу снова или обратитесь к администрации.`,
          data: {
            type: 'COMMUNITY_AD_EXPIRING',
            listingId: ad.id,
            adEndsAt: ad.adEndsAt ? ad.adEndsAt.toISOString() : undefined,
          },
        });
        adsWarned++;
      } catch (itemErr: any) {
        this.logger.error(
          `[CRON] Error sending expiring warning for ad ${ad.id}: ${itemErr.message}`,
          itemErr.stack,
        );
      }
    }

    this.logger.log(`[CRON] Expiring ad warnings processed: ${adsWarned}`);
    return { adsWarned };
  }

  /**
   * Ежедневно снимает рекламу с истёкшим сроком и сообщает автору.
   * Лента и так скрывает её по adEndsAt, крон только меняет статус.
   */
  @Cron('30 4 * * *', { timeZone: 'Asia/Almaty' })
  async handleExpiredAds(): Promise<AdExpirySummary> {
    let adsExpired = 0;

    let ads: any[] = [];
    try {
      ads = await this.prisma.communityListing.findMany({
        where: {
          type: ListingType.AD,
          status: ListingStatus.ACTIVE,
          adEndsAt: { lt: new Date() },
        },
        select: { id: true, authorId: true, title: true },
      });
    } catch (err: any) {
      this.logger.error(`[CRON] Failed to fetch expired ads: ${err.message}`, err.stack);
      return { adsExpired };
    }

    for (const ad of ads) {
      try {
        await this.prisma.communityListing.update({
          where: { id: ad.id },
          data: { status: ListingStatus.EXPIRED },
        });
        await this.notificationsService.sendToUser(ad.authorId, {
          title: '⏱ Срок рекламы закончился',
          body: `Размещение "${ad.title}" завершено. Чтобы продлить, подайте рекламу снова.`,
          data: { type: 'COMMUNITY_AD_EXPIRED', listingId: ad.id },
        });
        adsExpired++;
      } catch (itemErr: any) {
        this.logger.error(`[CRON] Error expiring ad ${ad.id}: ${itemErr.message}`, itemErr.stack);
      }
    }

    this.logger.log(`[CRON] Expired ads processed: ${adsExpired}`);
    return { adsExpired };
  }
}
