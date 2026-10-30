import { Test, TestingModule } from '@nestjs/testing';
import { ListingStatus, ListingType } from '@prisma/client';
import { CommunityBoardSchedulerService } from './community-board-scheduler.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('CommunityBoardSchedulerService: реклама', () => {
  let service: CommunityBoardSchedulerService;
  let prismaMock: any;
  let notificationsMock: any;

  beforeEach(async () => {
    prismaMock = { communityListing: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() } };
    notificationsMock = { sendToUser: jest.fn().mockResolvedValue({ sent: 1 }) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityBoardSchedulerService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: notificationsMock },
      ],
    }).compile();
    service = module.get(CommunityBoardSchedulerService);
  });

  it('90-дневная архивация не трогает рекламу', async () => {
    await service.handleStaleListingArchival();
    const where = prismaMock.communityListing.findMany.mock.calls[0][0].where;
    expect(where.type).toEqual({ not: ListingType.AD });
  });

  it('handleExpiredAds переводит просроченную рекламу в EXPIRED и уведомляет автора', async () => {
    prismaMock.communityListing.findMany.mockResolvedValue([
      { id: 'ad-1', authorId: 'u1', title: 'Кофейня' },
      { id: 'ad-2', authorId: 'u2', title: 'Прачечная' },
    ]);
    const summary = await service.handleExpiredAds();

    const where = prismaMock.communityListing.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ type: ListingType.AD, status: ListingStatus.ACTIVE });
    expect(where.adEndsAt.lt).toBeInstanceOf(Date);
    expect(prismaMock.communityListing.update).toHaveBeenCalledWith({
      where: { id: 'ad-1' },
      data: { status: ListingStatus.EXPIRED },
    });
    expect(notificationsMock.sendToUser).toHaveBeenCalledTimes(2);
    expect(summary.adsExpired).toBe(2);
  });

  it('ошибка на одной рекламе не останавливает остальные', async () => {
    prismaMock.communityListing.findMany.mockResolvedValue([
      { id: 'bad', authorId: 'u1', title: 'x' },
      { id: 'ok', authorId: 'u2', title: 'y' },
    ]);
    prismaMock.communityListing.update.mockRejectedValueOnce(new Error('db'));
    const summary = await service.handleExpiredAds();
    expect(summary.adsExpired).toBe(1);
  });
});
