import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ListingStatus } from '@prisma/client';

export interface CommunityBoardArchivalSummary {
  listingsChecked: number;
  listingsArchived: number;
}

export const ARCHIVE_THRESHOLD_DAYS = 90;

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
}
