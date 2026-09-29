import { Test, TestingModule } from '@nestjs/testing';
import { FinanceService } from './finance.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import {
  UserRole,
  OwnershipType,
  ChargeCalculationMethod,
  PaymentMethod,
  MeterType,
  ReadingStatus,
} from '@prisma/client';
import { generateAccountNumber, getOrCreatePersonalAccount } from './personal-account.helper';
import { validationExceptionFactory } from '../../common/pipes/validation-exception.factory';
import { TransparencyReportQueryDto } from './dto/finance.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AnalyticsService } from '../analytics/analytics.service';

describe('FinanceService (Лицевые счета, тарифы, начисления и оплаты)', () => {
  let service: FinanceService;
  let prismaMock: any;
  let auditLogServiceMock: any;

  beforeEach(async () => {
    auditLogServiceMock = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    prismaMock = {
      tenant: {
        findUnique: jest.fn(),
      },
      tariffItem: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      unit: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      personalAccount: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      charge: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        aggregate: jest.fn(),
        groupBy: jest.fn(),
      },
      payment: {
        create: jest.fn(),
        aggregate: jest.fn(),
      },
      unitOwnership: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      meter: {
        findFirst: jest.fn(),
      },
      meterReading: {
        findFirst: jest.fn(),
      },
      expense: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        aggregate: jest.fn(),
        groupBy: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinanceService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditLogService, useValue: auditLogServiceMock },
        { provide: AnalyticsService, useValue: new AnalyticsService(prismaMock) },
      ],
    }).compile();


    service = module.get<FinanceService>(FinanceService);
  });

  // -------------------------------------------------------------
  // 1. Управление тарифами
  // -------------------------------------------------------------
  describe('Tariff Management (CRUD & Изоляция)', () => {
    it('должен возвращать список тарифов ЖК', async () => {
      prismaMock.tariffItem.findMany.mockResolvedValue([
        {
          id: 'tariff-1',
          tenantId: 'tenant-1',
          name: 'РСЖ',
          calculationMethod: ChargeCalculationMethod.PER_AREA,
          rate: 110.0,
          isActive: true,
        },
      ]);

      const res = await service.getTariffs('tenant-1');
      expect(res).toHaveLength(1);
      expect(res[0].name).toBe('РСЖ');
      expect(prismaMock.tariffItem.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('должен успешно создавать тариф в ЖК и логировать TARIFF_CREATED', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue({ id: 'tenant-1' });
      prismaMock.tariffItem.create.mockResolvedValue({
        id: 'tariff-new',
        tenantId: 'tenant-1',
        name: 'Домофон',
        calculationMethod: ChargeCalculationMethod.FLAT,
        rate: 450.0,
      });

      const staff = { id: 'admin-1', tenantId: 'tenant-1', role: UserRole.HOA_ADMIN };
      const res = await service.createTariff('tenant-1', staff, {
        name: 'Домофон',
        calculationMethod: ChargeCalculationMethod.FLAT,
        rate: 450.0,
      });

      expect(res.name).toBe('Домофон');
      expect(res.rate).toBe(450.0);
      expect(auditLogServiceMock.log).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        actorId: 'admin-1',
        action: 'TARIFF_CREATED',
        targetType: 'TariffItem',
        targetId: 'tariff-new',
        metadata: {
          name: 'Домофон',
          calculationMethod: ChargeCalculationMethod.FLAT,
          rate: 450.0,
        },
      });
    });

    it('НЕ должен логировать TARIFF_CREATED, если создание тарифа отклонено валидацией', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue({ id: 'tenant-1' });

      const staff = { id: 'admin-1', tenantId: 'tenant-1', role: UserRole.HOA_ADMIN };
      await expect(
        service.createTariff('tenant-1', staff, {
          name: 'Вода',
          calculationMethod: ChargeCalculationMethod.PER_CONSUMPTION,
          rate: 150.0,
          // meterType отсутствует
        }),
      ).rejects.toThrow(BadRequestException);

      expect(auditLogServiceMock.log).not.toHaveBeenCalled();
    });

    it('должен блокировать редактирование тарифа сотрудником чужого ЖК (BOLA)', async () => {
      prismaMock.tariffItem.findUnique.mockResolvedValue({
        id: 'tariff-1',
        tenantId: 'tenant-A',
        name: 'Лифт',
      });

      const foreignStaff = { id: 'u-foreign', tenantId: 'tenant-B', role: UserRole.HOA_ADMIN };

      await expect(
        service.updateTariff('tariff-1', foreignStaff, { rate: 800 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('должен разрешать редактирование тарифа SUPERADMIN в любом ЖК', async () => {
      prismaMock.tariffItem.findUnique.mockResolvedValue({
        id: 'tariff-1',
        tenantId: 'tenant-A',
        name: 'Лифт',
        rate: 750,
      });
      prismaMock.tariffItem.update.mockResolvedValue({
        id: 'tariff-1',
        tenantId: 'tenant-A',
        name: 'Лифт',
        rate: 800,
      });

      const superadmin = { id: 'u-super', tenantId: null, role: UserRole.SUPERADMIN };
      const res = await service.updateTariff('tariff-1', superadmin, { rate: 800 });

      expect(res.rate).toBe(800);
      expect(prismaMock.tariffItem.update).toHaveBeenCalled();
      expect(auditLogServiceMock.log).toHaveBeenCalledWith({
        tenantId: 'tenant-A',
        actorId: 'u-super',
        action: 'TARIFF_UPDATED',
        targetType: 'TariffItem',
        targetId: 'tariff-1',
        metadata: {
          before: {
            name: 'Лифт',
            calculationMethod: undefined,
            rate: 750,
            isActive: undefined,
          },
          after: {
            rate: 800,
          },
        },
      });
    });

    it('НЕ должен логировать TARIFF_UPDATED, если обновление тарифа отклонено валидацией (например METER_TYPE_REQUIRED)', async () => {
      prismaMock.tariffItem.findUnique.mockResolvedValue({
        id: 'tariff-1',
        tenantId: 'tenant-1',
        name: 'Вода',
        calculationMethod: ChargeCalculationMethod.FLAT,
        meterType: null,
      });

      const staff = { id: 'admin-1', tenantId: 'tenant-1', role: UserRole.HOA_ADMIN };
      await expect(
        service.updateTariff('tariff-1', staff, {
          calculationMethod: ChargeCalculationMethod.PER_CONSUMPTION,
          // meterType отсутствует
        }),
      ).rejects.toThrow(BadRequestException);

      expect(auditLogServiceMock.log).not.toHaveBeenCalled();
    });

    it('должен мягко удалять тариф (isActive: false)', async () => {
      prismaMock.tariffItem.findUnique.mockResolvedValue({
        id: 'tariff-1',
        tenantId: 'tenant-1',
        name: 'Домофон',
      });
      prismaMock.tariffItem.update.mockResolvedValue({
        id: 'tariff-1',
        isActive: false,
      });

      const staff = { id: 'u-1', tenantId: 'tenant-1', role: UserRole.HOA_ADMIN };
      const res = await service.deleteTariff('tariff-1', staff);

      expect(res.isActive).toBe(false);
      expect(prismaMock.tariffItem.update).toHaveBeenCalledWith({
        where: { id: 'tariff-1' },
        data: { isActive: false },
      });
    });
  });

  // -------------------------------------------------------------
  // 2. Генерация начислений
  // -------------------------------------------------------------
  describe('Charge Generation (Начисления за период)', () => {
    it('должен выбрасывать BadRequestException, если нет активных тарифов', async () => {
      prismaMock.tariffItem.findMany.mockResolvedValue([]);

      await expect(
        service.generateCharges('tenant-1', { month: 10, year: 2026 }),
      ).rejects.toThrow('В данном ЖК нет активных тарифов для начисления');

      try {
        await service.generateCharges('tenant-1', { month: 10, year: 2026 });
        fail('Should throw');
      } catch (err: any) {
        expect(err.getResponse().code).toBe('FINANCE.NO_ACTIVE_TARIFFS');
      }
    });

    it('должен корректно рассчитывать суммы FLAT и PER_AREA и пропускать дубликаты', async () => {
      prismaMock.tariffItem.findMany.mockResolvedValue([
        {
          id: 'tariff-area',
          tenantId: 'tenant-1',
          name: 'РСЖ',
          calculationMethod: ChargeCalculationMethod.PER_AREA,
          rate: 100.0, // 100 тг/м²
          isActive: true,
        },
        {
          id: 'tariff-flat',
          tenantId: 'tenant-1',
          name: 'Домофон',
          calculationMethod: ChargeCalculationMethod.FLAT,
          rate: 500.0, // 500 тг фикс
          isActive: true,
        },
      ]);

      prismaMock.unit.findMany.mockResolvedValue([
        {
          id: 'u-101',
          unitNumber: '101',
          area: 70.0, // 70 кв.м
          building: { blockName: 'Блок А', tenantId: 'tenant-1' },
          personalAccount: { id: 'acc-101', accountNumber: 'ACC-БЛОКА-101' },
        },
      ]);

      // Первый тариф (PER_AREA) — начисления еще нет
      prismaMock.charge.findUnique
        .mockResolvedValueOnce(null)
        // Второй тариф (FLAT) — уже начислено ранее
        .mockResolvedValueOnce({ id: 'existing-charge' });

      prismaMock.charge.create.mockResolvedValue({ id: 'c-new' });

      // Пересчет баланса
      prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: 10000 } });
      prismaMock.charge.aggregate.mockResolvedValue({ _sum: { amount: 7000 } });
      prismaMock.personalAccount.update.mockResolvedValue({ balance: 3000 });

      const summary = await service.generateCharges('tenant-1', { month: 10, year: 2026 });

      expect(summary.createdCount).toBe(1);
      expect(summary.skippedCount).toBe(1);

      // Проверяем сумму начисления PER_AREA: 100 * 70 = 7000
      expect(prismaMock.charge.create).toHaveBeenCalledWith({
        data: {
          accountId: 'acc-101',
          tariffItemId: 'tariff-area',
          periodMonth: 10,
          periodYear: 2026,
          amount: 7000.0,
        },
      });

      // Проверяем пересчет баланса: 10000 - 7000 = 3000
      expect(prismaMock.personalAccount.update).toHaveBeenCalledWith({
        where: { id: 'acc-101' },
        data: { balance: 3000 },
      });
    });
  });

  // -------------------------------------------------------------
  // 3. Оплаты и пересчет баланса
  // -------------------------------------------------------------
  describe('Payment Recording (Фиксация оплат сотрудником)', () => {
    it('должен успешно фиксировать оплату и пересчитывать баланс', async () => {
      prismaMock.personalAccount.findUnique.mockResolvedValue({
        id: 'acc-101',
        unit: {
          building: { tenantId: 'tenant-1' },
        },
      });

      prismaMock.payment.create.mockResolvedValue({
        id: 'pay-1',
        accountId: 'acc-101',
        amount: 5000.0,
        method: PaymentMethod.MANUAL,
        recordedById: 'u-staff',
        note: 'Касса наличные',
      });

      // Сальдо: оплаты (5000) - начисления (4000) = +1000
      prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: 5000 } });
      prismaMock.charge.aggregate.mockResolvedValue({ _sum: { amount: 4000 } });
      prismaMock.personalAccount.update.mockResolvedValue({ balance: 1000 });

      const staff = { id: 'u-staff', tenantId: 'tenant-1', role: UserRole.HOA_ADMIN };
      const res = await service.recordPayment('acc-101', staff, {
        amount: 5000.0,
        note: 'Касса наличные',
      });

      expect(res.payment.amount).toBe(5000.0);
      expect(res.balance).toBe(1000.0);
      expect(prismaMock.personalAccount.update).toHaveBeenCalledWith({
        where: { id: 'acc-101' },
        data: { balance: 1000 },
      });
    });

    it('должен блокировать прием оплаты сотрудником чужого ЖК (BOLA)', async () => {
      prismaMock.personalAccount.findUnique.mockResolvedValue({
        id: 'acc-101',
        unit: {
          building: { tenantId: 'tenant-1' },
        },
      });

      const foreignStaff = { id: 'u-foreign', tenantId: 'tenant-2', role: UserRole.HOA_ADMIN };

      await expect(
        service.recordPayment('acc-101', foreignStaff, { amount: 1000 }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // -------------------------------------------------------------
  // 4. Доступ жителей к лицевым счетам (getMyAccounts & getAccountById)
  // -------------------------------------------------------------
  describe('Resident Account Access (Только подтвержденный собственник)', () => {
    it('должен возвращать счета для подтвержденного собственника (RESIDENT_OWNER)', async () => {
      prismaMock.unitOwnership.findMany.mockResolvedValue([
        {
          userId: 'resident-owner-1',
          ownershipType: OwnershipType.OWNER,
          isVerified: true,
          unit: {
            id: 'u-101',
            unitNumber: '101',
            area: 68.5,
            floor: 2,
            entrance: 1,
            building: { blockName: 'Блок А' },
            personalAccount: {
              id: 'acc-101',
              accountNumber: 'ACC-БЛОКА-101',
              balance: -2500, // долг 2500 тг
              charges: [{ id: 'ch-1', amount: 2500 }],
              payments: [],
            },
          },
        },
      ]);

      const accounts = await service.getMyAccounts('resident-owner-1');
      expect(accounts).toHaveLength(1);
      expect(accounts[0].accountNumber).toBe('ACC-БЛОКА-101');
      expect(accounts[0].balance).toBe(-2500);
      expect(accounts[0].unit.unitNumber).toBe('101');
    });

    it('должен возвращать пустой массив [] для арендатора (RESIDENT_TENANT) или неподтвержденного жителя', async () => {
      prismaMock.unitOwnership.findMany.mockResolvedValue([]);

      const accounts = await service.getMyAccounts('resident-tenant-1');
      expect(accounts).toEqual([]);
    });

    it('должен разрешать просмотр счета через getAccountById подтвержденному собственнику', async () => {
      prismaMock.personalAccount.findUnique.mockResolvedValue({
        id: 'acc-101',
        unit: {
          building: { tenantId: 'tenant-1' },
          ownerships: [
            {
              userId: 'resident-owner-1',
              ownershipType: OwnershipType.OWNER,
              isVerified: true,
            },
          ],
        },
        charges: [],
        payments: [],
      });

      const res = await service.getAccountById('acc-101', {
        id: 'resident-owner-1',
        tenantId: 'tenant-1',
        role: UserRole.RESIDENT_OWNER,
      });

      expect(res.id).toBe('acc-101');
    });

    it('должен блокировать просмотр счета через getAccountById неподтвержденному пользователю или арендатору', async () => {
      prismaMock.personalAccount.findUnique.mockResolvedValue({
        id: 'acc-101',
        unit: {
          building: { tenantId: 'tenant-1' },
          ownerships: [
            {
              userId: 'resident-tenant-1',
              ownershipType: OwnershipType.TENANT,
              isVerified: true,
            },
          ],
        },
      });

      await expect(
        service.getAccountById('acc-101', {
          id: 'resident-tenant-1',
          tenantId: 'tenant-1',
          role: UserRole.RESIDENT_TENANT,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('должен блокировать просмотр счета жителем другой квартиры', async () => {
      prismaMock.personalAccount.findUnique.mockResolvedValue({
        id: 'acc-101',
        unit: {
          building: { tenantId: 'tenant-1' },
          ownerships: [
            {
              userId: 'other-owner',
              ownershipType: OwnershipType.OWNER,
              isVerified: true,
            },
          ],
        },
      });

      await expect(
        service.getAccountById('acc-101', {
          id: 'intruder-user',
          tenantId: 'tenant-1',
          role: UserRole.RESIDENT_OWNER,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // -------------------------------------------------------------
  // 5. Просмотр счетов сотрудниками (getTenantAccounts & getAccountById)
  // -------------------------------------------------------------
  describe('Staff Accounts Overview & Transparency', () => {
    it('должен разрешать просмотр реестра счетов сотруднику своего ЖК (HOA_ADMIN / HOA_CHAIRMAN)', async () => {
      prismaMock.personalAccount.findMany.mockResolvedValue([
        { id: 'acc-1', balance: 0 },
        { id: 'acc-2', balance: -5000 },
      ]);

      const staff = { id: 'u-chair', tenantId: 'tenant-1', role: UserRole.HOA_CHAIRMAN };
      const res = await service.getTenantAccounts('tenant-1', staff);

      expect(res).toHaveLength(2);
      expect(prismaMock.personalAccount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { unit: { building: { tenantId: 'tenant-1' } } },
        }),
      );
    });

    it('должен блокировать просмотр реестра счетов сотрудником чужого ЖК (BOLA)', async () => {
      const foreignStaff = { id: 'u-foreign', tenantId: 'tenant-2', role: UserRole.HOA_ADMIN };

      await expect(
        service.getTenantAccounts('tenant-1', foreignStaff),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // -------------------------------------------------------------
  // 6. Генерация уникального номера счета и дедупликация (Addendum)
  // -------------------------------------------------------------
  describe('PersonalAccount Number Generation & Deduplication (Addendum)', () => {
    it('два юнита в разных ЖК/зданиях с одинаковым blockName и unitNumber получают РАЗНЫЕ непересекающиеся номера счетов', () => {
      const unit1 = {
        id: 'a1b2c3d4-0000-0000-0000-000000000001',
        unitNumber: '101',
        building: { blockName: 'Блок А' },
      };
      const unit2 = {
        id: 'f9e8d7c6-0000-0000-0000-000000000002',
        unitNumber: '101',
        building: { blockName: 'Блок А' },
      };

      const accNumber1 = generateAccountNumber(unit1.building.blockName, unit1.unitNumber, unit1.id);
      const accNumber2 = generateAccountNumber(unit2.building.blockName, unit2.unitNumber, unit2.id);

      expect(accNumber1).toBe('ACC-БЛОКА-101-A1B2C3');
      expect(accNumber2).toBe('ACC-БЛОКА-101-F9E8D7');
      expect(accNumber1).not.toBe(accNumber2);
    });

    it('getOrCreatePersonalAccount возвращает существующий счет без повторного вызова create', async () => {
      const existingAccount = { id: 'acc-existing', accountNumber: 'ACC-OLD-1' };
      const unit = {
        id: 'u-1',
        unitNumber: '10',
        building: { blockName: 'Блок 1' },
        personalAccount: existingAccount,
      };

      const result = await getOrCreatePersonalAccount(prismaMock, unit);
      expect(result).toBe(existingAccount);
      expect(prismaMock.personalAccount.create).not.toHaveBeenCalled();
    });

    it('getOrCreatePersonalAccount создает уникальный счет при его отсутствии у юнита', async () => {
      const unit = {
        id: 'e1d2c3-unit-id',
        unitNumber: '45',
        building: { blockName: 'Block C' },
      };

      prismaMock.personalAccount.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'acc-new', ...data }),
      );

      const result = await getOrCreatePersonalAccount(prismaMock, unit);
      expect(prismaMock.personalAccount.create).toHaveBeenCalledWith({
        data: {
          unitId: 'e1d2c3-unit-id',
          accountNumber: 'ACC-BLOCKC-45-E1D2C3',
        },
      });
      expect(result.accountNumber).toBe('ACC-BLOCKC-45-E1D2C3');
      expect(result.charges).toEqual([]);
      expect(result.payments).toEqual([]);
    });

    it('при начислении (generateCharges) для юнитов без счетов создаются уникальные счета через общий хелпер', async () => {
      prismaMock.tariffItem.findMany.mockResolvedValue([
        { id: 't-1', name: 'РСЖ', calculationMethod: ChargeCalculationMethod.FLAT, rate: 3000, isActive: true },
      ]);
      prismaMock.unit.findMany.mockResolvedValue([
        {
          id: '111111-tenant1-unit',
          unitNumber: '101',
          area: 50,
          building: { blockName: 'Блок А' },
          personalAccount: null,
        },
        {
          id: '222222-tenant2-unit',
          unitNumber: '101',
          area: 50,
          building: { blockName: 'Блок А' },
          personalAccount: null,
        },
      ]);
      prismaMock.charge.findUnique.mockResolvedValue(null);
      prismaMock.charge.create.mockResolvedValue({ id: 'ch-1', amount: 3000 });
      prismaMock.personalAccount.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: `acc-${data.unitId}`, ...data }),
      );
      prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
      prismaMock.charge.aggregate.mockResolvedValue({ _sum: { amount: 3000 } });
      prismaMock.personalAccount.update.mockResolvedValue({});

      await service.generateCharges('tenant-1', { month: 9, year: 2026 });

      expect(prismaMock.personalAccount.create).toHaveBeenCalledTimes(2);
      const firstCallArg = prismaMock.personalAccount.create.mock.calls[0][0].data.accountNumber;
      const secondCallArg = prismaMock.personalAccount.create.mock.calls[1][0].data.accountNumber;

      expect(firstCallArg).toBe('ACC-БЛОКА-101-111111');
      expect(secondCallArg).toBe('ACC-БЛОКА-101-222222');
      expect(firstCallArg).not.toBe(secondCallArg);
    });
  });

  // -------------------------------------------------------------
  // 7. Начисления по приборам учёта (PER_CONSUMPTION)
  // -------------------------------------------------------------
  describe('Consumption-Based Billing (PER_CONSUMPTION)', () => {
    it('должен блокировать создание тарифа PER_CONSUMPTION без указания meterType', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue({ id: 'tenant-1' });

      const staffUser = { id: 'admin-1', tenantId: 'tenant-1', role: UserRole.HOA_ADMIN };
      await expect(
        service.createTariff('tenant-1', staffUser, {
          name: 'Холодная вода',
          calculationMethod: ChargeCalculationMethod.PER_CONSUMPTION,
          rate: 85,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('должен рассчитывать начисление по дельте расхода (reading - prevReading) × rate', async () => {
      prismaMock.tariffItem.findMany.mockResolvedValue([
        {
          id: 't-water',
          name: 'Холодная вода',
          calculationMethod: ChargeCalculationMethod.PER_CONSUMPTION,
          meterType: MeterType.COLD_WATER,
          rate: 85,
          isActive: true,
        },
      ]);
      prismaMock.unit.findMany.mockResolvedValue([
        {
          id: 'u-1',
          unitNumber: '101',
          area: 60,
          building: { blockName: 'Блок А' },
          personalAccount: { id: 'acc-1', accountNumber: 'ACC-1' },
        },
      ]);
      // Наличие счётчика
      prismaMock.meter.findFirst.mockResolvedValue({
        id: 'm-cw-1',
        unitId: 'u-1',
        type: MeterType.COLD_WATER,
        initialValue: 0,
        isActive: true,
      });
      // Текущее показание: 65 м³
      prismaMock.meterReading.findFirst
        .mockResolvedValueOnce({ value: 65, status: ReadingStatus.VERIFIED }) // за этот месяц
        .mockResolvedValueOnce({ value: 50, status: ReadingStatus.VERIFIED }); // предыдущее: 50 м³ (расход 15)

      prismaMock.charge.findUnique.mockResolvedValue(null);
      prismaMock.charge.create.mockResolvedValue({ id: 'ch-water', amount: 1275 });
      prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
      prismaMock.charge.aggregate.mockResolvedValue({ _sum: { amount: 1275 } });
      prismaMock.personalAccount.update.mockResolvedValue({});

      const res = await service.generateCharges('tenant-1', { month: 9, year: 2026 });

      expect(res.createdCount).toBe(1);
      // Расход: 65 - 50 = 15; Сумма: 15 * 85 = 1275 ₸
      expect(prismaMock.charge.create).toHaveBeenCalledWith({
        data: {
          accountId: 'acc-1',
          tariffItemId: 't-water',
          periodMonth: 9,
          periodYear: 2026,
          amount: 1275,
        },
      });
    });

    it('для первого показания должен использовать meter.initialValue в качестве базы', async () => {
      prismaMock.tariffItem.findMany.mockResolvedValue([
        {
          id: 't-water',
          name: 'Холодная вода',
          calculationMethod: ChargeCalculationMethod.PER_CONSUMPTION,
          meterType: MeterType.COLD_WATER,
          rate: 100,
          isActive: true,
        },
      ]);
      prismaMock.unit.findMany.mockResolvedValue([
        {
          id: 'u-1',
          unitNumber: '101',
          area: 60,
          building: { blockName: 'Блок А' },
          personalAccount: { id: 'acc-1', accountNumber: 'ACC-1' },
        },
      ]);
      prismaMock.meter.findFirst.mockResolvedValue({
        id: 'm-cw-1',
        unitId: 'u-1',
        type: MeterType.COLD_WATER,
        initialValue: 10, // База: 10 м³
        isActive: true,
      });
      // Первое показание 35 м³, предыдущих нет
      prismaMock.meterReading.findFirst
        .mockResolvedValueOnce({ value: 35, status: ReadingStatus.VERIFIED })
        .mockResolvedValueOnce(null);

      prismaMock.charge.findUnique.mockResolvedValue(null);
      prismaMock.charge.create.mockResolvedValue({ id: 'ch-water', amount: 2500 });
      prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
      prismaMock.charge.aggregate.mockResolvedValue({ _sum: { amount: 2500 } });
      prismaMock.personalAccount.update.mockResolvedValue({});

      const res = await service.generateCharges('tenant-1', { month: 9, year: 2026 });

      expect(res.createdCount).toBe(1);
      // Расход: 35 - 10 = 25; Сумма: 25 * 100 = 2500 ₸
      expect(prismaMock.charge.create).toHaveBeenCalledWith({
        data: {
          accountId: 'acc-1',
          tariffItemId: 't-water',
          periodMonth: 9,
          periodYear: 2026,
          amount: 2500,
        },
      });
    });

    it('должен мягко пропускать начисление, если у квартиры нет нужного счётчика или нет подтверждённого показания', async () => {
      prismaMock.tariffItem.findMany.mockResolvedValue([
        {
          id: 't-water',
          name: 'Холодная вода',
          calculationMethod: ChargeCalculationMethod.PER_CONSUMPTION,
          meterType: MeterType.COLD_WATER,
          rate: 85,
          isActive: true,
        },
      ]);
      prismaMock.unit.findMany.mockResolvedValue([
        {
          id: 'u-1',
          unitNumber: '101',
          area: 60,
          building: { blockName: 'Блок А' },
          personalAccount: { id: 'acc-1', accountNumber: 'ACC-1' },
        },
      ]);
      // Счётчик не найден
      prismaMock.meter.findFirst.mockResolvedValue(null);

      const res = await service.generateCharges('tenant-1', { month: 9, year: 2026 });

      expect(res.createdCount).toBe(0);
      expect(res.skippedCount).toBe(1);
      expect(prismaMock.charge.create).not.toHaveBeenCalled();
    });
  });

  describe('generateAccountStatementPdf (Subtask C: формирование PDF-выписки)', () => {
    const mockAccount = {
      id: 'acc-statement-1',
      accountNumber: 'ACC-BLOKA-101-ABCD12',
      balance: -15000,
      unitId: 'unit-101',
      unit: {
        id: 'unit-101',
        unitNumber: '101',
        area: 75.5,
        building: {
          blockName: 'Блок А',
          tenantId: 'tenant-1',
        },
        ownerships: [
          {
            userId: 'user-owner-1',
            ownershipType: OwnershipType.OWNER,
            isVerified: true,
          },
        ],
      },
      charges: [
        {
          id: 'charge-1',
          periodMonth: 9,
          periodYear: 2026,
          amount: 12000,
          createdAt: new Date('2026-09-01T03:00:00Z'),
          tariffItem: {
            name: 'Эксплуатационные расходы',
            calculationMethod: ChargeCalculationMethod.PER_AREA,
          },
        },
        {
          id: 'charge-2',
          periodMonth: 8,
          periodYear: 2026,
          amount: 11000,
          createdAt: new Date('2026-08-01T03:00:00Z'),
          tariffItem: {
            name: 'Эксплуатационные расходы',
            calculationMethod: ChargeCalculationMethod.PER_AREA,
          },
        },
      ],
      payments: [
        {
          id: 'payment-1',
          amount: 8000,
          method: PaymentMethod.MANUAL,
          paidAt: new Date('2026-09-05T14:30:00Z'),
          recordedBy: {
            firstName: 'Иван',
            lastName: 'Иванов',
          },
        },
      ],
    };

    beforeEach(() => {
      prismaMock.personalAccount.findUnique.mockResolvedValue(mockAccount);
      prismaMock.tenant.findUnique.mockResolvedValue({
        id: 'tenant-1',
        name: 'ЖК «Шаңырақ Премиум»',
        address: 'г. Алматы, пр. Достык, 100',
      });
      prismaMock.unitOwnership.findMany.mockResolvedValue([
        {
          userId: 'user-owner-1',
          isVerified: true,
          user: {
            firstName: 'Азамат',
            lastName: 'Касымов',
          },
        },
      ]);
    });

    it('позволяет верифицированному собственнику успешно сформировать выписку в PDF', async () => {
      const res = await service.generateAccountStatementPdf(
        'acc-statement-1',
        { id: 'user-owner-1', role: UserRole.RESIDENT_OWNER, tenantId: 'tenant-1' },
        { month: 9, year: 2026 },
      );

      expect(res.buffer).toBeInstanceOf(Buffer);
      expect(res.buffer.slice(0, 5).toString()).toBe('%PDF-');
      expect(res.buffer.length).toBeGreaterThan(1000);
      expect(res.filename).toBe('statement_ACC-BLOKA-101-ABCD12_2026-09.pdf');
    });

    it('блокирует скачивание выписки жителю, не являющемуся подтвержденным собственником (FINANCE.ACCOUNT_ACCESS_CONFIRMED_ONLY)', async () => {
      await expect(
        service.generateAccountStatementPdf(
          'acc-statement-1',
          { id: 'user-stranger', role: UserRole.RESIDENT_OWNER, tenantId: 'tenant-1' },
          { month: 9, year: 2026 },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('позволяет сотруднику УК (HOA_ADMIN) своего ЖК скачивать выписку за все время', async () => {
      const res = await service.generateAccountStatementPdf('acc-statement-1', {
        id: 'staff-1',
        role: UserRole.HOA_ADMIN,
        tenantId: 'tenant-1',
      });

      expect(res.buffer).toBeInstanceOf(Buffer);
      expect(res.buffer.slice(0, 5).toString()).toBe('%PDF-');
      expect(res.filename).toBe('statement_ACC-BLOKA-101-ABCD12_all.pdf');
    });

    // -----------------------------------------------------------
    // CSV Export Tests (Task 0046)
    // -----------------------------------------------------------
    it('позволяет верифицированному собственнику успешно сформировать выписку в CSV с UTF-8 BOM и корректным именем файла', async () => {
      const res = await service.exportAccountStatementCsv(
        'acc-statement-1',
        { id: 'user-owner-1', role: UserRole.RESIDENT_OWNER, tenantId: 'tenant-1' },
        { month: 9, year: 2026 },
      );

      expect(res.buffer).toBeInstanceOf(Buffer);
      // UTF-8 BOM check: 0xEF, 0xBB, 0xBF
      expect(res.buffer.slice(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
      const content = res.buffer.toString('utf-8');
      expect(content.startsWith('\uFEFF')).toBe(true);
      expect(res.filename).toBe('statement_ACC-BLOKA-101-ABCD12_2026-09.csv');

      // Check header block
      expect(content).toContain('Выписка по лицевому счету');
      expect(content).toContain('ЖК «Шаңырақ Премиум»');
      expect(content).toContain('ACC-BLOKA-101-ABCD12');
      expect(content).toContain('кв. 101, Блок Блок А');
      expect(content).toContain('Касымов Азамат');
      expect(content).toContain('09.2026');

      // Check charges section
      expect(content).toContain('Начисления');
      expect(content).toContain('09.2026,Эксплуатационные расходы,12000');

      // Check payments section
      expect(content).toContain('Платежи');
      expect(content).toContain('05.09.2026,8000,Вручную (касса),Иван Иванов');

      // Check current balance
      expect(content).toContain('Текущий баланс,-15000 ₸');
    });

    it('блокирует скачивание CSV выписки жителю, не являющемуся подтвержденным собственником (FINANCE.ACCOUNT_ACCESS_CONFIRMED_ONLY)', async () => {
      await expect(
        service.exportAccountStatementCsv(
          'acc-statement-1',
          { id: 'user-stranger', role: UserRole.RESIDENT_OWNER, tenantId: 'tenant-1' },
          { month: 9, year: 2026 },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('блокирует скачивание CSV сотруднику УК чужого ЖК', async () => {
      await expect(
        service.exportAccountStatementCsv('acc-statement-1', {
          id: 'staff-alien',
          role: UserRole.HOA_ADMIN,
          tenantId: 'tenant-alien',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('фильтрует начисления и платежи по month и year аналогично PDF выписке', async () => {
      // With period filter: only September 2026
      const filteredRes = await service.exportAccountStatementCsv(
        'acc-statement-1',
        { id: 'user-owner-1', role: UserRole.RESIDENT_OWNER, tenantId: 'tenant-1' },
        { month: 9, year: 2026 },
      );
      const filteredContent = filteredRes.buffer.toString('utf-8');
      expect(filteredRes.filename).toBe('statement_ACC-BLOKA-101-ABCD12_2026-09.csv');
      expect(filteredContent).toContain('09.2026,Эксплуатационные расходы,12000');
      expect(filteredContent).not.toContain('08.2026,Эксплуатационные расходы,11000');

      // Without period filter: all periods included, filename ends with _all.csv
      const allRes = await service.exportAccountStatementCsv(
        'acc-statement-1',
        { id: 'user-owner-1', role: UserRole.RESIDENT_OWNER, tenantId: 'tenant-1' },
      );
      const allContent = allRes.buffer.toString('utf-8');
      expect(allRes.filename).toBe('statement_ACC-BLOKA-101-ABCD12_all.csv');
      expect(allContent).toContain('09.2026,Эксплуатационные расходы,12000');
      expect(allContent).toContain('08.2026,Эксплуатационные расходы,11000');
    });

    it('корректно экранирует запятые и кавычки в статьях начислений и примечаниях платежей', async () => {
      prismaMock.personalAccount.findUnique.mockResolvedValueOnce({
        ...mockAccount,
        charges: [
          {
            id: 'charge-comma',
            periodMonth: 9,
            periodYear: 2026,
            amount: 5000,
            tariffItem: {
              name: 'Услуги консьержа, домофон и "охрана"',
            },
          },
        ],
        payments: [
          {
            id: 'payment-comma',
            amount: 5000,
            method: PaymentMethod.MANUAL,
            note: 'Оплата наличными, касса №2, чек "А-1"',
            paidAt: new Date('2026-09-06T10:00:00Z'),
            recordedBy: {
              firstName: 'Иван',
              lastName: 'Иванов',
            },
          },
        ],
      });

      const res = await service.exportAccountStatementCsv(
        'acc-statement-1',
        { id: 'user-owner-1', role: UserRole.RESIDENT_OWNER, tenantId: 'tenant-1' },
      );

      const content = res.buffer.toString('utf-8');
      // Escaped quotes and commas per RFC 4180
      expect(content).toContain('"Услуги консьержа, домофон и ""охрана"""');
      expect(content).toContain('"Вручную (касса) / Оплата наличными, касса №2, чек ""А-1"""');
    });
  });

  describe('Учёт расходов ЖК (Expense Ledger, Task 0090)', () => {
    const tenantId = 'tenant-expense-1';
    const otherTenantId = 'tenant-other-2';
    const hoaAdmin = { id: 'admin-1', role: UserRole.HOA_ADMIN, tenantId };
    const superAdmin = { id: 'super-1', role: UserRole.SUPERADMIN, tenantId: null };
    const hoaChairman = { id: 'chairman-1', role: UserRole.HOA_CHAIRMAN, tenantId };
    const dispatcher = { id: 'disp-1', role: UserRole.DISPATCHER, tenantId };
    const resident = { id: 'res-1', role: UserRole.RESIDENT_OWNER, tenantId };
    const crossTenantAdmin = { id: 'admin-2', role: UserRole.HOA_ADMIN, tenantId: otherTenantId };

    const validDto = {
      category: 'Ремонт кровли',
      amount: 150000,
      expenseDate: '2026-09-20T10:00:00.000Z',
      description: 'Закупка гидроизоляционных материалов',
    };

    describe('createExpense', () => {
      it('HOA_ADMIN того же ЖК успешно вносит расход с аудитом', async () => {
        prismaMock.tenant.findUnique.mockResolvedValue({ id: tenantId });
        const createdMock = {
          id: 'exp-1',
          tenantId,
          ...validDto,
          expenseDate: new Date(validDto.expenseDate),
          recordedById: hoaAdmin.id,
          isVoided: false,
          voidedAt: null,
          voidedById: null,
          voidedReason: null,
          createdAt: new Date(),
          recordedBy: { id: hoaAdmin.id, firstName: 'Азамат', lastName: 'Админов', role: UserRole.HOA_ADMIN },
          voidedBy: null,
        };
        prismaMock.expense.create.mockResolvedValue(createdMock);

        const res = await service.createExpense(tenantId, hoaAdmin, validDto);

        expect(res.id).toBe('exp-1');
        expect(res.category).toBe('Ремонт кровли');
        expect(prismaMock.expense.create).toHaveBeenCalledWith({
          data: {
            tenantId,
            category: 'Ремонт кровли',
            amount: 150000,
            expenseDate: new Date(validDto.expenseDate),
            description: 'Закупка гидроизоляционных материалов',
            recordedById: hoaAdmin.id,
          },
          include: {
            recordedBy: {
              select: { id: true, firstName: true, lastName: true, role: true },
            },
            voidedBy: {
              select: { id: true, firstName: true, lastName: true, role: true },
            },
          },
        });
        expect(auditLogServiceMock.log).toHaveBeenCalledWith({
          tenantId,
          actorId: hoaAdmin.id,
          action: 'EXPENSE_CREATED',
          targetType: 'Expense',
          targetId: 'exp-1',
          metadata: {
            category: 'Ремонт кровли',
            amount: 150000,
            expenseDate: new Date(validDto.expenseDate).toISOString(),
          },
        });
      });

      it('SUPERADMIN может вносить расход в любой ЖК', async () => {
        prismaMock.tenant.findUnique.mockResolvedValue({ id: tenantId });
        prismaMock.expense.create.mockResolvedValue({
          id: 'exp-super',
          tenantId,
          ...validDto,
          expenseDate: new Date(validDto.expenseDate),
          recordedById: superAdmin.id,
        });

        const res = await service.createExpense(tenantId, superAdmin, validDto);
        expect(res.id).toBe('exp-super');
      });

      it('HOA_CHAIRMAN отклоняется с 403 (только чтение)', async () => {
        await expect(service.createExpense(tenantId, hoaChairman, validDto)).rejects.toThrow(
          ForbiddenException,
        );
      });

      it('DISPATCHER отклоняется с 403 (нет доступа к финансам)', async () => {
        await expect(service.createExpense(tenantId, dispatcher, validDto)).rejects.toThrow(
          ForbiddenException,
        );
      });

      it('RESIDENT_OWNER отклоняется с 403', async () => {
        await expect(service.createExpense(tenantId, resident, validDto)).rejects.toThrow(
          ForbiddenException,
        );
      });

      it('сотрудник чужого ЖК отклоняется с 403 (tenant-изоляция)', async () => {
        await expect(service.createExpense(tenantId, crossTenantAdmin, validDto)).rejects.toThrow(
          ForbiddenException,
        );
      });

      it('отклоняет сумму <= 0 с INVALID_AMOUNT', async () => {
        prismaMock.tenant.findUnique.mockResolvedValue({ id: tenantId });
        await expect(
          service.createExpense(tenantId, hoaAdmin, { ...validDto, amount: 0 }),
        ).rejects.toThrow(BadRequestException);
        await expect(
          service.createExpense(tenantId, hoaAdmin, { ...validDto, amount: -500 }),
        ).rejects.toMatchObject({
          response: { code: 'FINANCE.INVALID_AMOUNT' },
        });
      });

      it('отклоняет пустую категорию с INVALID_CATEGORY', async () => {
        prismaMock.tenant.findUnique.mockResolvedValue({ id: tenantId });
        await expect(
          service.createExpense(tenantId, hoaAdmin, { ...validDto, category: '   ' }),
        ).rejects.toMatchObject({
          response: { code: 'FINANCE.INVALID_CATEGORY' },
        });
      });

      it('отклоняет несуществующий ЖК с COMPLEX_NOT_FOUND', async () => {
        prismaMock.tenant.findUnique.mockResolvedValue(null);
        await expect(
          service.createExpense('non-existent', superAdmin, validDto),
        ).rejects.toMatchObject({
          response: { code: 'FINANCE.COMPLEX_NOT_FOUND' },
        });
      });
    });

    describe('voidExpense', () => {
      const expenseId = 'exp-to-void';
      const existingExpense = {
        id: expenseId,
        tenantId,
        category: 'Канцтовары',
        amount: 12000,
        isVoided: false,
        voidedReason: null,
      };

      it('HOA_ADMIN успешно аннулирует расход с обязательной причиной', async () => {
        prismaMock.expense.findUnique.mockResolvedValue(existingExpense);
        prismaMock.expense.update.mockResolvedValue({
          ...existingExpense,
          isVoided: true,
          voidedAt: new Date(),
          voidedById: hoaAdmin.id,
          voidedReason: 'Ошибочный чек',
          recordedBy: { id: hoaAdmin.id, firstName: 'Азамат', role: UserRole.HOA_ADMIN },
          voidedBy: { id: hoaAdmin.id, firstName: 'Азамат', role: UserRole.HOA_ADMIN },
        });

        const res = await service.voidExpense(expenseId, hoaAdmin, { reason: 'Ошибочный чек' });

        expect(res.isVoided).toBe(true);
        expect(prismaMock.expense.update).toHaveBeenCalledWith({
          where: { id: expenseId },
          data: expect.objectContaining({
            isVoided: true,
            voidedById: hoaAdmin.id,
            voidedReason: 'Ошибочный чек',
          }),
          include: expect.any(Object),
        });
        expect(auditLogServiceMock.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'EXPENSE_VOIDED',
            targetId: expenseId,
          }),
        );
      });

      it('отклоняет аннулирование без указания причины (VOID_REASON_REQUIRED)', async () => {
        prismaMock.expense.findUnique.mockResolvedValue(existingExpense);
        await expect(
          service.voidExpense(expenseId, hoaAdmin, { reason: '   ' }),
        ).rejects.toMatchObject({
          response: { code: 'FINANCE.VOID_REASON_REQUIRED' },
        });
      });

      it('отклоняет повторное аннулирование (EXPENSE_ALREADY_VOIDED)', async () => {
        prismaMock.expense.findUnique.mockResolvedValue({
          ...existingExpense,
          isVoided: true,
        });
        await expect(
          service.voidExpense(expenseId, hoaAdmin, { reason: 'Повторный войд' }),
        ).rejects.toMatchObject({
          response: { code: 'FINANCE.EXPENSE_ALREADY_VOIDED' },
        });
      });

      it('отклоняет несуществующий расход (EXPENSE_NOT_FOUND)', async () => {
        prismaMock.expense.findUnique.mockResolvedValue(null);
        await expect(
          service.voidExpense('non-existent', hoaAdmin, { reason: 'Причина' }),
        ).rejects.toMatchObject({
          response: { code: 'FINANCE.EXPENSE_NOT_FOUND' },
        });
      });

      it('блокирует сотрудника чужого ЖК', async () => {
        prismaMock.expense.findUnique.mockResolvedValue(existingExpense);
        await expect(
          service.voidExpense(expenseId, crossTenantAdmin, { reason: 'Причина' }),
        ).rejects.toThrow(ForbiddenException);
      });

      it('блокирует HOA_CHAIRMAN и DISPATCHER', async () => {
        await expect(
          service.voidExpense(expenseId, hoaChairman, { reason: 'Причина' }),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          service.voidExpense(expenseId, dispatcher, { reason: 'Причина' }),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('getExpenses', () => {
      it('HOA_ADMIN и HOA_CHAIRMAN имеют право на просмотр журнала расходов', async () => {
        prismaMock.expense.findMany.mockResolvedValue([]);

        const adminRes = await service.getExpenses(tenantId, hoaAdmin);
        expect(adminRes).toEqual([]);

        const chairmanRes = await service.getExpenses(tenantId, hoaChairman);
        expect(chairmanRes).toEqual([]);
      });

      it('DISPATCHER и жильцы получают отказ с 403 (VIEW_EXPENSE_FORBIDDEN)', async () => {
        await expect(service.getExpenses(tenantId, dispatcher)).rejects.toMatchObject({
          response: { code: 'FINANCE.VIEW_EXPENSE_FORBIDDEN' },
        });
        await expect(service.getExpenses(tenantId, resident)).rejects.toMatchObject({
          response: { code: 'FINANCE.VIEW_EXPENSE_FORBIDDEN' },
        });
      });

      it('сотрудник чужого ЖК получает 403', async () => {
        await expect(service.getExpenses(tenantId, crossTenantAdmin)).rejects.toThrow(
          ForbiddenException,
        );
      });

      it('применяет фильтры по дате и категории', async () => {
        prismaMock.expense.findMany.mockResolvedValue([]);
        await service.getExpenses(tenantId, hoaAdmin, {
          from: '2026-09-01',
          to: '2026-09-30',
          category: 'Ремонт',
        });

        expect(prismaMock.expense.findMany).toHaveBeenCalledWith({
          where: expect.objectContaining({
            tenantId,
            expenseDate: expect.any(Object),
            category: { contains: 'Ремонт' },
          }),
          orderBy: { expenseDate: 'desc' },
          include: expect.any(Object),
        });
      });
    });

    describe('exportExpensesCsv', () => {
      it('формирует CSV выгрузку с UTF-8 BOM и корректными строками', async () => {
        prismaMock.expense.findMany.mockResolvedValue([
          {
            id: 'exp-1',
            tenantId,
            category: 'Сантехника',
            description: 'Замена вентилей',
            amount: 45000,
            expenseDate: new Date('2026-09-15T12:00:00Z'),
            isVoided: false,
            voidedAt: null,
            voidedById: null,
            voidedReason: null,
            recordedBy: { firstName: 'Олжас', lastName: 'Касымов', role: UserRole.HOA_ADMIN },
            voidedBy: null,
          },
          {
            id: 'exp-2',
            tenantId,
            category: 'Ошибочный расход',
            description: 'Тест',
            amount: 10000,
            expenseDate: new Date('2026-09-16T12:00:00Z'),
            isVoided: true,
            voidedAt: new Date('2026-09-17T14:00:00Z'),
            voidedById: 'admin-1',
            voidedReason: 'Чек выписан ошибочно',
            recordedBy: { firstName: 'Олжас', lastName: 'Касымов', role: UserRole.HOA_ADMIN },
            voidedBy: { firstName: 'Олжас', lastName: 'Касымов', role: UserRole.HOA_ADMIN },
          },
        ]);

        const res = await service.exportExpensesCsv(tenantId, hoaAdmin, {
          from: '2026-09-01',
          to: '2026-09-30',
        });

        expect(res.filename).toBe(`expenses-${tenantId}-2026-09-01_2026-09-30.csv`);
        const content = res.buffer.toString('utf-8');
        expect(content).toContain('Дата расхода,Категория,Описание,Сумма (₸)');
        expect(content).toContain('Сантехника');
        expect(content).toContain('45000');
        expect(content).toContain('Действителен');
        expect(content).toContain('Аннулирован');
        expect(content).toContain('Чек выписан ошибочно');
      });
    });
  });

  // =============================================================
  // Отчет о прозрачности финансов для жильцов (Task 0091)
  // =============================================================
  describe('Financial Transparency Report (Task 0091)', () => {
    const tenantId = 'tenant-transparency-1';
    const otherTenantId = 'tenant-other-2';

    const verifiedOwner = { id: 'owner-1', role: UserRole.RESIDENT_OWNER, tenantId };
    const unverifiedOwner = { id: 'unverified-1', role: UserRole.RESIDENT_OWNER, tenantId };
    const tenantResident = { id: 'tenant-res-1', role: UserRole.RESIDENT_TENANT, tenantId };
    const hoaAdmin = { id: 'admin-1', role: UserRole.HOA_ADMIN, tenantId };
    const hoaChairman = { id: 'chairman-1', role: UserRole.HOA_CHAIRMAN, tenantId };
    const crossTenantAdmin = { id: 'admin-other', role: UserRole.HOA_ADMIN, tenantId: otherTenantId };
    const superAdmin = { id: 'super-1', role: UserRole.SUPERADMIN, tenantId: null };

    const periodMonth = 9;
    const periodYear = 2026;

    beforeEach(() => {
      // Mock verified ownership check for assertAccessToTenant
      prismaMock.unitOwnership.findFirst.mockImplementation((args: any) => {
        if (
          args?.where?.userId === verifiedOwner.id &&
          args?.where?.isVerified === true &&
          args?.where?.unit?.building?.tenantId === tenantId
        ) {
          return Promise.resolve({
            id: 'ownership-1',
            userId: verifiedOwner.id,
            isVerified: true,
          });
        }
        return Promise.resolve(null);
      });

      // Charges mock (доходы)
      prismaMock.charge.aggregate.mockResolvedValue({
        _sum: { amount: 100000 },
      });

      // Payments mock (оплаты)
      prismaMock.payment.aggregate.mockResolvedValue({
        _sum: { amount: 80000 },
      });

      // Grouped charges by tariff
      prismaMock.charge.groupBy.mockResolvedValue([
        { tariffItemId: 'tariff-1', _sum: { amount: 60000 } },
        { tariffItemId: 'tariff-2', _sum: { amount: 40000 } },
      ]);

      prismaMock.tariffItem.findMany.mockResolvedValue([
        { id: 'tariff-1', name: 'РСЖ' },
        { id: 'tariff-2', name: 'Капитальный ремонт' },
      ]);

      // Expenses mock (расходы)
      prismaMock.expense.aggregate.mockResolvedValue({
        _sum: { amount: 45000 },
      });

      // Grouped expenses by category
      prismaMock.expense.groupBy.mockResolvedValue([
        { category: 'Зарплата персонала', _sum: { amount: 30000 } },
        { category: 'Сантехника', _sum: { amount: 15000 } },
      ]);

      prismaMock.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        name: 'ЖК Шаңырақ Премиум',
      });

      // Personal accounts for debtor check in analytics comparison
      prismaMock.personalAccount.findMany.mockResolvedValue([
        {
          id: 'acc-debt-1',
          accountNumber: 'SHAN-101',
          unitId: 'unit-1',
          balance: -15000,
          unit: { unitNumber: '101', building: { blockName: 'Блок А' } },
        },
      ]);
    });

    describe('getTransparencyReport', () => {
      it('подтверждённый RESIDENT_OWNER получает 200 с верными числами', async () => {
        const report = await service.getTransparencyReport(tenantId, verifiedOwner, {
          month: periodMonth,
          year: periodYear,
        });

        // Сверка с вручную рассчитанными значениями фикстуры
        expect(report.periodMonth).toBe(9);
        expect(report.periodYear).toBe(2026);
        expect(report.totalCharged).toBe(100000);
        expect(report.totalCollected).toBe(80000);
        expect(report.collectionRatePercent).toBe(80);
        expect(report.totalExpenses).toBe(45000);
        // netBalance = totalCollected - totalExpenses = 80000 - 45000 = 35000
        expect(report.netBalance).toBe(35000);

        expect(report.byTariff).toEqual([
          { tariffId: 'tariff-1', tariffName: 'РСЖ', amount: 60000 },
          { tariffId: 'tariff-2', tariffName: 'Капитальный ремонт', amount: 40000 },
        ]);

        expect(report.byExpenseCategory).toEqual([
          { category: 'Зарплата персонала', amount: 30000 },
          { category: 'Сантехника', amount: 15000 },
        ]);

        // Проверяем, что в запрос расходов передается фильтр isVoided: false
        expect(prismaMock.expense.aggregate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              tenantId,
              isVoided: false,
            }),
          }),
        );
        expect(prismaMock.expense.groupBy).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              tenantId,
              isVoided: false,
            }),
          }),
        );
      });

      it('строго гарантирует отсутствие данных по должникам, жильцам и счетам (privacy-safe)', async () => {
        const report = await service.getTransparencyReport(tenantId, verifiedOwner, {
          month: periodMonth,
          year: periodYear,
        });

        // Явная проверка отсутствия полей должников и жильцов
        expect(report).not.toHaveProperty('topDebtors');
        expect(report).not.toHaveProperty('debtors');
        expect(report).not.toHaveProperty('accounts');
        expect(report).not.toHaveProperty('debtorAccounts');
        expect(report).not.toHaveProperty('residents');
        expect(report).not.toHaveProperty('users');
        expect(report).not.toHaveProperty('personalAccounts');

        // Проверяем сериализованный JSON на отсутствие номеров счетов и балансов должников
        const json = JSON.stringify(report);
        expect(json).not.toContain('SHAN-101');
        expect(json).not.toContain('-15000');
        expect(json).not.toContain('topDebtors');
      });

      it('числа доходов строго совпадают со staff-версией getFinanceAnalytics (без дрифта)', async () => {
        const analyticsService = new AnalyticsService(prismaMock);
        const staffAnalytics = await analyticsService.getFinanceAnalytics(
          tenantId,
          hoaAdmin,
          { month: periodMonth, year: periodYear },
        );

        const residentReport = await service.getTransparencyReport(
          tenantId,
          verifiedOwner,
          { month: periodMonth, year: periodYear },
        );

        expect(residentReport.totalCharged).toBe(staffAnalytics.totalCharged);
        expect(residentReport.totalCollected).toBe(staffAnalytics.totalCollected);
        expect(residentReport.collectionRatePercent).toBe(staffAnalytics.collectionRatePercent);
        expect(residentReport.byTariff).toEqual(staffAnalytics.byTariff);

        // Staff версия имеет topDebtors, resident версия — никогда
        expect(staffAnalytics).toHaveProperty('topDebtors');
        expect(residentReport).not.toHaveProperty('topDebtors');
      });

      it('неподтверждённый жилец получает 403 Forbidden', async () => {
        await expect(
          service.getTransparencyReport(tenantId, unverifiedOwner, {
            month: periodMonth,
            year: periodYear,
          }),
        ).rejects.toThrow(ForbiddenException);

        await expect(
          service.getTransparencyReport(tenantId, unverifiedOwner, {
            month: periodMonth,
            year: periodYear,
          }),
        ).rejects.toMatchObject({
          response: { code: 'FINANCE.RESIDENT_ACCESS_FORBIDDEN' },
        });
      });

      it('RESIDENT_TENANT получает 403 Forbidden', async () => {
        await expect(
          service.getTransparencyReport(tenantId, tenantResident, {
            month: periodMonth,
            year: periodYear,
          }),
        ).rejects.toThrow(ForbiddenException);

        await expect(
          service.getTransparencyReport(tenantId, tenantResident, {
            month: periodMonth,
            year: periodYear,
          }),
        ).rejects.toMatchObject({
          response: { code: 'FINANCE.RESIDENT_ACCESS_FORBIDDEN' },
        });
      });

      it('персонал своего ЖК (HOA_ADMIN, HOA_CHAIRMAN) получает 200 с верными числами', async () => {
        const adminReport = await service.getTransparencyReport(tenantId, hoaAdmin, {
          month: periodMonth,
          year: periodYear,
        });
        expect(adminReport.totalCollected).toBe(80000);
        expect(adminReport.netBalance).toBe(35000);

        const chairmanReport = await service.getTransparencyReport(tenantId, hoaChairman, {
          month: periodMonth,
          year: periodYear,
        });
        expect(chairmanReport.totalCollected).toBe(80000);
        expect(chairmanReport.netBalance).toBe(35000);
      });

      it('персонал чужого ЖК получает 403 Forbidden (BOLA / tenant isolation)', async () => {
        await expect(
          service.getTransparencyReport(tenantId, crossTenantAdmin, {
            month: periodMonth,
            year: periodYear,
          }),
        ).rejects.toThrow(ForbiddenException);

        await expect(
          service.getTransparencyReport(tenantId, crossTenantAdmin, {
            month: periodMonth,
            year: periodYear,
          }),
        ).rejects.toMatchObject({
          response: { code: 'FINANCE.STAFF_CROSS_TENANT_FORBIDDEN' },
        });
      });

      it('SUPERADMIN получает 200 без привязки к tenantId', async () => {
        const report = await service.getTransparencyReport(tenantId, superAdmin, {
          month: periodMonth,
          year: periodYear,
        });
        expect(report.totalCharged).toBe(100000);
        expect(report.netBalance).toBe(35000);
      });

      it('выбрасывает 403 authRequired, если user не передан', async () => {
        await expect(
          service.getTransparencyReport(tenantId, null as any),
        ).rejects.toMatchObject({
          response: { code: 'FINANCE.AUTH_REQUIRED' },
        });
      });

      it('выбрасывает 400 BadRequestException при невалидном месяце (не 1..12)', async () => {
        await expect(
          service.getTransparencyReport(tenantId, verifiedOwner, {
            month: 13,
            year: periodYear,
          }),
        ).rejects.toThrow(BadRequestException);

        await expect(
          service.getTransparencyReport(tenantId, verifiedOwner, {
            month: 0,
            year: periodYear,
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('выбрасывает 400 BadRequestException при невалидном годе (не 2000..2100)', async () => {
        await expect(
          service.getTransparencyReport(tenantId, verifiedOwner, {
            month: periodMonth,
            year: 1999,
          }),
        ).rejects.toThrow(BadRequestException);

        await expect(
          service.getTransparencyReport(tenantId, verifiedOwner, {
            month: periodMonth,
            year: 2101,
          }),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('TransparencyReportQueryDto ValidationPipe integration', () => {
      const pipe = new ValidationPipe({
        whitelist: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      });

      it('отклоняет невалидный month (>12) со статусом 400', async () => {
        await expect(
          pipe.transform(
            { month: '13', year: '2026' },
            { type: 'query', metatype: TransparencyReportQueryDto },
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('отклоняет невалидный month (<1) со статусом 400', async () => {
        await expect(
          pipe.transform(
            { month: '0', year: '2026' },
            { type: 'query', metatype: TransparencyReportQueryDto },
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('отклоняет невалидный year (<2000) со статусом 400', async () => {
        await expect(
          pipe.transform(
            { month: '9', year: '1999' },
            { type: 'query', metatype: TransparencyReportQueryDto },
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('отклоняет невалидный year (>2100) со статусом 400', async () => {
        await expect(
          pipe.transform(
            { month: '9', year: '2105' },
            { type: 'query', metatype: TransparencyReportQueryDto },
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('отклоняет нечисловой month со статусом 400', async () => {
        await expect(
          pipe.transform(
            { month: 'abc', year: '2026' },
            { type: 'query', metatype: TransparencyReportQueryDto },
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('успешно преобразует строковые параметры в числа при валидных данных', async () => {
        const transformed = await pipe.transform(
          { month: '9', year: '2026' },
          { type: 'query', metatype: TransparencyReportQueryDto },
        );
        expect(transformed.month).toBe(9);
        expect(transformed.year).toBe(2026);
      });

      it('пропускает пустой query объект при необязательных полях', async () => {
        const transformed = await pipe.transform(
          {},
          { type: 'query', metatype: TransparencyReportQueryDto },
        );
        expect(transformed.month).toBeUndefined();
        expect(transformed.year).toBeUndefined();
      });
    });

    describe('exportTransparencyReportCsv', () => {
      it('формирует CSV с UTF-8 BOM, секциями доходов и расходов, без должников', async () => {
        const res = await service.exportTransparencyReportCsv(tenantId, verifiedOwner, {
          month: periodMonth,
          year: periodYear,
        });

        expect(res.filename).toBe(`transparency-report-${tenantId}-2026-09.csv`);
        const content = res.buffer.toString('utf-8');

        // UTF-8 BOM
        expect(res.buffer[0]).toBe(0xef);
        expect(res.buffer[1]).toBe(0xbb);
        expect(res.buffer[2]).toBe(0xbf);

        // Заголовки и общие показатели
        expect(content).toContain('Отчет о прозрачности финансов ЖК');
        expect(content).toContain('ЖК Шаңырақ Премиум');
        expect(content).toContain('Период,09.2026');
        expect(content).toContain('Начислено всего (₸),100000');
        expect(content).toContain('Оплачено всего (₸),80000');
        expect(content).toContain('Собираемость,80%');
        expect(content).toContain('Расходы всего (₸),45000');
        expect(content).toContain('Чистый баланс (₸),35000');

        // Секция доходов по тарифам
        expect(content).toContain('Доходы по тарифам');
        expect(content).toContain('Тариф,Сумма (₸)');
        expect(content).toContain('РСЖ,60000');
        expect(content).toContain('Капитальный ремонт,40000');

        // Секция расходов по категориям
        expect(content).toContain('Расходы по категориям');
        expect(content).toContain('Категория,Сумма (₸)');
        expect(content).toContain('Зарплата персонала,30000');
        expect(content).toContain('Сантехника,15000');

        // Отсутствие должников и персональных счетов
        expect(content).not.toContain('Должники');
        expect(content).not.toContain('Лицевой счет');
        expect(content).not.toContain('SHAN-101');
      });

      it('отклоняет экспорт для неподтвержденного жильца с 403', async () => {
        await expect(
          service.exportTransparencyReportCsv(tenantId, unverifiedOwner),
        ).rejects.toThrow(ForbiddenException);
      });

      it('отклоняет экспорт для персонала чужого ЖК с 403', async () => {
        await expect(
          service.exportTransparencyReportCsv(tenantId, crossTenantAdmin),
        ).rejects.toThrow(ForbiddenException);
      });
    });
  });
});
