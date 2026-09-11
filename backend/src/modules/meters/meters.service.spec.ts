import { Test, TestingModule } from '@nestjs/testing';
import { MetersService } from './meters.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  UserRole,
  MeterType,
  ReadingStatus,
  OwnershipType,
} from '@prisma/client';

describe('MetersService (Приборы учёта, подача и верификация показаний)', () => {
  let service: MetersService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      unit: {
        findUnique: jest.fn(),
      },
      meter: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      meterReading: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      tenant: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetersService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<MetersService>(MetersService);
  });

  // -------------------------------------------------------------
  // 1. Регистрация и управление счётчиками (HOA_ADMIN / SUPERADMIN)
  // -------------------------------------------------------------
  describe('Meter Management', () => {
    it('должен успешно создавать счётчик для квартиры сотрудником ЖК', async () => {
      prismaMock.unit.findUnique.mockResolvedValue({
        id: 'unit-1',
        building: { tenantId: 'tenant-1' },
      });
      prismaMock.meter.create.mockResolvedValue({
        id: 'meter-1',
        unitId: 'unit-1',
        type: MeterType.COLD_WATER,
        serialNumber: 'CW-12345',
        initialValue: 10.5,
        isActive: true,
      });

      const user = { id: 'admin-1', role: UserRole.HOA_ADMIN, tenantId: 'tenant-1' };
      const res = await service.createMeter(
        'unit-1',
        {
          type: MeterType.COLD_WATER,
          serialNumber: 'CW-12345',
          initialValue: 10.5,
        },
        user,
      );

      expect(res.id).toBe('meter-1');
      expect(prismaMock.meter.create).toHaveBeenCalledWith({
        data: {
          unitId: 'unit-1',
          type: MeterType.COLD_WATER,
          serialNumber: 'CW-12345',
          initialValue: 10.5,
        },
      });
    });

    it('должен блокировать создание счётчика сотрудником чужого ЖК (BOLA)', async () => {
      prismaMock.unit.findUnique.mockResolvedValue({
        id: 'unit-1',
        building: { tenantId: 'tenant-1' },
      });

      const foreignAdmin = { id: 'admin-2', role: UserRole.HOA_ADMIN, tenantId: 'tenant-2' };

      await expect(
        service.createMeter(
          'unit-1',
          { type: MeterType.COLD_WATER },
          foreignAdmin,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('должен обновлять параметры счётчика или деактивировать его', async () => {
      prismaMock.meter.findUnique.mockResolvedValue({
        id: 'meter-1',
        unit: { building: { tenantId: 'tenant-1' } },
      });
      prismaMock.meter.update.mockResolvedValue({ id: 'meter-1', isActive: false });

      const user = { id: 'admin-1', role: UserRole.HOA_ADMIN, tenantId: 'tenant-1' };
      const res = await service.updateMeter('meter-1', { isActive: false }, user);

      expect(res.isActive).toBe(false);
      expect(prismaMock.meter.update).toHaveBeenCalledWith({
        where: { id: 'meter-1' },
        data: { isActive: false },
      });
    });
  });

  // -------------------------------------------------------------
  // 2. Подача показаний жильцами (OWNER & TENANT)
  // -------------------------------------------------------------
  describe('Reading Submission', () => {
    const mockMeter = {
      id: 'meter-1',
      unitId: 'unit-1',
      initialValue: 50,
      isActive: true,
      unit: {
        building: { tenantId: 'tenant-1' },
        ownerships: [
          { userId: 'resident-owner', isVerified: true, ownershipType: OwnershipType.OWNER },
          { userId: 'resident-tenant', isVerified: true, ownershipType: OwnershipType.TENANT },
        ],
      },
    };

    it('должен разрешать подачу показаний подтверждённому собственнику (RESIDENT_OWNER)', async () => {
      prismaMock.meter.findUnique.mockResolvedValue(mockMeter);
      prismaMock.meterReading.findFirst.mockResolvedValue(null); // нет предыдущих верифицированных
      prismaMock.meterReading.findUnique.mockResolvedValue(null); // нет записи за этот период
      prismaMock.meterReading.create.mockResolvedValue({
        id: 'reading-1',
        value: 55,
        status: ReadingStatus.PENDING,
      });

      const user = { id: 'resident-owner', role: UserRole.RESIDENT_OWNER, tenantId: 'tenant-1' };
      const res = await service.submitReading(
        'meter-1',
        { value: 55, photoUrl: 'https://s3/photo1.jpg', month: 9, year: 2026 },
        user,
      );

      expect(res.id).toBe('reading-1');
      expect(prismaMock.meterReading.create).toHaveBeenCalledWith({
        data: {
          meterId: 'meter-1',
          submittedById: 'resident-owner',
          value: 55,
          photoUrl: 'https://s3/photo1.jpg',
          periodMonth: 9,
          periodYear: 2026,
          status: ReadingStatus.PENDING,
        },
      });
    });

    it('должен разрешать подачу показаний подтверждённому арендатору (RESIDENT_TENANT)', async () => {
      prismaMock.meter.findUnique.mockResolvedValue(mockMeter);
      prismaMock.meterReading.findFirst.mockResolvedValue({ value: 55, status: ReadingStatus.VERIFIED });
      prismaMock.meterReading.findUnique.mockResolvedValue(null);
      prismaMock.meterReading.create.mockResolvedValue({
        id: 'reading-2',
        value: 60,
        status: ReadingStatus.PENDING,
      });

      const user = { id: 'resident-tenant', role: UserRole.RESIDENT_TENANT, tenantId: 'tenant-1' };
      const res = await service.submitReading(
        'meter-1',
        { value: 60, photoUrl: 'https://s3/photo2.jpg', month: 10, year: 2026 },
        user,
      );

      expect(res.id).toBe('reading-2');
    });

    it('должен блокировать подачу показаний жителем другой квартиры', async () => {
      prismaMock.meter.findUnique.mockResolvedValue(mockMeter);

      const foreignResident = { id: 'other-user', role: UserRole.RESIDENT_OWNER, tenantId: 'tenant-1' };

      await expect(
        service.submitReading(
          'meter-1',
          { value: 60, photoUrl: 'https://s3/photo.jpg', month: 9, year: 2026 },
          foreignResident,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('должен отклонять показание меньшее, чем последнее подтверждённое (value-must-not-decrease)', async () => {
      prismaMock.meter.findUnique.mockResolvedValue(mockMeter);
      prismaMock.meterReading.findFirst.mockResolvedValue({ value: 80, status: ReadingStatus.VERIFIED });

      const user = { id: 'resident-owner', role: UserRole.RESIDENT_OWNER, tenantId: 'tenant-1' };

      await expect(
        service.submitReading(
          'meter-1',
          { value: 75, photoUrl: 'https://s3/photo.jpg', month: 9, year: 2026 }, // 75 < 80
          user,
        ),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.submitReading(
          'meter-1',
          { value: 75, photoUrl: 'https://s3/photo.jpg', month: 9, year: 2026 },
          user,
        );
        fail('Should throw');
      } catch (err: any) {
        expect(err.getResponse().code).toBe('METERS.VALUE_BELOW_BASELINE');
        expect(err.getResponse().params).toEqual({ value: 75, baseline: 80 });
      }
    });

    it('должен отклонять показание меньшее, чем initialValue, если ещё нет подтверждённых', async () => {
      prismaMock.meter.findUnique.mockResolvedValue(mockMeter); // initialValue: 50
      prismaMock.meterReading.findFirst.mockResolvedValue(null);

      const user = { id: 'resident-owner', role: UserRole.RESIDENT_OWNER, tenantId: 'tenant-1' };

      await expect(
        service.submitReading(
          'meter-1',
          { value: 45, photoUrl: 'https://s3/photo.jpg', month: 9, year: 2026 }, // 45 < 50
          user,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('должен разрешать повторную подачу (resubmission) отклонённого показания за тот же период', async () => {
      prismaMock.meter.findUnique.mockResolvedValue(mockMeter);
      prismaMock.meterReading.findFirst.mockResolvedValue({ value: 50, status: ReadingStatus.VERIFIED });
      prismaMock.meterReading.findUnique.mockResolvedValue({
        id: 'reading-rejected',
        status: ReadingStatus.REJECTED,
        reviewNote: 'Фото нечёткое',
      });
      prismaMock.meterReading.update.mockResolvedValue({
        id: 'reading-rejected',
        value: 58,
        status: ReadingStatus.PENDING,
      });

      const user = { id: 'resident-owner', role: UserRole.RESIDENT_OWNER, tenantId: 'tenant-1' };
      const res = await service.submitReading(
        'meter-1',
        { value: 58, photoUrl: 'https://s3/new-clear-photo.jpg', month: 9, year: 2026 },
        user,
      );

      expect(res.id).toBe('reading-rejected');
      expect(prismaMock.meterReading.update).toHaveBeenCalledWith({
        where: { id: 'reading-rejected' },
        data: {
          value: 58,
          photoUrl: 'https://s3/new-clear-photo.jpg',
          status: ReadingStatus.PENDING,
          submittedById: 'resident-owner',
          reviewedById: null,
          reviewNote: null,
        },
      });
    });

    it('должен блокировать подачу, если показание за этот период уже PENDING или VERIFIED', async () => {
      prismaMock.meter.findUnique.mockResolvedValue(mockMeter);
      prismaMock.meterReading.findFirst.mockResolvedValue(null);
      prismaMock.meterReading.findUnique.mockResolvedValue({
        id: 'reading-pending',
        status: ReadingStatus.PENDING,
      });

      const user = { id: 'resident-owner', role: UserRole.RESIDENT_OWNER, tenantId: 'tenant-1' };

      await expect(
        service.submitReading(
          'meter-1',
          { value: 55, photoUrl: 'https://s3/photo.jpg', month: 9, year: 2026 },
          user,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -------------------------------------------------------------
  // 3. Проверка показаний (Диспетчер, УК, Супер-админ)
  // -------------------------------------------------------------
  describe('Reading Review', () => {
    const mockReading = {
      id: 'reading-1',
      status: ReadingStatus.PENDING,
      meter: {
        unit: {
          building: { tenantId: 'tenant-1' },
        },
      },
    };

    it('DISPATCHER должен иметь право подтвердить показание', async () => {
      prismaMock.meterReading.findUnique.mockResolvedValue(mockReading);
      prismaMock.meterReading.update.mockResolvedValue({
        id: 'reading-1',
        status: ReadingStatus.VERIFIED,
      });

      const dispatcher = { id: 'disp-1', role: UserRole.DISPATCHER, tenantId: 'tenant-1' };
      const res = await service.reviewReading(
        'reading-1',
        { status: ReadingStatus.VERIFIED },
        dispatcher,
      );

      expect(res.status).toBe(ReadingStatus.VERIFIED);
      expect(prismaMock.meterReading.update).toHaveBeenCalledWith({
        where: { id: 'reading-1' },
        data: {
          status: ReadingStatus.VERIFIED,
          reviewNote: null,
          reviewedById: 'disp-1',
        },
      });
    });

    it('HOA_ADMIN должен иметь право отклонить показание с указанием причины', async () => {
      prismaMock.meterReading.findUnique.mockResolvedValue(mockReading);
      prismaMock.meterReading.update.mockResolvedValue({
        id: 'reading-1',
        status: ReadingStatus.REJECTED,
        reviewNote: 'Фото нечитаемо',
      });

      const admin = { id: 'admin-1', role: UserRole.HOA_ADMIN, tenantId: 'tenant-1' };
      const res = await service.reviewReading(
        'reading-1',
        { status: ReadingStatus.REJECTED, note: 'Фото нечитаемо' },
        admin,
      );

      expect(res.status).toBe(ReadingStatus.REJECTED);
      expect(prismaMock.meterReading.update).toHaveBeenCalledWith({
        where: { id: 'reading-1' },
        data: {
          status: ReadingStatus.REJECTED,
          reviewNote: 'Фото нечитаемо',
          reviewedById: 'admin-1',
        },
      });
    });

    it('должен блокировать проверку показаний сотрудником чужого ЖК (BOLA)', async () => {
      prismaMock.meterReading.findUnique.mockResolvedValue(mockReading);

      const foreignDispatcher = { id: 'disp-2', role: UserRole.DISPATCHER, tenantId: 'tenant-2' };

      await expect(
        service.reviewReading(
          'reading-1',
          { status: ReadingStatus.VERIFIED },
          foreignDispatcher,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('должен возвращать очередь поданных показаний по ЖК для сотрудников', async () => {
      prismaMock.meterReading.findMany.mockResolvedValue([
        { id: 'r-1', status: ReadingStatus.PENDING },
      ]);

      const staff = { id: 'chair-1', role: UserRole.HOA_CHAIRMAN, tenantId: 'tenant-1' };
      const res = await service.getTenantReadingsQueue('tenant-1', ReadingStatus.PENDING, staff);

      expect(res).toHaveLength(1);
      expect(prismaMock.meterReading.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            meter: { unit: { building: { tenantId: 'tenant-1' } } },
            status: ReadingStatus.PENDING,
          },
        }),
      );
    });
  });

  // -------------------------------------------------------------
  // 4. Доступ к приборам учёта и показаниям (Task 0040: staff-vs-resident access control)
  // -------------------------------------------------------------
  describe('Meter Access Control (Task 0040: getUnitMeters & getMeterReadings)', () => {
    describe('getUnitMeters', () => {
      const mockUnitWithMeters = {
        id: 'unit-1',
        building: { tenantId: 'tenant-1' },
        ownerships: [
          { userId: 'resident-verified', isVerified: true },
          { userId: 'resident-unverified', isVerified: false },
        ],
      };

      it('должен выбрасывать NotFoundException (METERS.UNIT_NOT_FOUND), если квартира не найдена', async () => {
        prismaMock.unit.findUnique.mockResolvedValue(null);

        const user = { id: 'admin-1', role: UserRole.HOA_ADMIN, tenantId: 'tenant-1' };
        try {
          await service.getUnitMeters('non-existent-unit', user);
          fail('Should have thrown NotFoundException');
        } catch (err: any) {
          expect(err).toBeInstanceOf(NotFoundException);
          expect(err.getResponse().code).toBe('METERS.UNIT_NOT_FOUND');
        }
      });

      it('должен разрешать доступ сотруднику своего ЖК (HOA_ADMIN, DISPATCHER, HOA_CHAIRMAN, SUPERADMIN)', async () => {
        prismaMock.unit.findUnique.mockResolvedValue(mockUnitWithMeters);
        prismaMock.meter.findMany.mockResolvedValue([
          { id: 'meter-1', unitId: 'unit-1', isActive: true, readings: [] },
        ]);

        const admin = { id: 'admin-1', role: UserRole.HOA_ADMIN, tenantId: 'tenant-1' };
        const resAdmin = await service.getUnitMeters('unit-1', admin);
        expect(resAdmin).toHaveLength(1);
        expect(resAdmin[0].id).toBe('meter-1');

        const superadmin = { id: 'super-1', role: UserRole.SUPERADMIN, tenantId: null };
        const resSuper = await service.getUnitMeters('unit-1', superadmin);
        expect(resSuper).toHaveLength(1);
      });

      it('должен блокировать доступ сотруднику чужого ЖК (assertUserBelongsToTenant)', async () => {
        prismaMock.unit.findUnique.mockResolvedValue(mockUnitWithMeters);

        const foreignDispatcher = { id: 'disp-alien', role: UserRole.DISPATCHER, tenantId: 'tenant-alien' };
        await expect(
          service.getUnitMeters('unit-1', foreignDispatcher),
        ).rejects.toThrow(ForbiddenException);
      });

      it('должен разрешать доступ подтвержденному жильцу квартиры', async () => {
        prismaMock.unit.findUnique.mockResolvedValue(mockUnitWithMeters);
        prismaMock.meter.findMany.mockResolvedValue([
          { id: 'meter-1', unitId: 'unit-1', isActive: true, readings: [] },
        ]);

        const verifiedResident = {
          id: 'resident-verified',
          role: UserRole.RESIDENT_OWNER,
          tenantId: 'tenant-1',
        };
        const res = await service.getUnitMeters('unit-1', verifiedResident);
        expect(res).toHaveLength(1);
        expect(prismaMock.meter.findMany).toHaveBeenCalledWith({
          where: { unitId: 'unit-1', isActive: true },
          include: {
            readings: {
              orderBy: [
                { periodYear: 'desc' },
                { periodMonth: 'desc' },
                { createdAt: 'desc' },
              ],
              take: 1,
            },
          },
          orderBy: { createdAt: 'asc' },
        });
      });

      it('должен блокировать доступ жителю без подтвержденного права владения на данную квартиру (METERS.FOREIGN_UNIT_FORBIDDEN)', async () => {
        prismaMock.unit.findUnique.mockResolvedValue(mockUnitWithMeters);

        // Случай 1: Неподтвержденное право владения
        const unverifiedResident = {
          id: 'resident-unverified',
          role: UserRole.RESIDENT_OWNER,
          tenantId: 'tenant-1',
        };
        try {
          await service.getUnitMeters('unit-1', unverifiedResident);
          fail('Should have thrown ForbiddenException');
        } catch (err: any) {
          expect(err).toBeInstanceOf(ForbiddenException);
          expect(err.getResponse().code).toBe('METERS.FOREIGN_UNIT_FORBIDDEN');
        }

        // Случай 2: Житель другой квартиры вообще (нет в unit.ownerships)
        const foreignResident = {
          id: 'resident-other-unit',
          role: UserRole.RESIDENT_OWNER,
          tenantId: 'tenant-1',
        };
        try {
          await service.getUnitMeters('unit-1', foreignResident);
          fail('Should have thrown ForbiddenException');
        } catch (err: any) {
          expect(err).toBeInstanceOf(ForbiddenException);
          expect(err.getResponse().code).toBe('METERS.FOREIGN_UNIT_FORBIDDEN');
        }
      });
    });

    describe('getMeterReadings', () => {
      const mockMeterWithUnit = {
        id: 'meter-1',
        unitId: 'unit-1',
        unit: {
          id: 'unit-1',
          building: { tenantId: 'tenant-1' },
          ownerships: [
            { userId: 'resident-verified', isVerified: true },
            { userId: 'resident-unverified', isVerified: false },
          ],
        },
      };

      it('должен выбрасывать NotFoundException (METERS.METER_NOT_FOUND), если счётчик не найден', async () => {
        prismaMock.meter.findUnique.mockResolvedValue(null);

        const user = { id: 'admin-1', role: UserRole.HOA_ADMIN, tenantId: 'tenant-1' };
        try {
          await service.getMeterReadings('non-existent-meter', user);
          fail('Should have thrown NotFoundException');
        } catch (err: any) {
          expect(err).toBeInstanceOf(NotFoundException);
          expect(err.getResponse().code).toBe('METERS.METER_NOT_FOUND');
        }
      });

      it('должен разрешать доступ к показаниям сотруднику своего ЖК (HOA_ADMIN, DISPATCHER, SUPERADMIN)', async () => {
        prismaMock.meter.findUnique.mockResolvedValue(mockMeterWithUnit);
        prismaMock.meterReading.findMany.mockResolvedValue([
          { id: 'reading-1', meterId: 'meter-1', value: 100 },
        ]);

        const admin = { id: 'admin-1', role: UserRole.HOA_ADMIN, tenantId: 'tenant-1' };
        const resAdmin = await service.getMeterReadings('meter-1', admin);
        expect(resAdmin).toHaveLength(1);
        expect(resAdmin[0].id).toBe('reading-1');

        const superadmin = { id: 'super-1', role: UserRole.SUPERADMIN, tenantId: null };
        const resSuper = await service.getMeterReadings('meter-1', superadmin);
        expect(resSuper).toHaveLength(1);
      });

      it('должен блокировать доступ к показаниям сотруднику чужого ЖК', async () => {
        prismaMock.meter.findUnique.mockResolvedValue(mockMeterWithUnit);

        const foreignStaff = { id: 'staff-alien', role: UserRole.HOA_CHAIRMAN, tenantId: 'tenant-alien' };
        await expect(
          service.getMeterReadings('meter-1', foreignStaff),
        ).rejects.toThrow(ForbiddenException);
      });

      it('должен разрешать доступ к показаниям подтвержденному жильцу квартиры', async () => {
        prismaMock.meter.findUnique.mockResolvedValue(mockMeterWithUnit);
        prismaMock.meterReading.findMany.mockResolvedValue([
          { id: 'reading-1', meterId: 'meter-1', value: 100 },
        ]);

        const verifiedResident = {
          id: 'resident-verified',
          role: UserRole.RESIDENT_OWNER,
          tenantId: 'tenant-1',
        };
        const res = await service.getMeterReadings('meter-1', verifiedResident);
        expect(res).toHaveLength(1);
        expect(prismaMock.meterReading.findMany).toHaveBeenCalledWith({
          where: { meterId: 'meter-1' },
          include: {
            submittedBy: {
              select: { id: true, firstName: true, lastName: true },
            },
            reviewedBy: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
          orderBy: [
            { periodYear: 'desc' },
            { periodMonth: 'desc' },
            { createdAt: 'desc' },
          ],
        });
      });

      it('должен блокировать доступ к показаниям жителю без подтвержденного права владения на квартиру (METERS.FOREIGN_READINGS_FORBIDDEN)', async () => {
        prismaMock.meter.findUnique.mockResolvedValue(mockMeterWithUnit);

        // Случай 1: Неподтвержденное право владения
        const unverifiedResident = {
          id: 'resident-unverified',
          role: UserRole.RESIDENT_OWNER,
          tenantId: 'tenant-1',
        };
        try {
          await service.getMeterReadings('meter-1', unverifiedResident);
          fail('Should have thrown ForbiddenException');
        } catch (err: any) {
          expect(err).toBeInstanceOf(ForbiddenException);
          expect(err.getResponse().code).toBe('METERS.FOREIGN_READINGS_FORBIDDEN');
        }

        // Случай 2: Житель другой квартиры
        const foreignResident = {
          id: 'resident-other-unit',
          role: UserRole.RESIDENT_OWNER,
          tenantId: 'tenant-1',
        };
        try {
          await service.getMeterReadings('meter-1', foreignResident);
          fail('Should have thrown ForbiddenException');
        } catch (err: any) {
          expect(err).toBeInstanceOf(ForbiddenException);
          expect(err.getResponse().code).toBe('METERS.FOREIGN_READINGS_FORBIDDEN');
        }
      });
    });
  });

  // -------------------------------------------------------------
  // 4. Экспорт истории показаний в CSV (Task 0055)
  // -------------------------------------------------------------
  describe('exportReadingsCsv (Task 0055: Meter reading history CSV export)', () => {
    const mockTenantStaff = {
      id: 'staff-1',
      role: UserRole.HOA_ADMIN,
      tenantId: 'tenant-1',
    };

    const mockDispatcher = {
      id: 'disp-1',
      role: UserRole.DISPATCHER,
      tenantId: 'tenant-1',
    };

    const mockChairman = {
      id: 'chair-1',
      role: UserRole.HOA_CHAIRMAN,
      tenantId: 'tenant-1',
    };

    const mockSuperadmin = {
      id: 'super-1',
      role: UserRole.SUPERADMIN,
      tenantId: null,
    };

    const mockResident = {
      id: 'res-1',
      role: UserRole.RESIDENT_OWNER,
      tenantId: 'tenant-1',
    };

    const mockSecurity = {
      id: 'sec-1',
      role: UserRole.SECURITY,
      tenantId: 'tenant-1',
    };

    const mockForeignStaff = {
      id: 'foreign-admin',
      role: UserRole.HOA_ADMIN,
      tenantId: 'tenant-alien',
    };

    beforeEach(() => {
      prismaMock.tenant.findUnique.mockResolvedValue({
        id: 'tenant-1',
        name: 'ЖК Шанырақ Премиум',
      });
    });

    it('должен включать только показания запрошенного расчетного периода (month/year) и исключать другие месяцы', async () => {
      const mockReadings = [
        {
          id: 'reading-sep-2026',
          meterId: 'meter-1',
          value: 154.2,
          periodMonth: 9,
          periodYear: 2026,
          status: ReadingStatus.VERIFIED,
          createdAt: new Date('2026-09-12T10:30:00.000Z'),
          reviewNote: 'Принято',
          meter: {
            type: MeterType.COLD_WATER,
            serialNumber: 'CW-998877',
            unit: {
              unitNumber: '101',
              building: {
                blockName: 'Блок A',
                tenantId: 'tenant-1',
              },
            },
          },
          submittedBy: {
            id: 'user-1',
            firstName: 'Арман',
            lastName: 'Касымов',
            phone: '+77015550101',
          },
          reviewedBy: {
            id: 'staff-1',
            firstName: 'Данияр',
            lastName: 'Сериков',
          },
        },
      ];

      prismaMock.meterReading.findMany.mockResolvedValue(mockReadings);

      const result = await service.exportReadingsCsv('tenant-1', mockTenantStaff, {
        month: 9,
        year: 2026,
      });

      // Проверяем аргументы запроса к базе данных: строгая фильтрация по периоду
      expect(prismaMock.meterReading.findMany).toHaveBeenCalledWith({
        where: {
          meter: {
            unit: {
              building: { tenantId: 'tenant-1' },
            },
          },
          periodMonth: 9,
          periodYear: 2026,
        },
        include: {
          meter: {
            include: {
              unit: {
                include: { building: true },
              },
            },
          },
          submittedBy: {
            select: { id: true, firstName: true, lastName: true, phone: true },
          },
          reviewedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(result.filename).toBe('meter-readings-tenant-1-09.2026.csv');
      const csv = result.buffer.toString('utf-8');
      expect(csv).toContain('ЖК Шанырақ Премиум');
      expect(csv).toContain('09.2026');
      expect(csv).toContain('101');
      expect(csv).toContain('Блок A');
      expect(csv).toContain('Холодная вода');
      expect(csv).toContain('CW-998877');
      expect(csv).toContain('154.2');
      expect(csv).toContain('Подтверждено');
      expect(csv).toContain('Касымов Арман');
      expect(csv).toContain('+77015550101');
      expect(csv).toContain('Сериков Данияр');
      expect(csv).toContain('Принято');
    });

    it('должен включать показания всех статусов (PENDING, VERIFIED, REJECTED) без фильтрации по статусу', async () => {
      const mockReadings = [
        {
          id: 'reading-pending',
          value: 100.1,
          status: ReadingStatus.PENDING,
          createdAt: new Date('2026-09-05T08:00:00.000Z'),
          reviewNote: null,
          meter: {
            type: MeterType.COLD_WATER,
            serialNumber: 'CW-111',
            unit: { unitNumber: '10', building: { blockName: 'Блок 1' } },
          },
          submittedBy: { firstName: 'Али', lastName: 'Алиев', phone: '+77011112233' },
          reviewedBy: null,
        },
        {
          id: 'reading-verified',
          value: 200.2,
          status: ReadingStatus.VERIFIED,
          createdAt: new Date('2026-09-06T09:00:00.000Z'),
          reviewNote: 'Ок',
          meter: {
            type: MeterType.HOT_WATER,
            serialNumber: 'HW-222',
            unit: { unitNumber: '20', building: { blockName: 'Блок 2' } },
          },
          submittedBy: { firstName: 'Бакыт', lastName: 'Бакиров', phone: '+77012223344' },
          reviewedBy: { firstName: 'Даулет', lastName: 'Даулетов' },
        },
        {
          id: 'reading-rejected',
          value: 300.3,
          status: ReadingStatus.REJECTED,
          createdAt: new Date('2026-09-07T10:00:00.000Z'),
          reviewNote: 'Размытое фото',
          meter: {
            type: MeterType.ELECTRICITY,
            serialNumber: 'EL-333',
            unit: { unitNumber: '30', building: { blockName: 'Блок 3' } },
          },
          submittedBy: { firstName: 'Ерлан', lastName: 'Ерланов', phone: '+77013334455' },
          reviewedBy: { firstName: 'Даулет', lastName: 'Даулетов' },
        },
      ];

      prismaMock.meterReading.findMany.mockResolvedValue(mockReadings);

      const result = await service.exportReadingsCsv('tenant-1', mockDispatcher, {
        month: 9,
        year: 2026,
      });

      const csv = result.buffer.toString('utf-8');
      expect(csv).toContain('100.1');
      expect(csv).toContain('На проверке');
      expect(csv).toContain('Алиев Али');

      expect(csv).toContain('200.2');
      expect(csv).toContain('Подтверждено');
      expect(csv).toContain('Бакиров Бакыт');

      expect(csv).toContain('300.3');
      expect(csv).toContain('Отклонено');
      expect(csv).toContain('Размытое фото');
      expect(csv).toContain('Ерланов Ерлан');
    });

    it('должен блокировать доступ жителям, службе охраны и сотрудникам чужого ЖК', async () => {
      // 1. Житель своего ЖК (RESIDENT_OWNER)
      await expect(
        service.exportReadingsCsv('tenant-1', mockResident),
      ).rejects.toThrow(ForbiddenException);

      // 2. Охранник (SECURITY)
      await expect(
        service.exportReadingsCsv('tenant-1', mockSecurity),
      ).rejects.toThrow(ForbiddenException);

      // 3. Сотрудник чужого ЖК (BOLA / IDOR protection)
      await expect(
        service.exportReadingsCsv('tenant-1', mockForeignStaff),
      ).rejects.toThrow(ForbiddenException);

      // 4. Разрешенные роли: DISPATCHER, HOA_ADMIN, HOA_CHAIRMAN, SUPERADMIN
      prismaMock.meterReading.findMany.mockResolvedValue([]);

      await expect(
        service.exportReadingsCsv('tenant-1', mockTenantStaff),
      ).resolves.toBeDefined();
      await expect(
        service.exportReadingsCsv('tenant-1', mockDispatcher),
      ).resolves.toBeDefined();
      await expect(
        service.exportReadingsCsv('tenant-1', mockChairman),
      ).resolves.toBeDefined();
      await expect(
        service.exportReadingsCsv('tenant-1', mockSuperadmin),
      ).resolves.toBeDefined();
    });

    it('сформированный CSV буфер должен начинаться с байтов UTF-8 BOM (0xEF, 0xBB, 0xBF)', async () => {
      prismaMock.meterReading.findMany.mockResolvedValue([]);

      const { buffer } = await service.exportReadingsCsv('tenant-1', mockTenantStaff, {
        month: 9,
        year: 2026,
      });

      expect(buffer[0]).toBe(0xef);
      expect(buffer[1]).toBe(0xbb);
      expect(buffer[2]).toBe(0xbf);
    });

    it('при отсутствии параметров month и year должен использовать текущий расчетный период по умолчанию', async () => {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      prismaMock.meterReading.findMany.mockResolvedValue([]);

      const result = await service.exportReadingsCsv('tenant-1', mockTenantStaff);

      expect(prismaMock.meterReading.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            periodMonth: currentMonth,
            periodYear: currentYear,
          }),
        }),
      );

      const expectedFilename = `meter-readings-tenant-1-${String(currentMonth).padStart(2, '0')}.${currentYear}.csv`;
      expect(result.filename).toBe(expectedFilename);
    });
  });
});
