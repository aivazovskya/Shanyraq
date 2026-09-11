import { Test, TestingModule } from '@nestjs/testing';
import {
  PropertiesSchedulerService,
  VERIFICATION_STALE_THRESHOLD_DAYS,
} from './properties-scheduler.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RedisService } from '../../redis/redis.service';
import { UserRole } from '@prisma/client';

describe('PropertiesSchedulerService (Task 0060: Stale ownership verification reminders)', () => {
  let service: PropertiesSchedulerService;
  let prismaMock: any;
  let notificationsServiceMock: any;
  let redisServiceMock: any;
  let redisStore: Map<string, string>;

  beforeEach(async () => {
    redisStore = new Map();

    prismaMock = {
      unitOwnership: {
        findMany: jest.fn(),
      },
    };

    notificationsServiceMock = {
      sendToTenantRoles: jest.fn().mockResolvedValue({ sent: 2 }),
    };

    redisServiceMock = {
      get: jest.fn().mockImplementation((key: string) => Promise.resolve(redisStore.get(key) || null)),
      set: jest.fn().mockImplementation((key: string, val: string) => {
        redisStore.set(key, val);
        return Promise.resolve('OK');
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PropertiesSchedulerService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: notificationsServiceMock },
        { provide: RedisService, useValue: redisServiceMock },
      ],
    }).compile();

    service = module.get<PropertiesSchedulerService>(PropertiesSchedulerService);
  });

  describe('handleStaleVerificationReminders', () => {
    it('запрашивает только НЕ верифицированные заявки старше порога (createdAt < now - 5 дней)', async () => {
      prismaMock.unitOwnership.findMany.mockResolvedValue([]);

      const beforeRun = Date.now();
      await service.handleStaleVerificationReminders();
      const afterRun = Date.now();

      expect(prismaMock.unitOwnership.findMany).toHaveBeenCalledTimes(1);
      const callArgs = prismaMock.unitOwnership.findMany.mock.calls[0][0];

      expect(callArgs.where.isVerified).toBe(false);

      const cutoff = callArgs.where.createdAt.lt.getTime();
      const expectedAge = VERIFICATION_STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

      expect(beforeRun - cutoff).toBeGreaterThanOrEqual(expectedAge - 50);
      expect(afterRun - cutoff).toBeLessThanOrEqual(expectedAge + 50);
    });

    it('заявка, поданная 6 дней назад, триггерит напоминание; поданная 4 дня назад — нет (граница порога)', async () => {
      const now = Date.now();

      // Обе строки-кандидата: реальный Prisma-фильтр вернул бы только 6-дневную
      const candidates = [
        {
          id: 'ownership-6d',
          userId: 'user-1',
          unitId: 'unit-1',
          createdAt: new Date(now - 6 * 24 * 60 * 60 * 1000),
          unit: { unitNumber: '15', building: { tenantId: 'tenant-1', blockName: 'А' } },
          user: { firstName: 'Айбек', lastName: 'Нурланов' },
        },
        {
          id: 'ownership-4d',
          userId: 'user-2',
          unitId: 'unit-2',
          createdAt: new Date(now - 4 * 24 * 60 * 60 * 1000),
          unit: { unitNumber: '20', building: { tenantId: 'tenant-1', blockName: 'Б' } },
          user: { firstName: 'Динара', lastName: 'Серикова' },
        },
      ];

      prismaMock.unitOwnership.findMany.mockImplementation(({ where }: any) => {
        const cutoff = where.createdAt.lt.getTime();
        return Promise.resolve(candidates.filter((c) => c.createdAt.getTime() < cutoff));
      });

      const summary = await service.handleStaleVerificationReminders();

      expect(summary.pendingChecked).toBe(1);
      expect(summary.remindersSent).toBe(1);
      expect(notificationsServiceMock.sendToTenantRoles).toHaveBeenCalledTimes(1);
      expect(notificationsServiceMock.sendToTenantRoles).toHaveBeenCalledWith(
        'tenant-1',
        expect.anything(),
        expect.objectContaining({
          data: expect.objectContaining({ ownershipId: 'ownership-6d' }),
        }),
      );
    });

    it('верифицированные (isVerified: true) записи никогда не запрашиваются, независимо от возраста', async () => {
      prismaMock.unitOwnership.findMany.mockResolvedValue([]);

      await service.handleStaleVerificationReminders();

      expect(prismaMock.unitOwnership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isVerified: false }),
        }),
      );
    });

    it('напоминание отправляется строго ролям [HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER]', async () => {
      const now = Date.now();
      prismaMock.unitOwnership.findMany.mockResolvedValue([
        {
          id: 'ownership-1',
          createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
          unit: { unitNumber: '5', building: { tenantId: 'tenant-1', blockName: 'В' } },
          user: { firstName: 'Ерлан', lastName: 'Ержанов' },
        },
      ]);

      await service.handleStaleVerificationReminders();

      expect(notificationsServiceMock.sendToTenantRoles).toHaveBeenCalledWith(
        'tenant-1',
        [UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.DISPATCHER],
        expect.anything(),
      );
    });

    it('дедупликация через Redis: два последовательных прогона для одной и той же заявки отправляют ровно 1 напоминание', async () => {
      const now = Date.now();
      const staleOwnership = {
        id: 'ownership-dup',
        createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
        unit: { unitNumber: '7', building: { tenantId: 'tenant-1', blockName: 'Г' } },
        user: { firstName: 'Бакыт', lastName: 'Бакиров' },
      };

      prismaMock.unitOwnership.findMany.mockResolvedValue([staleOwnership]);

      const firstRun = await service.handleStaleVerificationReminders();
      expect(firstRun.remindersSent).toBe(1);
      expect(firstRun.skippedAlreadyReminded).toBe(0);
      expect(redisServiceMock.set).toHaveBeenCalledWith(
        'properties:verification-reminder:ownership-dup',
        '1',
        VERIFICATION_STALE_THRESHOLD_DAYS * 24 * 60 * 60,
      );

      const secondRun = await service.handleStaleVerificationReminders();
      expect(secondRun.remindersSent).toBe(0);
      expect(secondRun.skippedAlreadyReminded).toBe(1);
      expect(notificationsServiceMock.sendToTenantRoles).toHaveBeenCalledTimes(1);
    });

    it('изоляция ошибок: сбой отправки для одной заявки не блокирует обработку остальных', async () => {
      const now = Date.now();
      const failing = {
        id: 'ownership-fail',
        createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
        unit: { unitNumber: '1', building: { tenantId: 'tenant-1', blockName: 'A' } },
        user: { firstName: 'Fail', lastName: 'User' },
      };
      const success = {
        id: 'ownership-ok',
        createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
        unit: { unitNumber: '2', building: { tenantId: 'tenant-1', blockName: 'A' } },
        user: { firstName: 'Ok', lastName: 'User' },
      };

      prismaMock.unitOwnership.findMany.mockResolvedValue([failing, success]);

      notificationsServiceMock.sendToTenantRoles
        .mockRejectedValueOnce(new Error('FCM network failure'))
        .mockResolvedValueOnce({ sent: 2 });

      const summary = await service.handleStaleVerificationReminders();

      expect(summary.pendingChecked).toBe(2);
      expect(summary.remindersSent).toBe(1);
      expect(notificationsServiceMock.sendToTenantRoles).toHaveBeenCalledTimes(2);
    });

    it('безопасно обрабатывает сбой запроса к Prisma', async () => {
      prismaMock.unitOwnership.findMany.mockRejectedValue(new Error('DB connection reset'));

      const summary = await service.handleStaleVerificationReminders();

      expect(summary.pendingChecked).toBe(0);
      expect(summary.remindersSent).toBe(0);
      expect(notificationsServiceMock.sendToTenantRoles).not.toHaveBeenCalled();
    });
  });
});
