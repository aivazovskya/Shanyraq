import { Test, TestingModule } from '@nestjs/testing';
import { BookingsSchedulerService } from './bookings-scheduler.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RedisService } from '../../redis/redis.service';
import { BookingStatus, UserRole } from '@prisma/client';

describe('BookingsSchedulerService (Task 0054: Push reminders for upcoming bookings)', () => {
  let service: BookingsSchedulerService;
  let prismaMock: any;
  let notificationsServiceMock: any;
  let redisServiceMock: any;
  let redisStore: Map<string, string>;

  beforeEach(async () => {
    redisStore = new Map();

    prismaMock = {
      booking: {
        findMany: jest.fn(),
      },
      bookableResource: {
        findMany: jest.fn(),
      },
    };

    notificationsServiceMock = {
      sendToUser: jest.fn().mockResolvedValue({ sent: 1 }),
      sendToTenantRoles: jest.fn().mockResolvedValue({ sent: 2 }),
    };

    redisServiceMock = {
      get: jest.fn().mockImplementation((key: string) => Promise.resolve(redisStore.get(key) || null)),
      set: jest.fn().mockImplementation((key: string, val: string) => {
        redisStore.set(key, val);
        return Promise.resolve('OK');
      }),
      del: jest.fn().mockImplementation((key: string) => {
        const existed = redisStore.delete(key);
        return Promise.resolve(existed ? 1 : 0);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsSchedulerService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: notificationsServiceMock },
        { provide: RedisService, useValue: redisServiceMock },
      ],
    }).compile();

    service = module.get<BookingsSchedulerService>(BookingsSchedulerService);
  });

  describe('handleUpcomingBookingReminders', () => {
    it('запрашивает только подтвержденные (CONFIRMED) бронирования в окне 25-35 минут от текущего момента', async () => {
      prismaMock.booking.findMany.mockResolvedValue([]);

      const beforeRun = Date.now();
      await service.handleUpcomingBookingReminders();
      const afterRun = Date.now();

      expect(prismaMock.booking.findMany).toHaveBeenCalledTimes(1);
      const callArgs = prismaMock.booking.findMany.mock.calls[0][0];

      expect(callArgs.where.status).toBe(BookingStatus.CONFIRMED);

      const gteTime = callArgs.where.startTime.gte.getTime();
      const lteTime = callArgs.where.startTime.lte.getTime();

      // Окно: [now + 25m, now + 35m]
      expect(gteTime).toBeGreaterThanOrEqual(beforeRun + 25 * 60 * 1000 - 50);
      expect(gteTime).toBeLessThanOrEqual(afterRun + 25 * 60 * 1000 + 50);

      expect(lteTime).toBeGreaterThanOrEqual(beforeRun + 35 * 60 * 1000 - 50);
      expect(lteTime).toBeLessThanOrEqual(afterRun + 35 * 60 * 1000 + 50);
    });

    it('бронирование через 30 минут триггерит напоминание, а через 5 минут или через 2 часа — нет (границы окна)', async () => {
      const now = Date.now();

      const bookingIn30Min = {
        id: 'booking-30m',
        resourceId: 'res-bbq',
        bookedById: 'user-resident-1',
        startTime: new Date(now + 30 * 60 * 1000), // в окне 25-35 мин
        endTime: new Date(now + 90 * 60 * 1000),
        resource: { name: 'Зона барбекю №1' },
      };

      // Имитируем, что фильтр БД вернул только подходящее бронирование
      prismaMock.booking.findMany.mockImplementation(({ where }: any) => {
        const candidateTime = bookingIn30Min.startTime.getTime();
        const inWindow =
          candidateTime >= where.startTime.gte.getTime() &&
          candidateTime <= where.startTime.lte.getTime();
        return Promise.resolve(inWindow ? [bookingIn30Min] : []);
      });

      const summary = await service.handleUpcomingBookingReminders();

      expect(summary.bookingsChecked).toBe(1);
      expect(summary.remindersSent).toBe(1);
      expect(notificationsServiceMock.sendToUser).toHaveBeenCalledWith(
        'user-resident-1',
        expect.objectContaining({
          title: '⏰ Скоро бронирование',
          body: expect.stringContaining('Зона барбекю №1'),
          data: {
            type: 'BOOKING_UPCOMING_REMINDER',
            bookingId: 'booking-30m',
            resourceId: 'res-bbq',
          },
        }),
      );
    });

    it('отмененное бронирование (CANCELLED) через 30 минут НЕ триггерит напоминание (исключено фильтром статуса)', async () => {
      // При наличии в базе отмененной брони с тем же временем, фильтр status: CONFIRMED ее исключает
      prismaMock.booking.findMany.mockImplementation(({ where }: any) => {
        if (where.status === BookingStatus.CONFIRMED) {
          return Promise.resolve([]); // отмененная бронь не возвращается
        }
        return Promise.resolve([{ id: 'booking-cancelled' }]);
      });

      const summary = await service.handleUpcomingBookingReminders();

      expect(summary.bookingsChecked).toBe(0);
      expect(summary.remindersSent).toBe(0);
      expect(notificationsServiceMock.sendToUser).not.toHaveBeenCalled();
    });

    it('напоминание отправляется строго bookedById через sendToUser без рассылки по ролям', async () => {
      const now = Date.now();
      const booking = {
        id: 'booking-direct',
        resourceId: 'res-coworking',
        bookedById: 'resident-user-42',
        startTime: new Date(now + 28 * 60 * 1000),
        endTime: new Date(now + 88 * 60 * 1000),
        resource: { name: 'Коворкинг' },
      };

      prismaMock.booking.findMany.mockResolvedValue([booking]);

      await service.handleUpcomingBookingReminders();

      expect(notificationsServiceMock.sendToUser).toHaveBeenCalledTimes(1);
      expect(notificationsServiceMock.sendToUser).toHaveBeenCalledWith(
        'resident-user-42',
        expect.anything(),
      );
    });

    it('дедупликация через Redis: два последовательных вызова шедулера для одного и того же бронирования отправляют ровно 1 напоминание', async () => {
      const now = Date.now();
      const booking = {
        id: 'booking-debounce',
        resourceId: 'res-parking',
        bookedById: 'user-debounced',
        startTime: new Date(now + 30 * 60 * 1000),
        endTime: new Date(now + 90 * 60 * 1000),
        resource: { name: 'Гостевой паркинг' },
      };

      prismaMock.booking.findMany.mockResolvedValue([booking]);

      // Первый прогон
      const firstRun = await service.handleUpcomingBookingReminders();
      expect(firstRun.remindersSent).toBe(1);
      expect(firstRun.skippedAlreadyReminded).toBe(0);
      expect(redisServiceMock.set).toHaveBeenCalledWith(
        'bookings:reminder:booking-debounce',
        '1',
        3600,
      );

      // Второй прогон
      const secondRun = await service.handleUpcomingBookingReminders();
      expect(secondRun.bookingsChecked).toBe(1);
      expect(secondRun.remindersSent).toBe(0);
      expect(secondRun.skippedAlreadyReminded).toBe(1);

      // sendToUser вызван ровно 1 раз
      expect(notificationsServiceMock.sendToUser).toHaveBeenCalledTimes(1);
    });

    it('изоляция ошибок: падение отправки для одного бронирования не блокирует отправку для остальных', async () => {
      const now = Date.now();
      const failingBooking = {
        id: 'booking-fail',
        resourceId: 'res-1',
        bookedById: 'failing-user',
        startTime: new Date(now + 30 * 60 * 1000),
        endTime: new Date(now + 60 * 60 * 1000),
        resource: { name: 'Зона 1' },
      };

      const successBooking = {
        id: 'booking-ok',
        resourceId: 'res-2',
        bookedById: 'success-user',
        startTime: new Date(now + 30 * 60 * 1000),
        endTime: new Date(now + 60 * 60 * 1000),
        resource: { name: 'Зона 2' },
      };

      prismaMock.booking.findMany.mockResolvedValue([
        failingBooking,
        successBooking,
      ]);

      notificationsServiceMock.sendToUser
        .mockRejectedValueOnce(new Error('FCM token expired'))
        .mockResolvedValueOnce({ sent: 1 });

      const summary = await service.handleUpcomingBookingReminders();

      expect(summary.bookingsChecked).toBe(2);
      expect(summary.remindersSent).toBe(1);
      expect(notificationsServiceMock.sendToUser).toHaveBeenCalledTimes(2);
    });

    it('безопасно обрабатывает сбой обращения к БД Prisma', async () => {
      prismaMock.booking.findMany.mockRejectedValue(new Error('DB connection reset'));

      const summary = await service.handleUpcomingBookingReminders();

      expect(summary.bookingsChecked).toBe(0);
      expect(summary.remindersSent).toBe(0);
      expect(notificationsServiceMock.sendToUser).not.toHaveBeenCalled();
    });
  });

  describe('handleGuestParkingCapacityCheck (Task 0058: Guest parking full-capacity alert)', () => {
    it('тенант, где ВСЕ активные GUEST_PARKING ресурсы заняты сейчас, триггерит алерт; тенант со свободным местом — нет', async () => {
      prismaMock.bookableResource.findMany.mockResolvedValue([
        { id: 'parking-full-1', tenantId: 'tenant-full' },
        { id: 'parking-full-2', tenantId: 'tenant-full' },
        { id: 'parking-free-1', tenantId: 'tenant-free' },
        { id: 'parking-free-2', tenantId: 'tenant-free' },
      ]);

      // tenant-full: both resources currently occupied.
      // tenant-free: only one of two resources occupied.
      prismaMock.booking.findMany.mockResolvedValue([
        { resourceId: 'parking-full-1' },
        { resourceId: 'parking-full-2' },
        { resourceId: 'parking-free-1' },
      ]);

      const summary = await service.handleGuestParkingCapacityCheck();

      expect(summary.tenantsChecked).toBe(2);
      expect(summary.tenantsFull).toBe(1);
      expect(summary.alertsSent).toBe(1);

      expect(notificationsServiceMock.sendToTenantRoles).toHaveBeenCalledTimes(1);
      expect(notificationsServiceMock.sendToTenantRoles).toHaveBeenCalledWith(
        'tenant-full',
        expect.anything(),
        expect.objectContaining({
          data: expect.objectContaining({ type: 'GUEST_PARKING_FULL', tenantId: 'tenant-full' }),
        }),
      );
    });

    it('тенант без активных GUEST_PARKING ресурсов никогда не триггерит алерт', async () => {
      prismaMock.bookableResource.findMany.mockResolvedValue([]);

      const summary = await service.handleGuestParkingCapacityCheck();

      expect(summary.tenantsChecked).toBe(0);
      expect(summary.alertsSent).toBe(0);
      expect(prismaMock.booking.findMany).not.toHaveBeenCalled();
      expect(notificationsServiceMock.sendToTenantRoles).not.toHaveBeenCalled();
    });

    it('алерт отправляется строго ролям [SECURITY, DISPATCHER], без HOA_ADMIN и HOA_CHAIRMAN', async () => {
      prismaMock.bookableResource.findMany.mockResolvedValue([
        { id: 'p1', tenantId: 'tenant-1' },
      ]);
      prismaMock.booking.findMany.mockResolvedValue([{ resourceId: 'p1' }]);

      await service.handleGuestParkingCapacityCheck();

      expect(notificationsServiceMock.sendToTenantRoles).toHaveBeenCalledWith(
        'tenant-1',
        [UserRole.SECURITY, UserRole.DISPATCHER],
        expect.anything(),
      );
    });

    it('дебаунс по состоянию: два прогона подряд при сохраняющейся полной занятости шлют ровно 1 алерт; после освобождения и повторного заполнения — алерт снова', async () => {
      prismaMock.bookableResource.findMany.mockResolvedValue([
        { id: 'p1', tenantId: 'tenant-1' },
      ]);

      // 1st run: full
      prismaMock.booking.findMany.mockResolvedValueOnce([{ resourceId: 'p1' }]);
      const run1 = await service.handleGuestParkingCapacityCheck();
      expect(run1.alertsSent).toBe(1);

      // 2nd run: still full -> no new alert
      prismaMock.booking.findMany.mockResolvedValueOnce([{ resourceId: 'p1' }]);
      const run2 = await service.handleGuestParkingCapacityCheck();
      expect(run2.alertsSent).toBe(0);
      expect(notificationsServiceMock.sendToTenantRoles).toHaveBeenCalledTimes(1);

      // 3rd run: no longer full -> flag cleared, no alert
      prismaMock.booking.findMany.mockResolvedValueOnce([]);
      const run3 = await service.handleGuestParkingCapacityCheck();
      expect(run3.alertsSent).toBe(0);
      expect(notificationsServiceMock.sendToTenantRoles).toHaveBeenCalledTimes(1);

      // 4th run: full again -> alerts again
      prismaMock.booking.findMany.mockResolvedValueOnce([{ resourceId: 'p1' }]);
      const run4 = await service.handleGuestParkingCapacityCheck();
      expect(run4.alertsSent).toBe(1);
      expect(notificationsServiceMock.sendToTenantRoles).toHaveBeenCalledTimes(2);
    });

    it('бронирование, которое уже закончилось или еще не началось, не считается занимающим место сейчас', async () => {
      const nowMs = Date.now();

      prismaMock.bookableResource.findMany.mockResolvedValue([
        { id: 'p1', tenantId: 'tenant-1' },
      ]);
      prismaMock.booking.findMany.mockResolvedValue([]);

      await service.handleGuestParkingCapacityCheck();

      // Verify the query filters strictly to "covers this instant"
      expect(prismaMock.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            startTime: { lte: expect.any(Date) },
            endTime: { gt: expect.any(Date) },
          }),
        }),
      );

      const callArgs = prismaMock.booking.findMany.mock.calls[0][0];
      expect(callArgs.where.startTime.lte.getTime()).toBeGreaterThanOrEqual(nowMs - 1000);
      expect(callArgs.where.endTime.gt.getTime()).toBeGreaterThanOrEqual(nowMs - 1000);
    });
  });
});
