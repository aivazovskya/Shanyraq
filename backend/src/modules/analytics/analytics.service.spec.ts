import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole, RequestStatus, BookingStatus } from '@prisma/client';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prismaMock: any;

  const mockTenantId = 'tenant-1';
  const otherTenantId = 'tenant-2';

  const hoaAdminUser = {
    id: 'admin-1',
    role: UserRole.HOA_ADMIN,
    tenantId: mockTenantId,
  };

  const hoaChairmanUser = {
    id: 'chairman-1',
    role: UserRole.HOA_CHAIRMAN,
    tenantId: mockTenantId,
  };

  const superadminUser = {
    id: 'superadmin-1',
    role: UserRole.SUPERADMIN,
    tenantId: null,
  };

  const dispatcherUser = {
    id: 'dispatcher-1',
    role: UserRole.DISPATCHER,
    tenantId: mockTenantId,
  };

  const foreignHoaAdmin = {
    id: 'admin-foreign',
    role: UserRole.HOA_ADMIN,
    tenantId: otherTenantId,
  };

  const residentUser = {
    id: 'resident-1',
    role: UserRole.RESIDENT_OWNER,
    tenantId: mockTenantId,
  };

  beforeEach(async () => {
    prismaMock = {
      tenant: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === mockTenantId || where.id === otherTenantId) {
            return Promise.resolve({ id: where.id, name: 'ЖК Шанырак' });
          }
          return Promise.resolve(null);
        }),
        findMany: jest.fn(),
      },
      charge: {
        aggregate: jest.fn(),
        groupBy: jest.fn(),
      },
      payment: {
        aggregate: jest.fn(),
      },
      tariffItem: {
        findMany: jest.fn(),
      },
      personalAccount: {
        findMany: jest.fn(),
      },
      serviceRequest: {
        count: jest.fn(),
        groupBy: jest.fn(),
        findMany: jest.fn(),
        aggregate: jest.fn(),
      },
      sosAlert: {
        groupBy: jest.fn(),
      },
      user: {
        count: jest.fn(),
        groupBy: jest.fn(),
        findMany: jest.fn(),
      },
      vote: {
        count: jest.fn(),
        groupBy: jest.fn(),
      },
      bookableResource: {
        findMany: jest.fn(),
      },
      booking: {
        count: jest.fn(),
        groupBy: jest.fn(),
        findMany: jest.fn(),
      },
      communityListing: {
        count: jest.fn(),
        groupBy: jest.fn(),
      },
      chatMessage: {
        count: jest.fn(),
        groupBy: jest.fn(),
      },
      meterReading: {
        count: jest.fn(),
        groupBy: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  describe('Tenant isolation (BOLA) and Role Access', () => {
    it('должен отклонять DISPATCHER на всех трех эндпоинтах', async () => {
      const promise = service.getFinanceAnalytics(mockTenantId, dispatcherUser);
      await expect(promise).rejects.toThrow(ForbiddenException);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'ANALYTICS.ACCESS_FORBIDDEN' },
      });

      await expect(
        service.getRequestsAnalytics(mockTenantId, dispatcherUser),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.getActivityAnalytics(mockTenantId, dispatcherUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('должен отклонять обычного жителя (RESIDENT_OWNER)', async () => {
      await expect(
        service.getFinanceAnalytics(mockTenantId, residentUser),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.getRequestsAnalytics(mockTenantId, residentUser),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.getActivityAnalytics(mockTenantId, residentUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('должен отклонять администратора чужого ЖК (BOLA)', async () => {
      await expect(
        service.getFinanceAnalytics(mockTenantId, foreignHoaAdmin),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.getRequestsAnalytics(mockTenantId, foreignHoaAdmin),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.getActivityAnalytics(mockTenantId, foreignHoaAdmin),
      ).rejects.toThrow(ForbiddenException);
    });

    it('должен разрешать доступ SUPERADMIN без привязки к tenantId', async () => {
      prismaMock.charge.aggregate.mockResolvedValue({ _sum: { amount: 1000 } });
      prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: 800 } });
      prismaMock.charge.groupBy.mockResolvedValue([]);
      prismaMock.personalAccount.findMany.mockResolvedValue([]);

      const result = await service.getFinanceAnalytics(mockTenantId, superadminUser);
      expect(result).toBeDefined();
      expect(result.totalCharged).toBe(1000);
      expect(result.totalCollected).toBe(800);
    });

    it('должен разрешать доступ председателю ОСИ (HOA_CHAIRMAN) своего ЖК', async () => {
      prismaMock.charge.aggregate.mockResolvedValue({ _sum: { amount: 500 } });
      prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: 500 } });
      prismaMock.charge.groupBy.mockResolvedValue([]);
      prismaMock.personalAccount.findMany.mockResolvedValue([]);

      const result = await service.getFinanceAnalytics(mockTenantId, hoaChairmanUser);
      expect(result).toBeDefined();
      expect(result.collectionRatePercent).toBe(100);
    });

    it('должен выбрасывать NotFoundException если ЖК не существует', async () => {
      const promise = service.getFinanceAnalytics('non-existent-tenant', superadminUser);
      await expect(promise).rejects.toThrow(NotFoundException);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'ANALYTICS.COMPLEX_NOT_FOUND' },
      });
    });
  });

  describe('getFinanceAnalytics', () => {
    it('должен корректно рассчитывать процент собираемости, группировку тарифов и топ должников', async () => {
      prismaMock.charge.aggregate.mockResolvedValue({ _sum: { amount: 200000 } });
      prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: 170000 } });

      prismaMock.charge.groupBy.mockResolvedValue([
        { tariffItemId: 't1', _sum: { amount: 150000 } },
        { tariffItemId: 't2', _sum: { amount: 50000 } },
      ]);

      prismaMock.tariffItem.findMany.mockResolvedValue([
        { id: 't1', name: 'Техобслуживание дома' },
        { id: 't2', name: 'Охрана и консьерж' },
      ]);

      prismaMock.personalAccount.findMany.mockResolvedValue([
        {
          id: 'acc-1',
          accountNumber: 'SH-001',
          unitId: 'unit-1',
          balance: -45000,
          unit: { unitNumber: '10', building: { blockName: 'Блок А' } },
        },
        {
          id: 'acc-2',
          accountNumber: 'SH-002',
          unitId: 'unit-2',
          balance: -12500,
          unit: { unitNumber: '25', building: { blockName: 'Блок Б' } },
        },
      ]);

      const res = await service.getFinanceAnalytics(mockTenantId, hoaAdminUser, {
        month: 8,
        year: 2026,
      });

      expect(res.periodMonth).toBe(8);
      expect(res.periodYear).toBe(2026);
      expect(res.totalCharged).toBe(200000);
      expect(res.totalCollected).toBe(170000);
      expect(res.collectionRatePercent).toBe(85.0);

      expect(res.byTariff).toHaveLength(2);
      expect(res.byTariff[0]).toEqual({
        tariffId: 't1',
        tariffName: 'Техобслуживание дома',
        amount: 150000,
      });
      expect(res.byTariff[1]).toEqual({
        tariffId: 't2',
        tariffName: 'Охрана и консьерж',
        amount: 50000,
      });

      expect(res.topDebtors).toHaveLength(2);
      expect(res.topDebtors[0].accountNumber).toBe('SH-001');
      expect(res.topDebtors[0].balance).toBe(-45000);
      expect(res.topDebtors[0].unitNumber).toBe('10');
      expect(res.topDebtors[0].buildingBlock).toBe('Блок А');
    });

    it('должен возвращать 0% собираемости если начислений не было', async () => {
      prismaMock.charge.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
      prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
      prismaMock.charge.groupBy.mockResolvedValue([]);
      prismaMock.personalAccount.findMany.mockResolvedValue([]);

      const res = await service.getFinanceAnalytics(mockTenantId, hoaAdminUser, {
        month: 1,
        year: 2026,
      });

      expect(res.totalCharged).toBe(0);
      expect(res.totalCollected).toBe(0);
      expect(res.collectionRatePercent).toBe(0);
      expect(res.byTariff).toEqual([]);
      expect(res.topDebtors).toEqual([]);
    });
  });

  describe('getRequestsAnalytics', () => {
    it('должен рассчитывать статистику заявок, среднее время решения и средний рейтинг', async () => {
      prismaMock.serviceRequest.groupBy.mockImplementation(({ by }) => {
        if (by.includes('status')) {
          return Promise.resolve([
            { status: 'RESOLVED', _count: { id: 8 } },
            { status: 'IN_PROGRESS', _count: { id: 3 } },
            { status: 'PENDING', _count: { id: 2 } },
          ]);
        }
        if (by.includes('category')) {
          return Promise.resolve([
            { category: 'PLUMBING', _count: { id: 7 } },
            { category: 'ELECTRICAL', _count: { id: 6 } },
          ]);
        }
        return Promise.resolve([]);
      });

      prismaMock.serviceRequest.count.mockResolvedValue(13);

      const t0 = new Date('2026-08-01T10:00:00.000Z');
      const t1 = new Date('2026-08-01T12:00:00.000Z'); // 2 hours
      const t2 = new Date('2026-08-01T14:00:00.000Z'); // 4 hours

      // Only RESOLVED / CLOSED requests are passed to average resolution calculation
      prismaMock.serviceRequest.findMany.mockResolvedValue([
        { createdAt: t0, updatedAt: t1 },
        { createdAt: t0, updatedAt: t2 },
      ]);

      prismaMock.serviceRequest.aggregate.mockResolvedValue({
        _avg: { rating: 4.67 },
        _count: { rating: 6 },
      });

      const res = await service.getRequestsAnalytics(mockTenantId, hoaAdminUser, {
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-31T23:59:59.999Z',
      });

      expect(res.totalRequests).toBe(13);
      expect(res.byStatus).toEqual([
        { status: 'RESOLVED', count: 8 },
        { status: 'IN_PROGRESS', count: 3 },
        { status: 'PENDING', count: 2 },
      ]);
      expect(res.byCategory).toEqual([
        { category: 'PLUMBING', count: 7 },
        { category: 'ELECTRICAL', count: 6 },
      ]);
      // Average of 2h and 4h = 3.0h
      expect(res.averageResolutionTimeHours).toBe(3.0);
      expect(res.averageRating).toBe(4.7);
      expect(res.ratedRequestsCount).toBe(6);

      // Verify Prisma query for resolution time filtered by RESOLVED / CLOSED
      expect(prismaMock.serviceRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: [RequestStatus.RESOLVED, RequestStatus.CLOSED] },
          }),
        }),
      );
    });

    it('должен возвращать 0 часов и 0 рейтинг, если завершенных или оцененных заявок нет', async () => {
      prismaMock.serviceRequest.groupBy.mockResolvedValue([]);
      prismaMock.serviceRequest.count.mockResolvedValue(0);
      prismaMock.serviceRequest.findMany.mockResolvedValue([]);
      prismaMock.serviceRequest.aggregate.mockResolvedValue({
        _avg: { rating: null },
        _count: { rating: 0 },
      });

      const res = await service.getRequestsAnalytics(mockTenantId, hoaAdminUser);

      expect(res.totalRequests).toBe(0);
      expect(res.averageResolutionTimeHours).toBe(0);
      expect(res.averageRating).toBe(0);
      expect(res.ratedRequestsCount).toBe(0);
    });
  });

  describe('getActivityAnalytics', () => {
    it('должен возвращать снимок жильцов и количество действий в рамках указанного периода', async () => {
      // Residents counts
      prismaMock.user.count
        .mockResolvedValueOnce(100) // totalRegisteredResidentsCount
        .mockResolvedValueOnce(75); // verifiedResidentsCount

      // Module interaction counts
      prismaMock.vote.count.mockResolvedValue(42);
      prismaMock.serviceRequest.count.mockResolvedValue(15);
      prismaMock.booking.count.mockResolvedValue(8);
      prismaMock.communityListing.count.mockResolvedValue(6);
      prismaMock.chatMessage.count.mockResolvedValue(90);
      prismaMock.meterReading.count.mockResolvedValue(55);

      const from = '2026-08-01T00:00:00.000Z';
      const to = '2026-08-31T23:59:59.999Z';

      const res = await service.getActivityAnalytics(mockTenantId, hoaAdminUser, {
        from,
        to,
      });

      expect(res.totalRegisteredResidentsCount).toBe(100);
      expect(res.verifiedResidentsCount).toBe(75);
      expect(res.adoptionRatePercent).toBe(75.0);

      expect(res.votesCast).toBe(42);
      expect(res.requestsCreated).toBe(15);
      expect(res.bookingsCreated).toBe(8);
      expect(res.listingsCreated).toBe(6);
      expect(res.chatMessagesSent).toBe(90);
      expect(res.meterReadingsSubmitted).toBe(55);

      // Verify that all interaction queries included date range gte/lte
      const expectedDateRange = {
        gte: new Date(from),
        lte: new Date(to),
      };

      expect(prismaMock.vote.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expectedDateRange,
          }),
        }),
      );
      expect(prismaMock.serviceRequest.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: mockTenantId,
            createdAt: expectedDateRange,
          }),
        }),
      );
      expect(prismaMock.booking.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expectedDateRange,
          }),
        }),
      );
      expect(prismaMock.communityListing.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: mockTenantId,
            createdAt: expectedDateRange,
          }),
        }),
      );
      expect(prismaMock.chatMessage.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expectedDateRange,
          }),
        }),
      );
      expect(prismaMock.meterReading.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expectedDateRange,
          }),
        }),
      );
    });
  });

  describe('exportFinanceAnalyticsCsv', () => {
    it('должен генерировать валидный CSV-буфер, начинающийся с UTF-8 BOM', async () => {
      prismaMock.charge.aggregate.mockResolvedValue({ _sum: { amount: 100000 } });
      prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: 90000 } });
      prismaMock.charge.groupBy.mockResolvedValue([
        { tariffItemId: 't1', _sum: { amount: 100000 } },
      ]);
      prismaMock.tariffItem.findMany.mockResolvedValue([
        { id: 't1', name: 'Базовый тариф' },
      ]);
      prismaMock.personalAccount.findMany.mockResolvedValue([
        {
          id: 'acc-1',
          accountNumber: 'SH-001',
          unitId: 'unit-1',
          balance: -5000,
          unit: { unitNumber: '10', building: { blockName: 'Блок 1' } },
        },
      ]);

      const result = await service.exportFinanceAnalyticsCsv(mockTenantId, hoaAdminUser, {
        month: 9,
        year: 2026,
      });

      expect(result.filename).toBe('finance-analytics-tenant-1-2026-09.csv');
      expect(result.buffer).toBeInstanceOf(Buffer);
      // UTF-8 BOM check
      expect(result.buffer[0]).toBe(0xef);
      expect(result.buffer[1]).toBe(0xbb);
      expect(result.buffer[2]).toBe(0xbf);

      const content = result.buffer.toString('utf-8');
      expect(content).toContain('Финансовая аналитика ЖК');
      expect(content).toContain('ЖК Шанырак');
      expect(content).toContain('Базовый тариф');
      expect(content).toContain('SH-001');
    });

    it('должен выгружать более 10 должников без обрезки (uncapped query)', async () => {
      prismaMock.charge.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
      prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
      prismaMock.charge.groupBy.mockResolvedValue([]);

      // 15 должников
      const debtors = Array.from({ length: 15 }, (_, i) => ({
        id: `acc-${i + 1}`,
        accountNumber: `ACC-DEBT-${i + 1}`,
        unitId: `unit-${i + 1}`,
        balance: -(1000 * (i + 1)),
        unit: { unitNumber: `${i + 1}`, building: { blockName: `Блок ${i + 1}` } },
      }));
      prismaMock.personalAccount.findMany.mockResolvedValue(debtors);

      const result = await service.exportFinanceAnalyticsCsv(mockTenantId, hoaChairmanUser, {
        month: 5,
        year: 2026,
      });

      // Проверяем, что в вызов findMany не передавался take: 10
      expect(prismaMock.personalAccount.findMany).toHaveBeenCalledWith(
        expect.not.objectContaining({ take: expect.anything() }),
      );

      const content = result.buffer.toString('utf-8');
      for (let i = 1; i <= 15; i++) {
        expect(content).toContain(`ACC-DEBT-${i}`);
      }
    });

    it('должен корректно экранировать запятые и кавычки в названиях тарифов', async () => {
      prismaMock.charge.aggregate.mockResolvedValue({ _sum: { amount: 50000 } });
      prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: 50000 } });
      prismaMock.charge.groupBy.mockResolvedValue([
        { tariffItemId: 't-complex', _sum: { amount: 50000 } },
      ]);
      prismaMock.tariffItem.findMany.mockResolvedValue([
        { id: 't-complex', name: 'Отопление, подогрев "Люкс"' },
      ]);
      prismaMock.personalAccount.findMany.mockResolvedValue([]);

      const result = await service.exportFinanceAnalyticsCsv(mockTenantId, superadminUser, {
        month: 12,
        year: 2026,
      });

      const content = result.buffer.toString('utf-8');
      expect(content).toContain('"Отопление, подогрев ""Люкс"""');
    });

    it('должен отклонять доступ для не-стафф пользователей (RESIDENT) или чужого ЖК', async () => {
      await expect(
        service.exportFinanceAnalyticsCsv(mockTenantId, residentUser as any),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.exportFinanceAnalyticsCsv(mockTenantId, foreignHoaAdmin as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getPlatformOverview (SUPERADMIN Cross-Tenant Overview)', () => {
    it('должен отклонять доступ для не-SUPERADMIN ролей (HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER, RESIDENT)', async () => {
      const nonSuperadmins = [hoaAdminUser, hoaChairmanUser, dispatcherUser, residentUser];

      for (const nonAdmin of nonSuperadmins) {
        await expect(service.getPlatformOverview(nonAdmin as any)).rejects.toThrow(
          ForbiddenException,
        );
        await expect(service.getPlatformOverview(nonAdmin as any)).rejects.toMatchObject({
          response: { code: 'ANALYTICS.PLATFORM_ACCESS_FORBIDDEN' },
        });
      }
    });

    it('должен корректно агрегировать метрики по нескольким ЖК и сводить общие итоги', async () => {
      const mockTenants = [
        { id: 'tenant-1', name: 'ЖК Шаңырақ-1' },
        { id: 'tenant-2', name: 'ЖК Сарыарка' },
        { id: 'tenant-3', name: 'ЖК Байтерек' }, // ЖК с нулевой активностью
      ];
      prismaMock.tenant.findMany.mockResolvedValue(mockTenants);

      // Жители: всего
      prismaMock.user.groupBy
        .mockResolvedValueOnce([
          { tenantId: 'tenant-1', _count: 10 },
          { tenantId: 'tenant-2', _count: 20 },
        ])
        // Жители: верифицированные
        .mockResolvedValueOnce([
          { tenantId: 'tenant-1', _count: 8 },
          { tenantId: 'tenant-2', _count: 15 },
        ]);

      // SOS-сигналы
      prismaMock.sosAlert.groupBy.mockResolvedValue([
        { tenantId: 'tenant-1', _count: 2 },
      ]);

      // Открытые заявки
      prismaMock.serviceRequest.groupBy.mockResolvedValue([
        { tenantId: 'tenant-1', _count: 5 },
        { tenantId: 'tenant-2', _count: 3 },
      ]);

      // Задолженность (PersonalAccount)
      prismaMock.personalAccount.findMany.mockResolvedValue([
        {
          balance: -150000.5,
          unit: { building: { tenantId: 'tenant-1' } },
        },
        {
          balance: -80000.25,
          unit: { building: { tenantId: 'tenant-2' } },
        },
      ]);

      const result = await service.getPlatformOverview(superadminUser);

      // Проверка структуры верхнего уровня (платформенные итоги)
      expect(result.tenantsCount).toBe(3);
      expect(result.totalResidentsCount).toBe(30);
      expect(result.verifiedResidentsCount).toBe(23);
      expect(result.activeSosAlertsCount).toBe(2);
      expect(result.openServiceRequestsCount).toBe(8);
      expect(result.totalOutstandingDebt).toBe(230000.75);

      // Проверка детализации по каждому ЖК
      expect(result.tenants).toHaveLength(3);

      const t1 = result.tenants.find((t) => t.tenantId === 'tenant-1');
      expect(t1).toEqual({
        tenantId: 'tenant-1',
        tenantName: 'ЖК Шаңырақ-1',
        totalResidentsCount: 10,
        verifiedResidentsCount: 8,
        activeSosAlertsCount: 2,
        openServiceRequestsCount: 5,
        outstandingDebt: 150000.5,
      });

      const t2 = result.tenants.find((t) => t.tenantId === 'tenant-2');
      expect(t2).toEqual({
        tenantId: 'tenant-2',
        tenantName: 'ЖК Сарыарка',
        totalResidentsCount: 20,
        verifiedResidentsCount: 15,
        activeSosAlertsCount: 0,
        openServiceRequestsCount: 3,
        outstandingDebt: 80000.25,
      });

      // ЖК с нулями: должен присутствовать со всеми явными 0, а не undefined/пропуском
      const t3 = result.tenants.find((t) => t.tenantId === 'tenant-3');
      expect(t3).toEqual({
        tenantId: 'tenant-3',
        tenantName: 'ЖК Байтерек',
        totalResidentsCount: 0,
        verifiedResidentsCount: 0,
        activeSosAlertsCount: 0,
        openServiceRequestsCount: 0,
        outstandingDebt: 0,
      });

      // Сумма по ЖК строго равна общим итогам платформы
      const sumResidents = result.tenants.reduce((acc, t) => acc + t.totalResidentsCount, 0);
      const sumVerified = result.tenants.reduce((acc, t) => acc + t.verifiedResidentsCount, 0);
      const sumSos = result.tenants.reduce((acc, t) => acc + t.activeSosAlertsCount, 0);
      const sumRequests = result.tenants.reduce((acc, t) => acc + t.openServiceRequestsCount, 0);
      const sumDebt = Math.round(result.tenants.reduce((acc, t) => acc + t.outstandingDebt, 0) * 100) / 100;

      expect(sumResidents).toBe(result.totalResidentsCount);
      expect(sumVerified).toBe(result.verifiedResidentsCount);
      expect(sumSos).toBe(result.activeSosAlertsCount);
      expect(sumRequests).toBe(result.openServiceRequestsCount);
      expect(sumDebt).toBe(result.totalOutstandingDebt);
    });

    it('должен вызывать каждый метод groupBy ровно один раз без N+1 цикла по тенантам', async () => {
      const mockTenants = [
        { id: 't-1', name: 'ЖК 1' },
        { id: 't-2', name: 'ЖК 2' },
        { id: 't-3', name: 'ЖК 3' },
        { id: 't-4', name: 'ЖК 4' },
      ];
      prismaMock.tenant.findMany.mockResolvedValue(mockTenants);
      prismaMock.user.groupBy.mockResolvedValue([]);
      prismaMock.sosAlert.groupBy.mockResolvedValue([]);
      prismaMock.serviceRequest.groupBy.mockResolvedValue([]);
      prismaMock.personalAccount.findMany.mockResolvedValue([]);

      await service.getPlatformOverview(superadminUser);

      // Ровно 1 вызов findMany для списка ЖК
      expect(prismaMock.tenant.findMany).toHaveBeenCalledTimes(1);

      // Ровно 1 вызов groupBy для SOS
      expect(prismaMock.sosAlert.groupBy).toHaveBeenCalledTimes(1);

      // Ровно 1 вызов groupBy для заявок
      expect(prismaMock.serviceRequest.groupBy).toHaveBeenCalledTimes(1);

      // Ровно 2 вызова groupBy для пользователей (всего + верифицированные)
      expect(prismaMock.user.groupBy).toHaveBeenCalledTimes(2);

      // Ровно 1 вызов findMany для должников
      expect(prismaMock.personalAccount.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('exportResidentActivityCsv', () => {
    const mockResidents = [
      { id: 'res-1', firstName: 'Алихан', lastName: 'Нурланов', phone: '+77011112233' },
      { id: 'res-2', firstName: 'Динара', lastName: 'Каримова', phone: '+77022223344' },
      { id: 'res-3', firstName: 'Серик', lastName: 'Ахметов', phone: '+77033334455' },
    ];

    beforeEach(() => {
      prismaMock.user.findMany.mockResolvedValue(mockResidents);
      prismaMock.vote.groupBy.mockResolvedValue([]);
      prismaMock.serviceRequest.groupBy.mockResolvedValue([]);
      prismaMock.booking.groupBy.mockResolvedValue([]);
      prismaMock.communityListing.groupBy.mockResolvedValue([]);
      prismaMock.chatMessage.groupBy.mockResolvedValue([]);
      prismaMock.meterReading.groupBy.mockResolvedValue([]);
    });

    it('корректно сопоставляет активность жильца по нескольким таблицам без смешивания', async () => {
      // res-1: 2 votes, 1 request
      prismaMock.vote.groupBy.mockResolvedValue([
        { userId: 'res-1', _count: 2 },
      ]);
      prismaMock.serviceRequest.groupBy.mockResolvedValue([
        { creatorId: 'res-1', _count: 1 },
      ]);
      // res-2: 1 booking, 2 listings, 3 messages, 4 readings
      prismaMock.booking.groupBy.mockResolvedValue([
        { bookedById: 'res-2', _count: 1 },
      ]);
      prismaMock.communityListing.groupBy.mockResolvedValue([
        { authorId: 'res-2', _count: 2 },
      ]);
      prismaMock.chatMessage.groupBy.mockResolvedValue([
        { senderId: 'res-2', _count: 3 },
      ]);
      prismaMock.meterReading.groupBy.mockResolvedValue([
        { submittedById: 'res-2', _count: 4 },
      ]);

      const result = await service.exportResidentActivityCsv(mockTenantId, hoaAdminUser, {
        from: '2026-08-01',
        to: '2026-08-31',
      });

      expect(result.buffer).toBeInstanceOf(Buffer);
      const csvString = result.buffer.toString('utf-8');

      // Проверяем строки для res-2 (Каримова Динара, total 10)
      // Столбцы: ФИО, Телефон, Голосов, Заявок, Бронирований, Объявлений, Сообщений, Показаний, Итого
      expect(csvString).toContain('Каримова Динара,+77022223344,0,0,1,2,3,4,10');

      // Проверяем строки для res-1 (Нурланов Алихан, total 3)
      expect(csvString).toContain('Нурланов Алихан,+77011112233,2,1,0,0,0,0,3');
    });

    it('житель с нулевой активностью отображается с явными 0 по всем 6 счетчикам и не пропускается', async () => {
      // res-1 имеет 1 заявку, res-2 и res-3 не имеют ничего
      prismaMock.serviceRequest.groupBy.mockResolvedValue([
        { creatorId: 'res-1', _count: 1 },
      ]);

      const result = await service.exportResidentActivityCsv(mockTenantId, hoaAdminUser);
      const csvString = result.buffer.toString('utf-8');

      // res-3 (Ахметов Серик) имеет все нули
      expect(csvString).toContain('Ахметов Серик,+77033334455,0,0,0,0,0,0,0');
      // res-2 (Каримова Динара) имеет все нули
      expect(csvString).toContain('Каримова Динара,+77022223344,0,0,0,0,0,0,0');
    });

    it('каждый из 6 запросов groupBy и запрос списка жителей вызывается ровно один раз независимо от числа жителей (N+1 protection)', async () => {
      // Генерируем 15 жителей
      const fifteenResidents = Array.from({ length: 15 }, (_, i) => ({
        id: `resident-${i + 1}`,
        firstName: `Имя${i + 1}`,
        lastName: `Фамилия${i + 1}`,
        phone: `+770100000${String(i).padStart(2, '0')}`,
      }));
      prismaMock.user.findMany.mockResolvedValue(fifteenResidents);

      await service.exportResidentActivityCsv(mockTenantId, hoaAdminUser);

      // Ровно 1 вызов списка жителей
      expect(prismaMock.user.findMany).toHaveBeenCalledTimes(1);

      // Ровно 1 вызов на каждую из 6 категорий активности
      expect(prismaMock.vote.groupBy).toHaveBeenCalledTimes(1);
      expect(prismaMock.serviceRequest.groupBy).toHaveBeenCalledTimes(1);
      expect(prismaMock.booking.groupBy).toHaveBeenCalledTimes(1);
      expect(prismaMock.communityListing.groupBy).toHaveBeenCalledTimes(1);
      expect(prismaMock.chatMessage.groupBy).toHaveBeenCalledTimes(1);
      expect(prismaMock.meterReading.groupBy).toHaveBeenCalledTimes(1);
    });

    it('сортирует жителей по убыванию суммарной активности (totalActivity desc)', async () => {
      // res-1: total 5
      prismaMock.vote.groupBy.mockResolvedValue([{ userId: 'res-1', _count: 5 }]);
      // res-2: total 15
      prismaMock.chatMessage.groupBy.mockResolvedValue([{ senderId: 'res-2', _count: 15 }]);
      // res-3: total 0

      const result = await service.exportResidentActivityCsv(mockTenantId, hoaAdminUser);
      const csvString = result.buffer.toString('utf-8');

      const indexRes2 = csvString.indexOf('Каримова Динара'); // 15
      const indexRes1 = csvString.indexOf('Нурланов Алихан'); // 5
      const indexRes3 = csvString.indexOf('Ахметов Серик');   // 0

      expect(indexRes2).toBeGreaterThan(-1);
      expect(indexRes1).toBeGreaterThan(-1);
      expect(indexRes3).toBeGreaterThan(-1);

      // Порядок: res-2 (15) -> res-1 (5) -> res-3 (0)
      expect(indexRes2).toBeLessThan(indexRes1);
      expect(indexRes1).toBeLessThan(indexRes3);
    });

    it('отклоняет доступ для DISPATCHER, персонала чужого ЖК и обычных жильцов (403 Forbidden)', async () => {
      await expect(
        service.exportResidentActivityCsv(mockTenantId, dispatcherUser),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.exportResidentActivityCsv(mockTenantId, foreignHoaAdmin),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.exportResidentActivityCsv(mockTenantId, residentUser),
      ).rejects.toThrow(ForbiddenException);

      // Разрешено для председателя ОСИ и суперадмина
      await expect(
        service.exportResidentActivityCsv(mockTenantId, hoaChairmanUser),
      ).resolves.toBeDefined();

      await expect(
        service.exportResidentActivityCsv(mockTenantId, superadminUser),
      ).resolves.toBeDefined();
    });

    it('буфер CSV начинается с корректного UTF-8 BOM и имя файла содержит диапазон дат', async () => {
      const result = await service.exportResidentActivityCsv(mockTenantId, hoaAdminUser, {
        from: '2026-08-01',
        to: '2026-08-31',
      });

      // Проверяем UTF-8 BOM: 0xEF, 0xBB, 0xBF
      expect(result.buffer[0]).toBe(0xef);
      expect(result.buffer[1]).toBe(0xbb);
      expect(result.buffer[2]).toBe(0xbf);

      expect(result.filename).toBe(`resident-activity-${mockTenantId}-2026-08-01_2026-08-31.csv`);
    });
  });

  describe('getBookingUtilizationAnalytics (Task 0053: Bookable resource utilization analytics)', () => {
    const mockResources = [
      {
        id: 'res-bbq',
        name: 'Зона барбекю №1',
        type: 'BBQ',
        operatingHoursStart: '10:00',
        operatingHoursEnd: '18:00', // 8h/day
      },
      {
        id: 'res-parking',
        name: 'Гостевой паркинг',
        type: 'PARKING',
        operatingHoursStart: null,
        operatingHoursEnd: null, // 24h/day
      },
      {
        id: 'res-coworking',
        name: 'Коворкинг',
        type: 'COWORKING',
        operatingHoursStart: '08:00',
        operatingHoursEnd: '20:00', // 12h/day
      },
    ];

    it('только подтвержденные (CONFIRMED) бронирования учитываются в утилизации, отмененные (CANCELLED) исключены', async () => {
      prismaMock.bookableResource.findMany.mockResolvedValue([mockResources[0]]);

      // Ресурс имеет 3 CONFIRMED бронирования (по 2ч) и 1 CANCELLED (2ч)
      // В БД Prisma фильтрует статус CONFIRMED, имитируем возврат только CONFIRMED
      const confirmedBookings = [
        {
          resourceId: 'res-bbq',
          startTime: new Date('2026-09-01T10:00:00Z'),
          endTime: new Date('2026-09-01T12:00:00Z'),
        },
        {
          resourceId: 'res-bbq',
          startTime: new Date('2026-09-02T12:00:00Z'),
          endTime: new Date('2026-09-02T14:00:00Z'),
        },
        {
          resourceId: 'res-bbq',
          startTime: new Date('2026-09-03T14:00:00Z'),
          endTime: new Date('2026-09-03T16:00:00Z'),
        },
      ];
      prismaMock.booking.findMany.mockResolvedValue(confirmedBookings);

      const result = await service.getBookingUtilizationAnalytics(mockTenantId, hoaAdminUser, {
        from: '2026-09-01T00:00:00Z',
        to: '2026-09-10T23:59:59Z',
      });

      // Проверяем, что в prisma.booking.findMany передается status: CONFIRMED
      expect(prismaMock.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: BookingStatus.CONFIRMED,
          }),
        }),
      );

      expect(result.resources).toHaveLength(1);
      expect(result.resources[0].bookingsCount).toBe(3); // 3, а не 4
      expect(result.resources[0].totalBookedHours).toBe(6);
    });

    it('бронирование, чье startTime находится вне диапазона from/to, исключается из расчета (фильтр по startTime, а не createdAt)', async () => {
      prismaMock.bookableResource.findMany.mockResolvedValue([mockResources[0]]);
      prismaMock.booking.findMany.mockResolvedValue([]);

      const fromStr = '2026-09-05T00:00:00Z';
      const toStr = '2026-09-15T00:00:00Z';

      await service.getBookingUtilizationAnalytics(mockTenantId, hoaAdminUser, {
        from: fromStr,
        to: toStr,
      });

      expect(prismaMock.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            startTime: {
              gte: new Date(fromStr),
              lte: new Date(toStr),
            },
          }),
        }),
      );
    });

    it('математика процента утилизации: окно 8ч/день на 10 дней (80ч) и 40ч броней дает ровно 50%', async () => {
      prismaMock.bookableResource.findMany.mockResolvedValue([mockResources[0]]); // 10:00 - 18:00 = 8h/day

      // 10 дней: с 2026-09-01 по 2026-09-11 (10 суток)
      const from = new Date('2026-09-01T00:00:00Z');
      const to = new Date(from.getTime() + 10 * 24 * 60 * 60 * 1000); // ровно 10 дней

      // 40 часов суммарно забронировано (две брони по 20 часов)
      const b1Start = new Date('2026-09-01T10:00:00Z');
      const b1End = new Date(b1Start.getTime() + 20 * 60 * 60 * 1000);
      const b2Start = new Date('2026-09-02T10:00:00Z');
      const b2End = new Date(b2Start.getTime() + 20 * 60 * 60 * 1000);

      prismaMock.booking.findMany.mockResolvedValue([
        {
          resourceId: 'res-bbq',
          startTime: b1Start,
          endTime: b1End,
        },
        {
          resourceId: 'res-bbq',
          startTime: b2Start,
          endTime: b2End,
        },
      ]);

      const result = await service.getBookingUtilizationAnalytics(mockTenantId, hoaAdminUser, {
        from: from.toISOString(),
        to: to.toISOString(),
      });

      const bbq = result.resources[0];
      expect(bbq.availableHours).toBe(80); // 8h * 10 days = 80h
      expect(bbq.totalBookedHours).toBe(40);
      expect(bbq.utilizationPercent).toBe(50);
    });

    it('ресурс без operatingHoursStart/End считает себя доступным 24ч/день', async () => {
      prismaMock.bookableResource.findMany.mockResolvedValue([mockResources[1]]); // res-parking: null / null

      const from = new Date('2026-09-01T00:00:00Z');
      const to = new Date(from.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 дней

      prismaMock.booking.findMany.mockResolvedValue([]);

      const result = await service.getBookingUtilizationAnalytics(mockTenantId, hoaAdminUser, {
        from: from.toISOString(),
        to: to.toISOString(),
      });

      const parking = result.resources[0];
      expect(parking.availableHours).toBe(120); // 24h * 5 days = 120h
      expect(parking.bookingsCount).toBe(0);
      expect(parking.totalBookedHours).toBe(0);
      expect(parking.utilizationPercent).toBe(0);
    });

    it('ресурс с нулевым количеством бронирований за период отображается с явными нулями (zero-fill, не исключается)', async () => {
      prismaMock.bookableResource.findMany.mockResolvedValue([mockResources[2]]); // res-coworking
      prismaMock.booking.findMany.mockResolvedValue([]);

      const result = await service.getBookingUtilizationAnalytics(mockTenantId, hoaAdminUser);

      expect(result.resources).toHaveLength(1);
      expect(result.resources[0].resourceId).toBe('res-coworking');
      expect(result.resources[0].bookingsCount).toBe(0);
      expect(result.resources[0].totalBookedHours).toBe(0);
      expect(result.resources[0].utilizationPercent).toBe(0);
    });

    it('неактивный ресурс (isActive: false) никогда не попадает в выборку', async () => {
      prismaMock.bookableResource.findMany.mockResolvedValue([]);
      prismaMock.booking.findMany.mockResolvedValue([]);

      await service.getBookingUtilizationAnalytics(mockTenantId, hoaAdminUser);

      expect(prismaMock.bookableResource.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: mockTenantId,
            isActive: true,
          }),
        }),
      );
      expect(prismaMock.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            resource: expect.objectContaining({
              tenantId: mockTenantId,
              isActive: true,
            }),
          }),
        }),
      );
    });

    it('результаты сортируются по убыванию utilizationPercent, а при равенстве — по totalBookedHours', async () => {
      prismaMock.bookableResource.findMany.mockResolvedValue([
        mockResources[0], // BBQ: 8h/day * 10d = 80h avail
        mockResources[1], // Parking: 24h/day * 10d = 240h avail
        mockResources[2], // Coworking: 12h/day * 10d = 120h avail
      ]);

      const from = new Date('2026-09-01T00:00:00Z');
      const to = new Date(from.getTime() + 10 * 24 * 60 * 60 * 1000);

      // BBQ: 60h booked -> 60/80 = 75%
      // Parking: 120h booked -> 120/240 = 50%
      // Coworking: 90h booked -> 90/120 = 75%
      // BBQ and Coworking tie at 75%, tiebreak by totalBookedHours: Coworking (90h) > BBQ (60h)
      prismaMock.booking.findMany.mockResolvedValue([
        {
          resourceId: 'res-bbq',
          startTime: new Date('2026-09-01T00:00:00Z'),
          endTime: new Date('2026-09-03T12:00:00Z'), // 60h
        },
        {
          resourceId: 'res-coworking',
          startTime: new Date('2026-09-01T00:00:00Z'),
          endTime: new Date('2026-09-04T18:00:00Z'), // 90h
        },
        {
          resourceId: 'res-parking',
          startTime: new Date('2026-09-01T00:00:00Z'),
          endTime: new Date('2026-09-06T00:00:00Z'), // 120h
        },
      ]);

      const result = await service.getBookingUtilizationAnalytics(mockTenantId, hoaAdminUser, {
        from: from.toISOString(),
        to: to.toISOString(),
      });

      expect(result.resources).toHaveLength(3);
      // 1-й: Coworking (75%, 90h)
      expect(result.resources[0].resourceId).toBe('res-coworking');
      expect(result.resources[0].utilizationPercent).toBe(75);
      expect(result.resources[0].totalBookedHours).toBe(90);

      // 2-й: BBQ (75%, 60h)
      expect(result.resources[1].resourceId).toBe('res-bbq');
      expect(result.resources[1].utilizationPercent).toBe(75);
      expect(result.resources[1].totalBookedHours).toBe(60);

      // 3-й: Parking (50%, 120h)
      expect(result.resources[2].resourceId).toBe('res-parking');
      expect(result.resources[2].utilizationPercent).toBe(50);
      expect(result.resources[2].totalBookedHours).toBe(120);
    });

    it('доступ отклоняется для диспетчера, жильца и сотрудников других ЖК (assertStaffAccess)', async () => {
      prismaMock.bookableResource.findMany.mockResolvedValue([]);
      prismaMock.booking.findMany.mockResolvedValue([]);

      // Запрещено для DISPATCHER
      await expect(
        service.getBookingUtilizationAnalytics(mockTenantId, dispatcherUser),
      ).rejects.toThrow(ForbiddenException);

      // Запрещено для жителя
      await expect(
        service.getBookingUtilizationAnalytics(mockTenantId, residentUser),
      ).rejects.toThrow(ForbiddenException);

      // Запрещено для чужого ЖК
      await expect(
        service.getBookingUtilizationAnalytics(mockTenantId, foreignHoaAdmin),
      ).rejects.toThrow(ForbiddenException);

      // Разрешено для председателя ОСИ и суперадмина
      await expect(
        service.getBookingUtilizationAnalytics(mockTenantId, hoaChairmanUser),
      ).resolves.toBeDefined();

      await expect(
        service.getBookingUtilizationAnalytics(mockTenantId, superadminUser),
      ).resolves.toBeDefined();
    });
  });
});

