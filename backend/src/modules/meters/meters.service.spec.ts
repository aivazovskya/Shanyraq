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
});
