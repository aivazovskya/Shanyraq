import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole, RequestStatus } from '@prisma/client';

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
      user: {
        count: jest.fn(),
      },
      vote: {
        count: jest.fn(),
      },
      booking: {
        count: jest.fn(),
      },
      communityListing: {
        count: jest.fn(),
      },
      chatMessage: {
        count: jest.fn(),
      },
      meterReading: {
        count: jest.fn(),
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
});
