import { Test, TestingModule } from '@nestjs/testing';
import {
  CommunityBoardSchedulerService,
  ARCHIVE_THRESHOLD_DAYS,
} from './community-board-scheduler.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ListingStatus } from '@prisma/client';

describe('CommunityBoardSchedulerService (Task 0057: Auto-archive stale community board listings)', () => {
  let service: CommunityBoardSchedulerService;
  let prismaMock: any;
  let notificationsServiceMock: any;

  beforeEach(async () => {
    prismaMock = {
      communityListing: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    notificationsServiceMock = {
      sendToUser: jest.fn().mockResolvedValue({ sent: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunityBoardSchedulerService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: notificationsServiceMock },
      ],
    }).compile();

    service = module.get<CommunityBoardSchedulerService>(CommunityBoardSchedulerService);
  });

  describe('handleStaleListingArchival', () => {
    it('запрашивает только ACTIVE объявления старше порога (createdAt < now - 90 дней)', async () => {
      prismaMock.communityListing.findMany.mockResolvedValue([]);

      const beforeRun = Date.now();
      await service.handleStaleListingArchival();
      const afterRun = Date.now();

      expect(prismaMock.communityListing.findMany).toHaveBeenCalledTimes(1);
      const callArgs = prismaMock.communityListing.findMany.mock.calls[0][0];

      expect(callArgs.where.status).toBe(ListingStatus.ACTIVE);

      const cutoff = callArgs.where.createdAt.lt.getTime();
      const expectedCutoff = ARCHIVE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

      expect(beforeRun - cutoff).toBeGreaterThanOrEqual(expectedCutoff - 50);
      expect(afterRun - cutoff).toBeLessThanOrEqual(expectedCutoff + 50);
    });

    it('объявление, созданное 91 день назад, архивируется; созданное 89 дней назад — нет (граница порога)', async () => {
      const now = Date.now();

      // Кандидаты, как если бы они реально существовали в БД с разным возрастом
      const candidates = [
        {
          id: 'listing-91d',
          tenantId: 'tenant-1',
          authorId: 'author-1',
          title: 'Продам диван',
          createdAt: new Date(now - 91 * 24 * 60 * 60 * 1000),
        },
        {
          id: 'listing-89d',
          tenantId: 'tenant-1',
          authorId: 'author-2',
          title: 'Отдам книги',
          createdAt: new Date(now - 89 * 24 * 60 * 60 * 1000),
        },
      ];

      // Имитируем реальную Prisma-фильтрацию по where.createdAt.lt, применяя её
      // к настоящим объектам-кандидатам с разным возрастом — не подгоняем результат вручную.
      prismaMock.communityListing.findMany.mockImplementation(({ where }: any) => {
        const cutoff = where.createdAt.lt.getTime();
        return Promise.resolve(
          candidates.filter((c) => c.createdAt.getTime() < cutoff),
        );
      });

      const summary = await service.handleStaleListingArchival();

      expect(summary.listingsChecked).toBe(1);
      expect(summary.listingsArchived).toBe(1);
      expect(prismaMock.communityListing.update).toHaveBeenCalledTimes(1);
      expect(prismaMock.communityListing.update).toHaveBeenCalledWith({
        where: { id: 'listing-91d' },
        data: { status: ListingStatus.ARCHIVED },
      });
      expect(notificationsServiceMock.sendToUser).toHaveBeenCalledWith(
        'author-1',
        expect.anything(),
      );
      expect(notificationsServiceMock.sendToUser).not.toHaveBeenCalledWith(
        'author-2',
        expect.anything(),
      );
    });

    it('CLOSED и REMOVED объявления старше 90 дней никогда не запрашиваются и не архивируются', async () => {
      prismaMock.communityListing.findMany.mockResolvedValue([]);

      await service.handleStaleListingArchival();

      // Единственный статус, участвующий в фильтре — ACTIVE
      expect(prismaMock.communityListing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: ListingStatus.ACTIVE,
          }),
        }),
      );
      expect(prismaMock.communityListing.update).not.toHaveBeenCalled();
    });

    it('автор получает push-уведомление с названием своего объявления через sendToUser', async () => {
      const listing = {
        id: 'listing-1',
        tenantId: 'tenant-1',
        authorId: 'author-42',
        title: 'Отдам котёнка в добрые руки',
      };

      prismaMock.communityListing.findMany.mockResolvedValue([listing]);

      await service.handleStaleListingArchival();

      expect(notificationsServiceMock.sendToUser).toHaveBeenCalledWith(
        'author-42',
        expect.objectContaining({
          body: expect.stringContaining('Отдам котёнка в добрые руки'),
          data: expect.objectContaining({
            type: 'COMMUNITY_LISTING_ARCHIVED',
            listingId: 'listing-1',
          }),
        }),
      );
    });

    it('изоляция ошибок: сбой архивации/уведомления для одного объявления не блокирует обработку остальных', async () => {
      const failingListing = {
        id: 'listing-fail',
        tenantId: 'tenant-1',
        authorId: 'author-fail',
        title: 'Объявление 1',
      };
      const successListing = {
        id: 'listing-ok',
        tenantId: 'tenant-1',
        authorId: 'author-ok',
        title: 'Объявление 2',
      };

      prismaMock.communityListing.findMany.mockResolvedValue([
        failingListing,
        successListing,
      ]);

      prismaMock.communityListing.update
        .mockRejectedValueOnce(new Error('DB write conflict'))
        .mockResolvedValueOnce({});

      const summary = await service.handleStaleListingArchival();

      expect(summary.listingsChecked).toBe(2);
      expect(summary.listingsArchived).toBe(1);
      expect(notificationsServiceMock.sendToUser).toHaveBeenCalledTimes(1);
      expect(notificationsServiceMock.sendToUser).toHaveBeenCalledWith(
        'author-ok',
        expect.anything(),
      );
    });

    it('безопасно обрабатывает сбой запроса к Prisma', async () => {
      prismaMock.communityListing.findMany.mockRejectedValue(new Error('DB connection reset'));

      const summary = await service.handleStaleListingArchival();

      expect(summary.listingsChecked).toBe(0);
      expect(summary.listingsArchived).toBe(0);
      expect(prismaMock.communityListing.update).not.toHaveBeenCalled();
    });
  });
});
