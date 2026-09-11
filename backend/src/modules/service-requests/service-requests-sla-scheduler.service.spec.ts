import { Test, TestingModule } from '@nestjs/testing';
import {
  ServiceRequestsSlaSchedulerService,
  SLA_THRESHOLD_HOURS,
} from './service-requests-sla-scheduler.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RedisService } from '../../redis/redis.service';
import { RequestCategory, RequestPriority, RequestStatus, UserRole } from '@prisma/client';

describe('ServiceRequestsSlaSchedulerService (Task 0052: SLA reminders for stuck service requests)', () => {
  let service: ServiceRequestsSlaSchedulerService;
  let prismaMock: any;
  let notificationsServiceMock: any;
  let redisServiceMock: any;
  let redisStore: Map<string, string>;

  beforeEach(async () => {
    redisStore = new Map();

    prismaMock = {
      serviceRequest: {
        findMany: jest.fn(),
      },
    };

    notificationsServiceMock = {
      sendToUser: jest.fn().mockResolvedValue({ sent: 1 }),
      sendToTenantRoles: jest.fn().mockResolvedValue({ sent: 1 }),
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
        ServiceRequestsSlaSchedulerService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: notificationsServiceMock },
        { provide: RedisService, useValue: redisServiceMock },
      ],
    }).compile();

    service = module.get<ServiceRequestsSlaSchedulerService>(
      ServiceRequestsSlaSchedulerService,
    );
  });

  describe('handleServiceRequestSlaCheck', () => {
    it('запрашивает из БД только незавершенные заявки (PENDING, ASSIGNED, IN_PROGRESS), исключая RESOLVED, REJECTED, CLOSED', async () => {
      prismaMock.serviceRequest.findMany.mockResolvedValue([]);

      await service.handleServiceRequestSlaCheck();

      expect(prismaMock.serviceRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: {
              in: [
                RequestStatus.PENDING,
                RequestStatus.ASSIGNED,
                RequestStatus.IN_PROGRESS,
              ],
            },
          },
        }),
      );
    });

    it('заявка в статусе PENDING старше порога приоритета триггерит напоминание, а младше порога — нет', async () => {
      const now = Date.now();
      // HIGH threshold = 24h
      const staleHighRequest = {
        id: 'req-stale-high',
        tenantId: 'tenant-1',
        title: 'Течет труба',
        category: RequestCategory.PLUMBING,
        status: RequestStatus.PENDING,
        priority: RequestPriority.HIGH,
        assigneeId: null,
        updatedAt: new Date(now - 25 * 60 * 60 * 1000), // 25h stale (exceeds 24h)
        unit: { unitNumber: '101' },
      };

      const freshHighRequest = {
        id: 'req-fresh-high',
        tenantId: 'tenant-1',
        title: 'Засор раковины',
        category: RequestCategory.PLUMBING,
        status: RequestStatus.PENDING,
        priority: RequestPriority.HIGH,
        assigneeId: null,
        updatedAt: new Date(now - 10 * 60 * 60 * 1000), // 10h stale (below 24h)
        unit: { unitNumber: '102' },
      };

      prismaMock.serviceRequest.findMany.mockResolvedValue([
        staleHighRequest,
        freshHighRequest,
      ]);

      const summary = await service.handleServiceRequestSlaCheck();

      expect(summary.requestsChecked).toBe(2);
      expect(summary.requestsOverdue).toBe(1);
      expect(summary.remindersSent).toBe(1);
      expect(notificationsServiceMock.sendToTenantRoles).toHaveBeenCalledTimes(1);
      expect(notificationsServiceMock.sendToTenantRoles).toHaveBeenCalledWith(
        'tenant-1',
        expect.anything(),
        expect.objectContaining({
          data: expect.objectContaining({
            requestId: 'req-stale-high',
            priority: RequestPriority.HIGH,
          }),
        }),
      );
    });

    it('по-приоритетные пороги соблюдаются: EMERGENCY (5ч > 4ч) напоминает, а LOW (5ч < 168ч) пропускается в том же прогоне', async () => {
      const now = Date.now();
      const fiveHoursAgo = new Date(now - 5 * 60 * 60 * 1000);

      const emergencyRequest = {
        id: 'req-emergency-5h',
        tenantId: 'tenant-1',
        title: 'Затопление шахты лифта',
        category: RequestCategory.ELEVATOR,
        status: RequestStatus.PENDING,
        priority: RequestPriority.EMERGENCY,
        assigneeId: null,
        updatedAt: fiveHoursAgo,
        unit: { unitNumber: '50' },
      };

      const lowRequest = {
        id: 'req-low-5h',
        tenantId: 'tenant-1',
        title: 'Замена лампочки в тамбуре',
        category: RequestCategory.ELECTRICAL,
        status: RequestStatus.PENDING,
        priority: RequestPriority.LOW,
        assigneeId: null,
        updatedAt: fiveHoursAgo,
        unit: { unitNumber: '51' },
      };

      prismaMock.serviceRequest.findMany.mockResolvedValue([
        emergencyRequest,
        lowRequest,
      ]);

      const summary = await service.handleServiceRequestSlaCheck();

      expect(summary.requestsChecked).toBe(2);
      expect(summary.requestsOverdue).toBe(1);
      expect(summary.remindersSent).toBe(1);

      expect(notificationsServiceMock.sendToTenantRoles).toHaveBeenCalledWith(
        'tenant-1',
        expect.anything(),
        expect.objectContaining({
          data: expect.objectContaining({
            requestId: 'req-emergency-5h',
            priority: RequestPriority.EMERGENCY,
          }),
        }),
      );
    });

    it('назначенная заявка с assigneeId отправляет напоминание конкретно исполнителю через sendToUser', async () => {
      const now = Date.now();
      const assignedRequest = {
        id: 'req-assigned-1',
        tenantId: 'tenant-1',
        title: 'Ремонт домофона',
        category: RequestCategory.INTERCOM_ACCESS,
        status: RequestStatus.IN_PROGRESS,
        priority: RequestPriority.MEDIUM,
        assigneeId: 'master-user-777',
        updatedAt: new Date(now - 75 * 60 * 60 * 1000), // 75h > 72h
        unit: { unitNumber: '12' },
      };

      prismaMock.serviceRequest.findMany.mockResolvedValue([assignedRequest]);

      const summary = await service.handleServiceRequestSlaCheck();

      expect(summary.remindersSent).toBe(1);
      expect(notificationsServiceMock.sendToUser).toHaveBeenCalledWith(
        'master-user-777',
        expect.objectContaining({
          title: '⏰ Заявка №req-assi требует внимания',
          data: {
            type: 'SERVICE_REQUEST_SLA_BREACH',
            requestId: 'req-assigned-1',
            priority: RequestPriority.MEDIUM,
          },
        }),
      );
      expect(notificationsServiceMock.sendToTenantRoles).not.toHaveBeenCalled();
    });

    it('неназначенная заявка отправляет напоминание строго ролям [HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER]', async () => {
      const now = Date.now();
      const unassignedRequest = {
        id: 'req-unassigned-1',
        tenantId: 'tenant-alatau',
        title: 'Уборка подъезда',
        category: RequestCategory.CLEANING,
        status: RequestStatus.PENDING,
        priority: RequestPriority.HIGH,
        assigneeId: null,
        updatedAt: new Date(now - 30 * 60 * 60 * 1000),
        unit: { unitNumber: '33' },
      };

      prismaMock.serviceRequest.findMany.mockResolvedValue([unassignedRequest]);

      await service.handleServiceRequestSlaCheck();

      expect(notificationsServiceMock.sendToTenantRoles).toHaveBeenCalledWith(
        'tenant-alatau',
        [UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.DISPATCHER],
        expect.objectContaining({
          data: {
            type: 'SERVICE_REQUEST_SLA_BREACH',
            requestId: 'req-unassigned-1',
            priority: RequestPriority.HIGH,
          },
        }),
      );
      expect(notificationsServiceMock.sendToUser).not.toHaveBeenCalled();
    });

    it('дедупликация через Redis: повторный вызов для той же зависшей заявки не дублирует напоминание', async () => {
      const now = Date.now();
      const stuckRequest = {
        id: 'req-stuck-dup',
        tenantId: 'tenant-1',
        title: 'Не работает лифт',
        category: RequestCategory.ELEVATOR,
        status: RequestStatus.IN_PROGRESS,
        priority: RequestPriority.EMERGENCY,
        assigneeId: 'tech-user-1',
        updatedAt: new Date(now - 10 * 60 * 60 * 1000),
        unit: { unitNumber: '1' },
      };

      prismaMock.serviceRequest.findMany.mockResolvedValue([stuckRequest]);

      // Первый прогон
      const firstRun = await service.handleServiceRequestSlaCheck();
      expect(firstRun.remindersSent).toBe(1);
      expect(firstRun.skippedAlreadyReminded).toBe(0);
      expect(redisServiceMock.set).toHaveBeenCalledWith(
        'service-requests:sla:req-stuck-dup',
        '1',
        SLA_THRESHOLD_HOURS.EMERGENCY * 3600,
      );

      // Второй прогон
      const secondRun = await service.handleServiceRequestSlaCheck();
      expect(secondRun.requestsChecked).toBe(1);
      expect(secondRun.requestsOverdue).toBe(1);
      expect(secondRun.remindersSent).toBe(0);
      expect(secondRun.skippedAlreadyReminded).toBe(1);

      // Общее число вызовов sendToUser осталось 1
      expect(notificationsServiceMock.sendToUser).toHaveBeenCalledTimes(1);
    });

    it('изоляция ошибок на уровне отдельной записи: падение отправки для одной заявки не прерывает обработку остальных', async () => {
      const now = Date.now();
      const failingRequest = {
        id: 'req-failing',
        tenantId: 'tenant-1',
        title: 'Ошибка отправки',
        category: RequestCategory.OTHER,
        status: RequestStatus.PENDING,
        priority: RequestPriority.HIGH,
        assigneeId: 'failing-user',
        updatedAt: new Date(now - 30 * 60 * 60 * 1000),
        unit: { unitNumber: '99' },
      };

      const successfulRequest = {
        id: 'req-success',
        tenantId: 'tenant-1',
        title: 'Успешная заявка',
        category: RequestCategory.HEATING,
        status: RequestStatus.PENDING,
        priority: RequestPriority.HIGH,
        assigneeId: 'good-user',
        updatedAt: new Date(now - 30 * 60 * 60 * 1000),
        unit: { unitNumber: '100' },
      };

      prismaMock.serviceRequest.findMany.mockResolvedValue([
        failingRequest,
        successfulRequest,
      ]);

      notificationsServiceMock.sendToUser
        .mockRejectedValueOnce(new Error('FCM network failure'))
        .mockResolvedValueOnce({ sent: 1 });

      const summary = await service.handleServiceRequestSlaCheck();

      expect(summary.requestsChecked).toBe(2);
      expect(summary.requestsOverdue).toBe(2);
      expect(summary.remindersSent).toBe(1);
      expect(notificationsServiceMock.sendToUser).toHaveBeenCalledTimes(2);
    });

    it('обрабатывает ошибку запроса к Prisma корректно и безопасно', async () => {
      prismaMock.serviceRequest.findMany.mockRejectedValue(new Error('DB connection pool exhausted'));

      const summary = await service.handleServiceRequestSlaCheck();

      expect(summary.requestsChecked).toBe(0);
      expect(summary.remindersSent).toBe(0);
      expect(notificationsServiceMock.sendToUser).not.toHaveBeenCalled();
      expect(notificationsServiceMock.sendToTenantRoles).not.toHaveBeenCalled();
    });
  });
});
