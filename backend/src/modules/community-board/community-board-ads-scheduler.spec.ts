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
    prismaMock = {
      communityListing: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      notification: { findFirst: jest.fn().mockResolvedValue(null) },
    };
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

  it('ошибка на одной рекламе не останавливает остальные при handleExpiredAds', async () => {
    prismaMock.communityListing.findMany.mockResolvedValue([
      { id: 'bad', authorId: 'u1', title: 'x' },
      { id: 'ok', authorId: 'u2', title: 'y' },
    ]);
    prismaMock.communityListing.update.mockRejectedValueOnce(new Error('db'));
    const summary = await service.handleExpiredAds();
    expect(summary.adsExpired).toBe(1);
  });

  describe('handleExpiringAds (предупреждение за 3 дня)', () => {
    it('находит активную рекламу в расширенном окне [now, now+3d] и отправляет предупреждение авторам (COMMUNITY_AD_EXPIRING)', async () => {
      const expDate1 = new Date(Date.now() + 2.5 * 24 * 60 * 60 * 1000);
      const expDate2 = new Date(Date.now() + 2.8 * 24 * 60 * 60 * 1000);
      prismaMock.communityListing.findMany.mockResolvedValue([
        { id: 'ad-exp-1', authorId: 'u1', title: 'Салон красоты', adEndsAt: expDate1 },
        { id: 'ad-exp-2', authorId: 'u2', title: 'Автомойка', adEndsAt: expDate2 },
      ]);

      const summary = await service.handleExpiringAds();

      const where = prismaMock.communityListing.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        type: ListingType.AD,
        status: ListingStatus.ACTIVE,
      });
      expect(where.adEndsAt.gte).toBeInstanceOf(Date);
      expect(where.adEndsAt.lte).toBeInstanceOf(Date);

      // Проверка разницы между границами окна: около 3 дней (72 часа)
      const diffMs = where.adEndsAt.lte.getTime() - where.adEndsAt.gte.getTime();
      expect(Math.round(diffMs / 86400000)).toBe(3);

      expect(notificationsMock.sendToUser).toHaveBeenCalledTimes(2);
      expect(notificationsMock.sendToUser).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({
          title: expect.stringContaining('Реклама закончится через 3 дня'),
          body: expect.stringContaining('Салон красоты'),
          data: expect.objectContaining({
            type: 'COMMUNITY_AD_EXPIRING',
            listingId: 'ad-exp-1',
            adEndsAt: expDate1.toISOString(),
          }),
        }),
      );
      expect(summary.adsWarned).toBe(2);
    });

    it('идемпотентность: не отправляет предупреждение повторно, если уведомление уже было создано (expiring warning not sent twice)', async () => {
      const expDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      prismaMock.communityListing.findMany.mockResolvedValue([
        { id: 'ad-already-warned', authorId: 'u1', title: 'Кафе', adEndsAt: expDate },
      ]);
      prismaMock.notification.findFirst.mockResolvedValue({
        id: 'notif-1',
        userId: 'u1',
        data: { type: 'COMMUNITY_AD_EXPIRING', listingId: 'ad-already-warned' },
      });

      const summary = await service.handleExpiringAds();
      expect(prismaMock.notification.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'u1',
          AND: [
            { data: { path: ['type'], equals: 'COMMUNITY_AD_EXPIRING' } },
            { data: { path: ['listingId'], equals: 'ad-already-warned' } },
          ],
        },
      });
      expect(notificationsMock.sendToUser).not.toHaveBeenCalled();
      expect(summary.adsWarned).toBe(0);
    });

    it('ошибка отправки одному пользователю не прерывает отправку остальным', async () => {
      prismaMock.communityListing.findMany.mockResolvedValue([
        { id: 'ad-bad', authorId: 'u-fail', title: 'Плохая реклама', adEndsAt: new Date() },
        { id: 'ad-ok', authorId: 'u-ok', title: 'Хорошая реклама', adEndsAt: new Date() },
      ]);
      notificationsMock.sendToUser.mockRejectedValueOnce(new Error('Push token expired'));

      const summary = await service.handleExpiringAds();
      expect(notificationsMock.sendToUser).toHaveBeenCalledTimes(2);
      expect(summary.adsWarned).toBe(1);
    });

    it('сбой БД при выборке возвращает 0 обработанных и не бросает исключение', async () => {
      prismaMock.communityListing.findMany.mockRejectedValueOnce(new Error('DB unreachable'));
      const summary = await service.handleExpiringAds();
      expect(summary.adsWarned).toBe(0);
    });
  });
});
