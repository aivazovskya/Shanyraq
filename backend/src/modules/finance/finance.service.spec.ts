import { Test, TestingModule } from '@nestjs/testing';
import { FinanceService } from './finance.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  UserRole,
  OwnershipType,
  ChargeCalculationMethod,
  PaymentMethod,
} from '@prisma/client';
import { generateAccountNumber, getOrCreatePersonalAccount } from './personal-account.helper';

describe('FinanceService (Лицевые счета, тарифы, начисления и оплаты)', () => {
  let service: FinanceService;
  let prismaMock: any;

  beforeEach(async () => {
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
      },
      payment: {
        create: jest.fn(),
        aggregate: jest.fn(),
      },
      unitOwnership: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinanceService,
        { provide: PrismaService, useValue: prismaMock },
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

    it('должен успешно создавать тариф в ЖК', async () => {
      prismaMock.tenant.findUnique.mockResolvedValue({ id: 'tenant-1' });
      prismaMock.tariffItem.create.mockResolvedValue({
        id: 'tariff-new',
        tenantId: 'tenant-1',
        name: 'Домофон',
        calculationMethod: ChargeCalculationMethod.FLAT,
        rate: 450.0,
      });

      const res = await service.createTariff('tenant-1', {
        name: 'Домофон',
        calculationMethod: ChargeCalculationMethod.FLAT,
        rate: 450.0,
      });

      expect(res.name).toBe('Домофон');
      expect(res.rate).toBe(450.0);
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
});
