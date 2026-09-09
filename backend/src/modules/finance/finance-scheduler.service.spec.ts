import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import {
  FinanceSchedulerService,
  getAlmatyCurrentPeriod,
} from './finance-scheduler.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FinanceService } from './finance.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RedisService } from '../../redis/redis.service';

describe('FinanceSchedulerService', () => {
  let schedulerService: FinanceSchedulerService;
  let prismaMock: any;
  let financeServiceMock: any;
  let notificationsServiceMock: any;
  let redisServiceMock: any;

  beforeEach(async () => {
    prismaMock = {
      tenant: {
        findMany: jest.fn(),
      },
      personalAccount: {
        findMany: jest.fn(),
      },
    };

    financeServiceMock = {
      generateCharges: jest.fn(),
    };

    notificationsServiceMock = {
      sendToUser: jest.fn(),
    };

    redisServiceMock = {
      get: jest.fn(),
      set: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinanceSchedulerService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: FinanceService, useValue: financeServiceMock },
        { provide: NotificationsService, useValue: notificationsServiceMock },
        { provide: RedisService, useValue: redisServiceMock },
      ],
    }).compile();

    schedulerService = module.get<FinanceSchedulerService>(FinanceSchedulerService);
  });

  describe('getAlmatyCurrentPeriod', () => {
    it('correctly maps UTC date right before Almaty midnight into next month', () => {
      // 2026-08-31 20:00:00 UTC = 2026-09-01 01:00:00 Asia/Almaty (UTC+5)
      const date = new Date('2026-08-31T20:00:00.000Z');
      const period = getAlmatyCurrentPeriod(date);
      expect(period).toEqual({ year: 2026, month: 9 });
    });

    it('correctly maps date in December to new year if across midnight UTC', () => {
      // 2026-12-31 22:00:00 UTC = 2027-01-01 03:00:00 Asia/Almaty (UTC+5)
      const date = new Date('2026-12-31T22:00:00.000Z');
      const period = getAlmatyCurrentPeriod(date);
      expect(period).toEqual({ year: 2027, month: 1 });
    });
  });

  describe('handleMonthlyChargeGeneration', () => {
    it('processes all tenants and continues when one tenant fails (error isolation)', async () => {
      const mockTenants = [
        { id: 'tenant-1', name: 'ЖК Батыс' },
        { id: 'tenant-2', name: 'ЖК Сарыарка' },
        { id: 'tenant-3', name: 'ЖК Хан Шатыр' },
      ];
      prismaMock.tenant.findMany.mockResolvedValue(mockTenants);

      financeServiceMock.generateCharges
        .mockResolvedValueOnce({ createdCount: 10, skippedCount: 2 })
        .mockRejectedValueOnce(
          new BadRequestException({
            code: 'FINANCE.NO_ACTIVE_TARIFFS',
            message: 'В данном ЖК нет активных тарифов',
          }),
        )
        .mockResolvedValueOnce({ createdCount: 8, skippedCount: 0 });

      const result = await schedulerService.handleMonthlyChargeGeneration();

      // Verify all 3 tenants were attempted
      expect(financeServiceMock.generateCharges).toHaveBeenCalledTimes(3);
      expect(financeServiceMock.generateCharges).toHaveBeenNthCalledWith(
        1,
        'tenant-1',
        expect.objectContaining({ month: expect.any(Number), year: expect.any(Number) }),
      );
      expect(financeServiceMock.generateCharges).toHaveBeenNthCalledWith(
        2,
        'tenant-2',
        expect.objectContaining({ month: expect.any(Number), year: expect.any(Number) }),
      );
      expect(financeServiceMock.generateCharges).toHaveBeenNthCalledWith(
        3,
        'tenant-3',
        expect.objectContaining({ month: expect.any(Number), year: expect.any(Number) }),
      );

      // Verify summary output
      expect(result).toEqual({
        totalTenants: 3,
        processedCount: 2,
        failedCount: 1,
        totalCreated: 18,
        totalSkipped: 2,
      });
    });

    it('handles empty tenant list gracefully', async () => {
      prismaMock.tenant.findMany.mockResolvedValue([]);

      const result = await schedulerService.handleMonthlyChargeGeneration();

      expect(financeServiceMock.generateCharges).not.toHaveBeenCalled();
      expect(result).toEqual({
        totalTenants: 0,
        processedCount: 0,
        failedCount: 0,
        totalCreated: 0,
        totalSkipped: 0,
      });
    });
  });

  describe('handleOverdueReminders', () => {
    it('sends push to verified residents for accounts with balance < 0 and sets Redis debounce key', async () => {
      const { year, month } = getAlmatyCurrentPeriod();

      const mockOverdueAccounts = [
        {
          id: 'acc-1',
          accountNumber: 'ACC-BLOKA-101-ABCD12',
          balance: -15000,
          unit: {
            id: 'unit-1',
            ownerships: [
              {
                userId: 'user-resident-1',
                isVerified: true,
                user: { id: 'user-resident-1', firstName: 'Азамат' },
              },
            ],
          },
        },
      ];

      prismaMock.personalAccount.findMany.mockResolvedValue(mockOverdueAccounts);
      redisServiceMock.get.mockResolvedValue(null); // not yet reminded
      notificationsServiceMock.sendToUser.mockResolvedValue({ sent: 1 });
      redisServiceMock.set.mockResolvedValue('OK');

      const result = await schedulerService.handleOverdueReminders();

      // Prisma queried only negative balances
      expect(prismaMock.personalAccount.findMany).toHaveBeenCalledWith({
        where: { balance: { lt: 0 } },
        include: {
          unit: {
            include: {
              ownerships: {
                where: { isVerified: true },
                include: { user: true },
              },
            },
          },
        },
      });

      // Redis debounce checked
      const expectedKey = `finance:reminder:acc-1:${year}-${month}`;
      expect(redisServiceMock.get).toHaveBeenCalledWith(expectedKey);

      // Push sent with correct details
      expect(notificationsServiceMock.sendToUser).toHaveBeenCalledWith('user-resident-1', {
        title: 'Напоминание о задолженности',
        body: expect.stringContaining('15000 ₸'),
        data: {
          type: 'DEBT_REMINDER',
          accountId: 'acc-1',
          accountNumber: 'ACC-BLOKA-101-ABCD12',
          debtAmount: 15000,
        },
      });

      // Redis debounce set with 35-day TTL (3,024,000 seconds)
      expect(redisServiceMock.set).toHaveBeenCalledWith(expectedKey, '1', 35 * 24 * 60 * 60);

      expect(result).toEqual({
        overdueAccountsCount: 1,
        remindedAccountsCount: 1,
        skippedAlreadyRemindedCount: 0,
        notificationsSentCount: 1,
      });
    });

    it('skips account if already reminded this month via Redis debounce', async () => {
      const { year, month } = getAlmatyCurrentPeriod();

      const mockOverdueAccounts = [
        {
          id: 'acc-already-reminded',
          accountNumber: 'ACC-BLOKB-202-XYZ789',
          balance: -8500,
          unit: {
            id: 'unit-2',
            ownerships: [{ userId: 'user-resident-2', isVerified: true }],
          },
        },
      ];

      prismaMock.personalAccount.findMany.mockResolvedValue(mockOverdueAccounts);
      redisServiceMock.get.mockResolvedValue('1'); // already reminded

      const result = await schedulerService.handleOverdueReminders();

      const expectedKey = `finance:reminder:acc-already-reminded:${year}-${month}`;
      expect(redisServiceMock.get).toHaveBeenCalledWith(expectedKey);
      expect(notificationsServiceMock.sendToUser).not.toHaveBeenCalled();
      expect(redisServiceMock.set).not.toHaveBeenCalled();

      expect(result).toEqual({
        overdueAccountsCount: 1,
        remindedAccountsCount: 0,
        skippedAlreadyRemindedCount: 1,
        notificationsSentCount: 0,
      });
    });

    it('skips account without verified residents', async () => {
      const mockOverdueAccounts = [
        {
          id: 'acc-unverified',
          accountNumber: 'ACC-BLOKC-303-QWE456',
          balance: -5000,
          unit: {
            id: 'unit-3',
            ownerships: [], // no verified residents
          },
        },
      ];

      prismaMock.personalAccount.findMany.mockResolvedValue(mockOverdueAccounts);
      redisServiceMock.get.mockResolvedValue(null);

      const result = await schedulerService.handleOverdueReminders();

      expect(notificationsServiceMock.sendToUser).not.toHaveBeenCalled();
      expect(redisServiceMock.set).not.toHaveBeenCalled();
      expect(result).toEqual({
        overdueAccountsCount: 1,
        remindedAccountsCount: 0,
        skippedAlreadyRemindedCount: 0,
        notificationsSentCount: 0,
      });
    });
  });
});
