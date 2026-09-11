import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RedisService } from '../../redis/redis.service';
import { MeetingStatus, OwnershipType } from '@prisma/client';

export interface VotingRemindersSummary {
  meetingsChecked: number;
  unitsIncomplete: number;
  remindersSent: number;
  skippedAlreadyReminded: number;
}

@Injectable()
export class VotingsSchedulerService {
  private readonly logger = new Logger(VotingsSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Daily cron sending push reminders to owners who have not completed voting on all agenda items
   * for an active meeting whose deadline falls within the next 48 hours.
   * Runs at 09:00 daily in Asia/Almaty timezone.
   */
  @Cron('0 9 * * *', { timeZone: 'Asia/Almaty' })
  async handleVotingDeadlineReminders(): Promise<VotingRemindersSummary> {
    const now = new Date();
    const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    this.logger.log(
      `[CRON] Starting voting deadline reminders check (window: ${now.toISOString()} - ${in48Hours.toISOString()})...`,
    );

    let meetingsChecked = 0;
    let unitsIncomplete = 0;
    let remindersSent = 0;
    let skippedAlreadyReminded = 0;

    // 30 days debounce TTL in seconds to outlast any active meeting
    const TTL_SECONDS = 30 * 24 * 60 * 60;

    let meetings: any[] = [];
    try {
      meetings = await this.prisma.meeting.findMany({
        where: {
          status: MeetingStatus.ACTIVE,
          endDate: {
            gte: now,
            lte: in48Hours,
          },
        },
        include: {
          agendaItems: {
            select: { id: true },
          },
        },
      });
    } catch (err: any) {
      this.logger.error(`[CRON] Failed to query active meetings nearing deadline: ${err.message}`, err.stack);
      return { meetingsChecked, unitsIncomplete, remindersSent, skippedAlreadyReminded };
    }

    for (const meeting of meetings) {
      meetingsChecked++;

      const totalAgendaItems = meeting.agendaItems?.length || 0;
      if (totalAgendaItems === 0) {
        continue;
      }

      const agendaItemIds = meeting.agendaItems.map((item: { id: string }) => item.id);

      try {
        const units = await this.prisma.unit.findMany({
          where: {
            building: {
              tenantId: meeting.tenantId,
            },
            ownerships: {
              some: {
                isVerified: true,
                ownershipType: OwnershipType.OWNER,
              },
            },
          },
          include: {
            ownerships: {
              where: {
                isVerified: true,
                ownershipType: OwnershipType.OWNER,
              },
              select: {
                userId: true,
              },
            },
            votes: {
              where: {
                agendaItemId: {
                  in: agendaItemIds,
                },
              },
              select: {
                agendaItemId: true,
              },
            },
          },
        });

        for (const unit of units) {
          const votedAgendaItemIds = new Set(unit.votes.map((v: { agendaItemId: string }) => v.agendaItemId));

          if (votedAgendaItemIds.size < totalAgendaItems) {
            unitsIncomplete++;

            for (const ownership of unit.ownerships) {
              const redisKey = `voting:reminder:${meeting.id}:${ownership.userId}`;

              try {
                const alreadyReminded = await this.redisService.get(redisKey);
                if (alreadyReminded) {
                  skippedAlreadyReminded++;
                  continue;
                }

                const msRemaining = meeting.endDate.getTime() - Date.now();
                const hoursRemaining = Math.max(1, Math.round(msRemaining / (1000 * 60 * 60)));

                await this.notificationsService.sendToUser(ownership.userId, {
                  title: `Напоминание о голосовании: «${meeting.title}»`,
                  body: `Голосование по собранию «${meeting.title}» завершается через ${hoursRemaining} ч. Пожалуйста, сделайте свой выбор.`,
                  data: {
                    type: 'VOTING_REMINDER',
                    meetingId: meeting.id,
                  },
                });

                await this.redisService.set(redisKey, '1', TTL_SECONDS);
                remindersSent++;
              } catch (userErr: any) {
                this.logger.error(
                  `[CRON] Failed to send voting reminder to user ${ownership.userId} for meeting ${meeting.id}: ${userErr.message}`,
                  userErr.stack,
                );
              }
            }
          }
        }
      } catch (meetingErr: any) {
        this.logger.error(
          `[CRON] Failed processing units for meeting ${meeting.id} (${meeting.title}): ${meetingErr.message}`,
          meetingErr.stack,
        );
      }
    }

    this.logger.log(
      `[CRON] Voting deadline reminders completed: ${meetingsChecked} meetings checked, ${unitsIncomplete} incomplete units, ${remindersSent} reminders sent, ${skippedAlreadyReminded} skipped (already reminded).`,
    );

    return {
      meetingsChecked,
      unitsIncomplete,
      remindersSent,
      skippedAlreadyReminded,
    };
  }
}
