import { Test, TestingModule } from '@nestjs/testing';
import { MetersSchedulerService } from './meters-scheduler.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RedisService } from '../../redis/redis.service';
import {
  ChargeCalculationMethod,
  MeterType,
  OwnershipType,
  ReadingStatus,
} from '@prisma/client';

describe('MetersSchedulerService (Напоминания о передаче показаний счётчиков)', () => {
  let service: MetersSchedulerService;
  let prismaMock: any;
  let notificationsServiceMock: any;
  let redisServiceMock: any;
  let redisStore: Map<string, string>;

  beforeEach(async () => {
    redisStore = new Map<string, string>();

    redisServiceMock = {
      get: jest.fn().mockImplementation(async (key: string) => redisStore.get(key) || null),
      set: jest.fn().mockImplementation(async (key: string, value: string) => {
        redisStore.set(key, value);
        return 'OK';
      }),
    };

    notificationsServiceMock = {
      sendToUser: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    };

    prismaMock = {
      tenant: {
        findMany: jest.fn(),
      },
      tariffItem: {
        findMany: jest.fn(),
      },
      meter: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetersSchedulerService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: notificationsServiceMock },
        { provide: RedisService, useValue: redisServiceMock },
      ],
    }).compile();

    service = module.get<MetersSchedulerService>(MetersSchedulerService);
  });

  it('счётчик с подтверждённым показанием (VERIFIED) за текущий период НЕ напоминается', async () => {
    prismaMock.tenant.findMany.mockResolvedValue([{ id: 'tenant-1', name: 'ЖК Сарыарка' }]);
    prismaMock.tariffItem.findMany.mockResolvedValue([
      {
        id: 'tariff-1',
        tenantId: 'tenant-1',
        isActive: true,
        calculationMethod: ChargeCalculationMethod.PER_CONSUMPTION,
        meterType: MeterType.COLD_WATER,
      },
    ]);

    prismaMock.meter.findMany.mockResolvedValue([
      {
        id: 'meter-verified',
        type: MeterType.COLD_WATER,
        isActive: true,
        unit: {
          id: 'unit-1',
          unitNumber: '101',
          ownerships: [{ userId: 'user-owner-1', isVerified: true }],
        },
        readings: [
          {
            id: 'reading-1',
            status: ReadingStatus.VERIFIED,
            periodMonth: 9,
            periodYear: 2026,
          },
        ],
      },
    ]);

    const res = await service.handleMeterReadingReminders();

    expect(res.tenantsChecked).toBe(1);
    expect(res.metersNeedingReading).toBe(0);
    expect(res.remindersSent).toBe(0);
    expect(notificationsServiceMock.sendToUser).not.toHaveBeenCalled();
  });

  it('счётчик с показанием в статусе PENDING (на проверке) НЕ напоминается', async () => {
    prismaMock.tenant.findMany.mockResolvedValue([{ id: 'tenant-1', name: 'ЖК Сарыарка' }]);
    prismaMock.tariffItem.findMany.mockResolvedValue([
      {
        id: 'tariff-1',
        tenantId: 'tenant-1',
        isActive: true,
        calculationMethod: ChargeCalculationMethod.PER_CONSUMPTION,
        meterType: MeterType.HOT_WATER,
      },
    ]);

    prismaMock.meter.findMany.mockResolvedValue([
      {
        id: 'meter-pending',
        type: MeterType.HOT_WATER,
        isActive: true,
        unit: {
          id: 'unit-1',
          unitNumber: '102',
          ownerships: [{ userId: 'user-owner-1', isVerified: true }],
        },
        readings: [
          {
            id: 'reading-pending',
            status: ReadingStatus.PENDING,
            periodMonth: 9,
            periodYear: 2026,
          },
        ],
      },
    ]);

    const res = await service.handleMeterReadingReminders();

    expect(res.metersNeedingReading).toBe(0);
    expect(res.remindersSent).toBe(0);
    expect(notificationsServiceMock.sendToUser).not.toHaveBeenCalled();
  });

  it('счётчик с отклонённым показанием (REJECTED) НАПОМИНАЕТСЯ (кейс повторной подачи)', async () => {
    prismaMock.tenant.findMany.mockResolvedValue([{ id: 'tenant-1', name: 'ЖК Сарыарка' }]);
    prismaMock.tariffItem.findMany.mockResolvedValue([
      {
        id: 'tariff-1',
        tenantId: 'tenant-1',
        isActive: true,
        calculationMethod: ChargeCalculationMethod.PER_CONSUMPTION,
        meterType: MeterType.COLD_WATER,
      },
    ]);

    prismaMock.meter.findMany.mockResolvedValue([
      {
        id: 'meter-rejected',
        type: MeterType.COLD_WATER,
        isActive: true,
        unit: {
          id: 'unit-1',
          unitNumber: '103',
          ownerships: [{ userId: 'user-owner-1', isVerified: true }],
        },
        readings: [
          {
            id: 'reading-rejected',
            status: ReadingStatus.REJECTED,
            periodMonth: 9,
            periodYear: 2026,
          },
        ],
      },
    ]);

    const res = await service.handleMeterReadingReminders();

    expect(res.metersNeedingReading).toBe(1);
    expect(res.remindersSent).toBe(1);
    expect(notificationsServiceMock.sendToUser).toHaveBeenCalledWith(
      'user-owner-1',
      expect.objectContaining({
        title: 'Напоминание о передаче показаний счётчика',
        body: expect.stringContaining('холодная вода'),
        data: {
          type: 'METER_READING_REMINDER',
          meterId: 'meter-rejected',
        },
      }),
    );
  });

  it('счётчик без каких-либо показаний за текущий период НАПОМИНАЕТСЯ', async () => {
    prismaMock.tenant.findMany.mockResolvedValue([{ id: 'tenant-1', name: 'ЖК Сарыарка' }]);
    prismaMock.tariffItem.findMany.mockResolvedValue([
      {
        id: 'tariff-1',
        tenantId: 'tenant-1',
        isActive: true,
        calculationMethod: ChargeCalculationMethod.PER_CONSUMPTION,
        meterType: MeterType.ELECTRICITY,
      },
    ]);

    prismaMock.meter.findMany.mockResolvedValue([
      {
        id: 'meter-empty',
        type: MeterType.ELECTRICITY,
        isActive: true,
        unit: {
          id: 'unit-1',
          unitNumber: '104',
          ownerships: [{ userId: 'user-owner-1', isVerified: true }],
        },
        readings: [],
      },
    ]);

    const res = await service.handleMeterReadingReminders();

    expect(res.metersNeedingReading).toBe(1);
    expect(res.remindersSent).toBe(1);
    expect(notificationsServiceMock.sendToUser).toHaveBeenCalledWith(
      'user-owner-1',
      expect.objectContaining({
        title: 'Напоминание о передаче показаний счётчика',
        body: expect.stringContaining('электроэнергия'),
        data: {
          type: 'METER_READING_REMINDER',
          meterId: 'meter-empty',
        },
      }),
    );
  });

  it('подтверждённый жилец-арендатор (TENANT) НАПОМИНАЕТСЯ (не исключается по правилу OWNER-only)', async () => {
    prismaMock.tenant.findMany.mockResolvedValue([{ id: 'tenant-1', name: 'ЖК Сарыарка' }]);
    prismaMock.tariffItem.findMany.mockResolvedValue([
      {
        id: 'tariff-1',
        tenantId: 'tenant-1',
        isActive: true,
        calculationMethod: ChargeCalculationMethod.PER_CONSUMPTION,
        meterType: MeterType.COLD_WATER,
      },
    ]);

    // Unit has a verified TENANT occupant
    prismaMock.meter.findMany.mockResolvedValue([
      {
        id: 'meter-tenant-unit',
        type: MeterType.COLD_WATER,
        isActive: true,
        unit: {
          id: 'unit-1',
          unitNumber: '105',
          ownerships: [
            {
              userId: 'user-tenant-occupant',
              ownershipType: OwnershipType.TENANT,
              isVerified: true,
            },
          ],
        },
        readings: [],
      },
    ]);

    const res = await service.handleMeterReadingReminders();

    expect(res.metersNeedingReading).toBe(1);
    expect(res.remindersSent).toBe(1);
    expect(notificationsServiceMock.sendToUser).toHaveBeenCalledWith(
      'user-tenant-occupant',
      expect.objectContaining({
        data: {
          type: 'METER_READING_REMINDER',
          meterId: 'meter-tenant-unit',
        },
      }),
    );
  });

  it('квартира с двумя подтверждёнными жителями (смешанные OWNER и TENANT) отправляет напоминания обоим', async () => {
    prismaMock.tenant.findMany.mockResolvedValue([{ id: 'tenant-1', name: 'ЖК Сарыарка' }]);
    prismaMock.tariffItem.findMany.mockResolvedValue([
      {
        id: 'tariff-1',
        tenantId: 'tenant-1',
        isActive: true,
        calculationMethod: ChargeCalculationMethod.PER_CONSUMPTION,
        meterType: MeterType.COLD_WATER,
      },
    ]);

    prismaMock.meter.findMany.mockResolvedValue([
      {
        id: 'meter-multi-user',
        type: MeterType.COLD_WATER,
        isActive: true,
        unit: {
          id: 'unit-1',
          unitNumber: '106',
          ownerships: [
            { userId: 'user-owner', ownershipType: OwnershipType.OWNER, isVerified: true },
            { userId: 'user-tenant', ownershipType: OwnershipType.TENANT, isVerified: true },
          ],
        },
        readings: [],
      },
    ]);

    const res = await service.handleMeterReadingReminders();

    expect(res.metersNeedingReading).toBe(1);
    expect(res.remindersSent).toBe(2);
    expect(notificationsServiceMock.sendToUser).toHaveBeenCalledWith('user-owner', expect.anything());
    expect(notificationsServiceMock.sendToUser).toHaveBeenCalledWith('user-tenant', expect.anything());
  });

  it('ЖК только с тарифами PER_AREA (без тарифов PER_CONSUMPTION) создаёт 0 напоминаний', async () => {
    prismaMock.tenant.findMany.mockResolvedValue([{ id: 'tenant-flat-only', name: 'ЖК БезСчетчиков' }]);
    prismaMock.tariffItem.findMany.mockResolvedValue([
      {
        id: 'tariff-area',
        tenantId: 'tenant-flat-only',
        isActive: true,
        calculationMethod: ChargeCalculationMethod.PER_AREA,
        meterType: null,
      },
    ]);

    const res = await service.handleMeterReadingReminders();

    expect(res.tenantsChecked).toBe(1);
    expect(res.metersNeedingReading).toBe(0);
    expect(res.remindersSent).toBe(0);
    expect(prismaMock.meter.findMany).not.toHaveBeenCalled();
    expect(notificationsServiceMock.sendToUser).not.toHaveBeenCalled();
  });

  it('повторный вызов отправляет ровно 0 дополнительных напоминаний (дедупликация через Redis)', async () => {
    prismaMock.tenant.findMany.mockResolvedValue([{ id: 'tenant-1', name: 'ЖК Сарыарка' }]);
    prismaMock.tariffItem.findMany.mockResolvedValue([
      {
        id: 'tariff-1',
        tenantId: 'tenant-1',
        isActive: true,
        calculationMethod: ChargeCalculationMethod.PER_CONSUMPTION,
        meterType: MeterType.COLD_WATER,
      },
    ]);

    prismaMock.meter.findMany.mockResolvedValue([
      {
        id: 'meter-debounce',
        type: MeterType.COLD_WATER,
        isActive: true,
        unit: {
          id: 'unit-1',
          unitNumber: '107',
          ownerships: [{ userId: 'user-owner-1', isVerified: true }],
        },
        readings: [],
      },
    ]);

    // 1st run: sends 1 reminder
    const res1 = await service.handleMeterReadingReminders();
    expect(res1.metersNeedingReading).toBe(1);
    expect(res1.remindersSent).toBe(1);
    expect(res1.skippedAlreadyReminded).toBe(0);
    expect(notificationsServiceMock.sendToUser).toHaveBeenCalledTimes(1);

    // 2nd run: debounced, 0 reminders sent
    const res2 = await service.handleMeterReadingReminders();
    expect(res2.metersNeedingReading).toBe(1);
    expect(res2.remindersSent).toBe(0);
    expect(res2.skippedAlreadyReminded).toBe(1);
    expect(notificationsServiceMock.sendToUser).toHaveBeenCalledTimes(1); // Still 1 total
  });

  it('ошибка sendToUser для одного пользователя не блокирует отправку остальным', async () => {
    prismaMock.tenant.findMany.mockResolvedValue([{ id: 'tenant-1', name: 'ЖК Сарыарка' }]);
    prismaMock.tariffItem.findMany.mockResolvedValue([
      {
        id: 'tariff-1',
        tenantId: 'tenant-1',
        isActive: true,
        calculationMethod: ChargeCalculationMethod.PER_CONSUMPTION,
        meterType: MeterType.COLD_WATER,
      },
    ]);

    prismaMock.meter.findMany.mockResolvedValue([
      {
        id: 'meter-err-isolation',
        type: MeterType.COLD_WATER,
        isActive: true,
        unit: {
          id: 'unit-1',
          unitNumber: '108',
          ownerships: [
            { userId: 'user-failing', isVerified: true },
            { userId: 'user-working', isVerified: true },
          ],
        },
        readings: [],
      },
    ]);

    notificationsServiceMock.sendToUser.mockImplementation(async (userId: string) => {
      if (userId === 'user-failing') {
        throw new Error('FCM connection failure');
      }
      return { id: 'notif-working' };
    });

    const res = await service.handleMeterReadingReminders();

    expect(res.metersNeedingReading).toBe(1);
    expect(res.remindersSent).toBe(1);
    expect(notificationsServiceMock.sendToUser).toHaveBeenCalledWith('user-failing', expect.anything());
    expect(notificationsServiceMock.sendToUser).toHaveBeenCalledWith('user-working', expect.anything());
  });
});
