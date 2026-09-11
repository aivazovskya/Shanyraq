import { Test, TestingModule } from '@nestjs/testing';
import { SosService } from './sos.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole, SosAlertStatus } from '@prisma/client';

describe('SosService', () => {
  let service: SosService;
  let prismaMock: any;
  let notificationsServiceMock: any;

  const mockTenantId = 'tenant-1';
  const mockAlertId = 'alert-sos-100';
  const mockUnitId = 'unit-42';

  const residentUnverifiedUser = {
    id: 'user-resident-1',
    role: UserRole.RESIDENT_OWNER,
    tenantId: mockTenantId,
    firstName: 'Айбек',
    lastName: 'Нурланов',
    phone: '+77015550101',
    isVerified: false,
  };

  const residentTenantUser = {
    id: 'user-tenant-1',
    role: UserRole.RESIDENT_TENANT,
    tenantId: mockTenantId,
    firstName: 'Динара',
    lastName: 'Серикова',
    phone: '+77017778899',
    isVerified: true,
  };

  const securityUser = {
    id: 'security-1',
    role: UserRole.SECURITY,
    tenantId: mockTenantId,
    firstName: 'Руслан',
    lastName: 'Охранов',
  };

  const dispatcherUser = {
    id: 'dispatcher-1',
    role: UserRole.DISPATCHER,
    tenantId: mockTenantId,
    firstName: 'Гульнара',
    lastName: 'Диспетчерова',
  };

  const hoaAdminUser = {
    id: 'hoa-admin-1',
    role: UserRole.HOA_ADMIN,
    tenantId: mockTenantId,
    firstName: 'Ерлан',
    lastName: 'Управляющий',
  };

  const hoaChairmanUser = {
    id: 'hoa-chairman-1',
    role: UserRole.HOA_CHAIRMAN,
    tenantId: mockTenantId,
    firstName: 'Кайрат',
    lastName: 'Председатель',
  };

  const staffOtherTenantUser = {
    id: 'staff-other-1',
    role: UserRole.SECURITY,
    tenantId: 'tenant-2',
    firstName: 'Чужой',
    lastName: 'Охранник',
  };

  const superAdminUser = {
    id: 'super-admin-1',
    role: UserRole.SUPERADMIN,
    tenantId: null,
    firstName: 'Администратор',
    lastName: 'Платформы',
  };

  const mockAlert = {
    id: mockAlertId,
    tenantId: mockTenantId,
    unitId: mockUnitId,
    triggeredById: residentUnverifiedUser.id,
    latitude: 51.1284,
    longitude: 71.4305,
    status: SosAlertStatus.ACTIVE,
    resolvedById: null,
    resolvedAt: null,
    resolutionNote: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    prismaMock = {
      sosAlert: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      unitOwnership: {
        findFirst: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: mockTenantId, name: 'ЖК Шанырак' }),
      },
    };

    notificationsServiceMock = {
      sendToTenantRoles: jest.fn().mockResolvedValue({ sent: 3 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SosService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: notificationsServiceMock },
      ],
    }).compile();

    service = module.get<SosService>(SosService);
  });

  describe('trigger (Экстренный вызов SOS)', () => {
    it('неверифицированный житель может успешно отправить сигнал SOS', async () => {
      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        id: 'own-1',
        userId: residentUnverifiedUser.id,
        unitId: mockUnitId,
        isVerified: false,
        unit: { unitNumber: '101', building: { tenantId: mockTenantId } },
      });
      prismaMock.user.findUnique.mockResolvedValue(residentUnverifiedUser);
      prismaMock.sosAlert.findFirst.mockResolvedValue(null); // No existing active alert
      prismaMock.sosAlert.create.mockResolvedValue({ ...mockAlert, unitId: mockUnitId });

      const res = await service.trigger(residentUnverifiedUser, {
        latitude: 51.1284,
        longitude: 71.4305,
      });

      expect(res.id).toBe(mockAlertId);
      expect(prismaMock.sosAlert.create).toHaveBeenCalledWith({
        data: {
          tenantId: mockTenantId,
          unitId: mockUnitId,
          triggeredById: residentUnverifiedUser.id,
          latitude: 51.1284,
          longitude: 71.4305,
          status: SosAlertStatus.ACTIVE,
        },
        include: expect.any(Object),
      });
      expect(notificationsServiceMock.sendToTenantRoles).toHaveBeenCalledWith(
        mockTenantId,
        [UserRole.SECURITY, UserRole.DISPATCHER, UserRole.HOA_ADMIN],
        expect.objectContaining({
          title: expect.stringContaining('SOS'),
          body: expect.stringContaining('Айбек Нурланов'),
        }),
      );
    });

    it('житель без привязанных квартир (unitId = null) может успешно вызвать SOS', async () => {
      prismaMock.unitOwnership.findFirst.mockResolvedValue(null);
      prismaMock.user.findUnique.mockResolvedValue(residentUnverifiedUser);
      prismaMock.sosAlert.findFirst.mockResolvedValue(null);
      prismaMock.sosAlert.create.mockResolvedValue({ ...mockAlert, unitId: null });

      const res = await service.trigger(residentUnverifiedUser, {});

      expect(res.id).toBe(mockAlertId);
      expect(prismaMock.sosAlert.create).toHaveBeenCalledWith({
        data: {
          tenantId: mockTenantId,
          unitId: null,
          triggeredById: residentUnverifiedUser.id,
          latitude: null,
          longitude: null,
          status: SosAlertStatus.ACTIVE,
        },
        include: expect.any(Object),
      });
      expect(notificationsServiceMock.sendToTenantRoles).toHaveBeenCalled();
    });

    it('отклоняет вызов, если невозможно определить tenantId пользователя', async () => {
      const userWithoutTenant = { id: 'user-homeless', role: UserRole.RESIDENT_OWNER, tenantId: null };
      prismaMock.unitOwnership.findFirst.mockResolvedValue(null);

      const promise = service.trigger(userWithoutTenant, {});
      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'SOS.TENANT_UNRESOLVED' },
      });
    });

    it('дедупликация: повторный вызов при ACTIVE не создает новый алерт и повторяет push', async () => {
      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        id: 'own-1',
        unitId: mockUnitId,
        unit: { unitNumber: '101' },
      });
      prismaMock.user.findUnique.mockResolvedValue(residentUnverifiedUser);
      prismaMock.sosAlert.findFirst.mockResolvedValue(mockAlert); // Active alert already exists

      const res = await service.trigger(residentUnverifiedUser, {
        latitude: 51.1284,
        longitude: 71.4305,
      });

      expect(res.id).toBe(mockAlert.id);
      expect(prismaMock.sosAlert.create).not.toHaveBeenCalled();
      expect(notificationsServiceMock.sendToTenantRoles).toHaveBeenCalledWith(
        mockTenantId,
        [UserRole.SECURITY, UserRole.DISPATCHER, UserRole.HOA_ADMIN],
        expect.objectContaining({
          title: expect.stringContaining('SOS'),
        }),
      );
    });

    it('уведомление отправляется ролям SECURITY, DISPATCHER, HOA_ADMIN и исключает HOA_CHAIRMAN', async () => {
      prismaMock.unitOwnership.findFirst.mockResolvedValue(null);
      prismaMock.user.findUnique.mockResolvedValue(residentUnverifiedUser);
      prismaMock.sosAlert.findFirst.mockResolvedValue(null);
      prismaMock.sosAlert.create.mockResolvedValue(mockAlert);

      await service.trigger(residentUnverifiedUser, {});

      expect(notificationsServiceMock.sendToTenantRoles).toHaveBeenCalledWith(
        mockTenantId,
        expect.arrayContaining([UserRole.SECURITY, UserRole.DISPATCHER, UserRole.HOA_ADMIN]),
        expect.any(Object),
      );
      const calledRoles = notificationsServiceMock.sendToTenantRoles.mock.calls[0][1];
      expect(calledRoles).not.toContain(UserRole.HOA_CHAIRMAN);
      expect(calledRoles).not.toContain(UserRole.SUPERADMIN);
    });
  });

  describe('getTenantAlerts (Просмотр журнала SOS персоналом)', () => {
    it('разрешает просмотр охране, диспетчеру, админу и председателю своего ЖК', async () => {
      prismaMock.sosAlert.findMany.mockResolvedValue([mockAlert]);

      const resSecurity = await service.getTenantAlerts(mockTenantId, securityUser);
      expect(resSecurity).toHaveLength(1);

      const resChairman = await service.getTenantAlerts(mockTenantId, hoaChairmanUser);
      expect(resChairman).toHaveLength(1);
    });

    it('запрещает просмотр персоналу чужого ЖК (BOLA)', async () => {
      const promise = service.getTenantAlerts(mockTenantId, staffOtherTenantUser);
      await expect(promise).rejects.toThrow(ForbiddenException);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'SOS.CROSS_TENANT_VIEW_FORBIDDEN' },
      });
    });

    it('разрешает просмотр SUPERADMIN для любого ЖК', async () => {
      prismaMock.sosAlert.findMany.mockResolvedValue([mockAlert]);

      const res = await service.getTenantAlerts(mockTenantId, superAdminUser);
      expect(res).toHaveLength(1);
    });
  });

  describe('resolve (Обработка сигнала SOS)', () => {
    it('охрана может успешно закрыть вызов как RESOLVED', async () => {
      prismaMock.sosAlert.findUnique.mockResolvedValue(mockAlert);
      prismaMock.sosAlert.update.mockResolvedValue({
        ...mockAlert,
        status: SosAlertStatus.RESOLVED,
        resolvedById: securityUser.id,
        resolvedAt: new Date(),
        resolutionNote: 'Помощь оказана',
      });

      const res = await service.resolve(mockAlertId, securityUser, {
        status: SosAlertStatus.RESOLVED,
        note: 'Помощь оказана',
      });

      expect(res.status).toBe(SosAlertStatus.RESOLVED);
      expect(prismaMock.sosAlert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockAlertId },
          data: expect.objectContaining({
            status: SosAlertStatus.RESOLVED,
            resolvedById: securityUser.id,
            resolutionNote: 'Помощь оказана',
          }),
        }),
      );
    });

    it('диспетчер может закрыть вызов как FALSE_ALARM', async () => {
      prismaMock.sosAlert.findUnique.mockResolvedValue(mockAlert);
      prismaMock.sosAlert.update.mockResolvedValue({
        ...mockAlert,
        status: SosAlertStatus.FALSE_ALARM,
        resolvedById: dispatcherUser.id,
      });

      const res = await service.resolve(mockAlertId, dispatcherUser, {
        status: SosAlertStatus.FALSE_ALARM,
        note: 'Случайное нажатие ребенком',
      });

      expect(res.status).toBe(SosAlertStatus.FALSE_ALARM);
    });

    it('председатель ОСИ (HOA_CHAIRMAN) НЕ может закрыть вызов (read-only)', async () => {
      const promise = service.resolve(mockAlertId, hoaChairmanUser, {
        status: SosAlertStatus.RESOLVED,
      });
      await expect(promise).rejects.toThrow(ForbiddenException);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'SOS.CHAIRMAN_VIEW_ONLY' },
      });
    });

    it('персонал чужого ЖК не может закрыть вызов (BOLA)', async () => {
      prismaMock.sosAlert.findUnique.mockResolvedValue(mockAlert);

      const promise = service.resolve(mockAlertId, staffOtherTenantUser, {
        status: SosAlertStatus.RESOLVED,
      });
      await expect(promise).rejects.toThrow(ForbiddenException);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'SOS.CROSS_TENANT_PROCESS_FORBIDDEN' },
      });
    });

    it('нельзя закрыть уже обработанный вызов повторно', async () => {
      prismaMock.sosAlert.findUnique.mockResolvedValue({
        ...mockAlert,
        status: SosAlertStatus.RESOLVED,
      });

      const promise = service.resolve(mockAlertId, securityUser, {
        status: SosAlertStatus.RESOLVED,
      });
      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'SOS.ALREADY_PROCESSED' },
      });
    });
  });

  describe('getMyAlerts', () => {
    it('возвращает список алертов текущего пользователя', async () => {
      prismaMock.sosAlert.findMany.mockResolvedValue([mockAlert]);

      const res = await service.getMyAlerts(residentUnverifiedUser);
      expect(res).toHaveLength(1);
      expect(prismaMock.sosAlert.findMany).toHaveBeenCalledWith({
        where: { triggeredById: residentUnverifiedUser.id },
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getSosStatistics (Статистика и тренды SOS)', () => {
    it('averageResponseTimeMinutes рассчитывается строго по закрытым вызовам и исключает ACTIVE', async () => {
      const alertsFixture = [
        {
          id: 'alert-1',
          status: SosAlertStatus.ACTIVE,
          createdAt: new Date('2026-09-01T10:00:00Z'),
          resolvedAt: null,
        },
        {
          id: 'alert-2',
          status: SosAlertStatus.RESOLVED,
          createdAt: new Date('2026-09-01T10:00:00Z'),
          resolvedAt: new Date('2026-09-01T10:10:00Z'), // 10 minutes
        },
        {
          id: 'alert-3',
          status: SosAlertStatus.FALSE_ALARM,
          createdAt: new Date('2026-09-02T11:00:00Z'),
          resolvedAt: new Date('2026-09-02T11:20:00Z'), // 20 minutes
        },
      ];

      prismaMock.sosAlert.findMany.mockResolvedValue(alertsFixture);

      const res = await service.getSosStatistics(mockTenantId, securityUser, {
        from: '2026-09-01',
        to: '2026-09-05',
      });

      expect(res.totalAlerts).toBe(3);
      expect(res.byStatus).toEqual({
        ACTIVE: 1,
        RESOLVED: 1,
        FALSE_ALARM: 1,
      });
      // (10 + 20) / 2 = 15 minutes, NOT (10 + 20 + 0) / 3 = 10
      expect(res.averageResponseTimeMinutes).toBe(15);
    });

    it('по умолчанию (без from/to) запрашивает данные за последние 30 дней', async () => {
      prismaMock.sosAlert.findMany.mockResolvedValue([]);

      const beforeCall = Date.now();
      await service.getSosStatistics(mockTenantId, dispatcherUser);
      const afterCall = Date.now();

      expect(prismaMock.sosAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: mockTenantId,
            createdAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );

      const callArgs = prismaMock.sosAlert.findMany.mock.calls[0][0];
      const gte = callArgs.where.createdAt.gte.getTime();
      const lte = callArgs.where.createdAt.lte.getTime();
      const diffDays = (lte - gte) / (1000 * 60 * 60 * 24);

      expect(diffDays).toBeCloseTo(30, 0);
      expect(lte).toBeGreaterThanOrEqual(beforeCall);
      expect(lte).toBeLessThanOrEqual(afterCall);
    });

    it('DISPATCHER и SECURITY имеют доступ, персонал чужого ЖК и жильцы отклоняются', async () => {
      prismaMock.sosAlert.findMany.mockResolvedValue([]);

      // SECURITY of same tenant
      const resSecurity = await service.getSosStatistics(mockTenantId, securityUser);
      expect(resSecurity).toBeDefined();

      // DISPATCHER of same tenant
      const resDispatcher = await service.getSosStatistics(mockTenantId, dispatcherUser);
      expect(resDispatcher).toBeDefined();

      // Staff of different tenant
      await expect(
        service.getSosStatistics(mockTenantId, staffOtherTenantUser),
      ).rejects.toMatchObject({
        response: { code: 'SOS.CROSS_TENANT_VIEW_FORBIDDEN' },
      });

      // Resident without staff role
      await expect(
        service.getSosStatistics(mockTenantId, residentUnverifiedUser),
      ).rejects.toMatchObject({
        response: { code: 'SOS.LOG_ACCESS_FORBIDDEN' },
      });
    });

    it('dailyTrend формирует список точек по дням периода', async () => {
      prismaMock.sosAlert.findMany.mockResolvedValue([
        {
          id: 'alert-1',
          status: SosAlertStatus.RESOLVED,
          createdAt: new Date('2026-09-01T12:00:00Z'),
          resolvedAt: new Date('2026-09-01T12:05:00Z'),
        },
        {
          id: 'alert-2',
          status: SosAlertStatus.RESOLVED,
          createdAt: new Date('2026-09-01T15:00:00Z'),
          resolvedAt: new Date('2026-09-01T15:05:00Z'),
        },
        {
          id: 'alert-3',
          status: SosAlertStatus.ACTIVE,
          createdAt: new Date('2026-09-03T10:00:00Z'),
          resolvedAt: null,
        },
      ]);

      const res = await service.getSosStatistics(mockTenantId, securityUser, {
        from: '2026-09-01',
        to: '2026-09-03',
      });

      expect(res.dailyTrend).toEqual([
        { date: '2026-09-01', count: 2 },
        { date: '2026-09-02', count: 0 },
        { date: '2026-09-03', count: 1 },
      ]);
    });
  });

  describe('exportAlertsCsv (Task 0056: SOS alert log CSV export)', () => {
    const alertInRange = {
      id: 'alert-in-range',
      tenantId: mockTenantId,
      status: SosAlertStatus.RESOLVED,
      createdAt: new Date('2026-09-05T10:00:00Z'),
      resolvedAt: new Date('2026-09-05T10:12:00Z'), // 12 minutes
      resolutionNote: 'Ложное срабатывание, охрана подтвердила порядок',
      latitude: 51.1284,
      longitude: 71.4305,
      unit: {
        unitNumber: '15',
        building: { blockName: 'Блок Б' },
      },
      triggeredBy: {
        id: 'user-resident-1',
        firstName: 'Айбек',
        lastName: 'Нурланов',
        phone: '+77015550101',
      },
      resolvedBy: {
        id: 'security-1',
        firstName: 'Руслан',
        lastName: 'Охранов',
      },
    };

    const alertActiveNoResolution = {
      id: 'alert-active',
      tenantId: mockTenantId,
      status: SosAlertStatus.ACTIVE,
      createdAt: new Date('2026-09-06T08:00:00Z'),
      resolvedAt: null,
      resolutionNote: null,
      latitude: null,
      longitude: null,
      unit: null,
      triggeredBy: {
        id: 'user-tenant-1',
        firstName: 'Динара',
        lastName: 'Серикова',
        phone: '+77017778899',
      },
      resolvedBy: null,
    };

    it('фильтрует вызовы строго по диапазону from/to, вызов вне периода передается в Prisma-запросе как исключенный', async () => {
      prismaMock.sosAlert.findMany.mockResolvedValue([alertInRange]);

      await service.exportAlertsCsv(mockTenantId, securityUser, {
        from: '2026-09-01',
        to: '2026-09-10',
      });

      expect(prismaMock.sosAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: mockTenantId,
            createdAt: {
              gte: new Date('2026-09-01T00:00:00.000Z'),
              lte: new Date('2026-09-10T23:59:59.999Z'),
            },
          }),
        }),
      );
    });

    it('RESOLVED вызов показывает вычисленное время реагирования в минутах, ACTIVE — пустое значение', async () => {
      prismaMock.sosAlert.findMany.mockResolvedValue([
        alertInRange,
        alertActiveNoResolution,
      ]);

      const { buffer } = await service.exportAlertsCsv(mockTenantId, securityUser, {
        from: '2026-09-01',
        to: '2026-09-10',
      });

      const csv = buffer.toString('utf-8');
      const lines = csv.split('\r\n');

      const resolvedRow = lines.find((l) => l.includes('Нурланов'));
      expect(resolvedRow).toBeDefined();
      const resolvedCols = resolvedRow!.split(',');
      expect(resolvedCols[8]).toBe('12'); // 9th column: Время реагирования (мин)
      expect(resolvedRow).toContain('Разрешен');

      const activeRow = lines.find((l) => l.includes('Серикова'));
      expect(activeRow).toBeDefined();
      // Active alert row's response-time field must be blank, not "0" or negative
      const activeCols = activeRow!.split(',');
      expect(activeCols[8]).toBe('');
      expect(activeRow).toContain('Активен');
    });

    it('отклоняет доступ жильцу и персоналу чужого ЖК; разрешает SECURITY и SUPERADMIN (тот же ролевой набор, что у getTenantAlerts)', async () => {
      prismaMock.sosAlert.findMany.mockResolvedValue([]);

      await expect(
        service.exportAlertsCsv(mockTenantId, residentUnverifiedUser),
      ).rejects.toMatchObject({
        response: { code: 'SOS.LOG_ACCESS_FORBIDDEN' },
      });

      await expect(
        service.exportAlertsCsv(mockTenantId, staffOtherTenantUser),
      ).rejects.toMatchObject({
        response: { code: 'SOS.CROSS_TENANT_VIEW_FORBIDDEN' },
      });

      await expect(
        service.exportAlertsCsv(mockTenantId, securityUser),
      ).resolves.toBeDefined();

      await expect(
        service.exportAlertsCsv(mockTenantId, superAdminUser),
      ).resolves.toBeDefined();
    });

    it('сформированный CSV буфер начинается с байтов UTF-8 BOM (0xEF, 0xBB, 0xBF)', async () => {
      prismaMock.sosAlert.findMany.mockResolvedValue([]);

      const { buffer } = await service.exportAlertsCsv(mockTenantId, hoaAdminUser, {
        from: '2026-09-01',
        to: '2026-09-10',
      });

      expect(buffer[0]).toBe(0xef);
      expect(buffer[1]).toBe(0xbb);
      expect(buffer[2]).toBe(0xbf);
    });

    it('по умолчанию (без from/to) использует период последних 30 дней', async () => {
      prismaMock.sosAlert.findMany.mockResolvedValue([]);

      const beforeCall = Date.now();
      await service.exportAlertsCsv(mockTenantId, hoaChairmanUser);
      const afterCall = Date.now();

      const callArgs = prismaMock.sosAlert.findMany.mock.calls[0][0];
      const gte = callArgs.where.createdAt.gte.getTime();
      const lte = callArgs.where.createdAt.lte.getTime();
      const diffDays = (lte - gte) / (1000 * 60 * 60 * 24);

      expect(diffDays).toBeCloseTo(30, 0);
      expect(lte).toBeGreaterThanOrEqual(beforeCall);
      expect(lte).toBeLessThanOrEqual(afterCall);
    });
  });
});
