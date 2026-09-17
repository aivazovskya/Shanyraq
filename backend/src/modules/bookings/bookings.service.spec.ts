import { Test, TestingModule } from '@nestjs/testing';
import { BookingsService } from './bookings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { UserRole, BookableResourceType, BookingStatus, OwnershipType } from '@prisma/client';

describe('BookingsService', () => {
  let service: BookingsService;
  let prismaMock: any;

  const mockTenantId = 'tenant-1';
  const mockResourceId = 'res-bbq-1';
  const mockUnitId = 'unit-101';

  const mockResource = {
    id: mockResourceId,
    tenantId: mockTenantId,
    name: 'Барбекю-зона',
    type: BookableResourceType.BBQ_AREA,
    description: 'Уютная зона барбекю с мангалом',
    operatingHoursStart: '08:00',
    operatingHoursEnd: '22:00',
    maxDurationMinutes: 180,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const residentOwnerUser = {
    id: 'user-owner-1',
    role: UserRole.RESIDENT_OWNER,
    tenantId: mockTenantId,
  };

  const residentTenantUser = {
    id: 'user-tenant-1',
    role: UserRole.RESIDENT_TENANT,
    tenantId: mockTenantId,
  };

  const unverifiedUser = {
    id: 'user-unverified',
    role: UserRole.RESIDENT_OWNER,
    tenantId: mockTenantId,
  };

  const staffAdminUser = {
    id: 'staff-admin-1',
    role: UserRole.HOA_ADMIN,
    tenantId: mockTenantId,
  };

  const staffOtherTenantUser = {
    id: 'staff-other-1',
    role: UserRole.HOA_ADMIN,
    tenantId: 'tenant-2',
  };

  const superAdminUser = {
    id: 'super-admin-1',
    role: UserRole.SUPERADMIN,
    tenantId: null,
  };

  let notificationsMock: any;

  beforeEach(async () => {
    prismaMock = {
      bookableResource: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      booking: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      unitOwnership: {
        findFirst: jest.fn(),
      },
      bookingWaitlistEntry: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(prismaMock);
      }),
    };

    notificationsMock = {
      sendToUser: jest.fn().mockResolvedValue({ sent: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: notificationsMock },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
  });

  describe('Каталог ресурсов (BookableResource)', () => {
    it('должен возвращать только активные пространства для жителей и все для персонала', async () => {
      prismaMock.bookableResource.findMany.mockResolvedValue([mockResource]);
      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        id: 'own-1',
        userId: residentOwnerUser.id,
        isVerified: true,
      });

      await service.getResources(mockTenantId, residentOwnerUser);
      expect(prismaMock.bookableResource.findMany).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId, isActive: true },
        orderBy: { name: 'asc' },
      });

      await service.getResources(mockTenantId, staffAdminUser);
      expect(prismaMock.bookableResource.findMany).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId },
        orderBy: { name: 'asc' },
      });
    });

    it('создание ресурса доступно только персоналу ЖК', async () => {
      prismaMock.bookableResource.create.mockResolvedValue({ ...mockResource, id: 'res-new' });

      const res = await service.createResource(
        mockTenantId,
        {
          name: 'Коворкинг',
          type: BookableResourceType.COWORKING,
          operatingHoursStart: '09:00',
          operatingHoursEnd: '21:00',
        },
        staffAdminUser,
      );
      expect(res.id).toBe('res-new');

      await expect(
        service.createResource(
          mockTenantId,
          { name: 'Коворкинг', type: BookableResourceType.COWORKING },
          residentOwnerUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('должен отклонять некорректные часы работы при создании (start >= end)', async () => {
      await expect(
        service.createResource(
          mockTenantId,
          {
            name: 'Коворкинг',
            type: BookableResourceType.COWORKING,
            operatingHoursStart: '22:00',
            operatingHoursEnd: '08:00',
          },
          staffAdminUser,
        ),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.createResource(
          mockTenantId,
          {
            name: 'Коворкинг',
            type: BookableResourceType.COWORKING,
            operatingHoursStart: '22:00',
            operatingHoursEnd: '08:00',
          },
          staffAdminUser,
        );
        fail('Should throw');
      } catch (err: any) {
        expect(err.getResponse().code).toBe('BOOKINGS.INVALID_OPERATING_HOURS');
      }
    });
  });

  describe('Сетка доступности (getAvailability)', () => {
    const fromStr = '2026-10-01T00:00:00.000Z';
    const toStr = '2026-10-01T23:59:59.000Z';

    const mockBookings = [
      {
        id: 'b-1',
        resourceId: mockResourceId,
        startTime: new Date('2026-10-01T10:00:00.000Z'),
        endTime: new Date('2026-10-01T12:00:00.000Z'),
        status: BookingStatus.CONFIRMED,
        note: 'День рождения',
        unit: { id: mockUnitId, unitNumber: '101' },
        bookedBy: { id: 'user-1', firstName: 'Айдос', lastName: 'Сериков', phone: '+77011112233' },
      },
    ];

    it('должен скрывать личные данные (ФИО, телефон, квартиру) для обычных жителей', async () => {
      prismaMock.bookableResource.findUnique.mockResolvedValue(mockResource);
      prismaMock.booking.findMany.mockResolvedValue(mockBookings);
      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        id: 'own-1',
        userId: residentOwnerUser.id,
        isVerified: true,
      });

      const result = await service.getAvailability(mockResourceId, fromStr, toStr, residentOwnerUser);

      expect(result).toEqual([
        {
          startTime: mockBookings[0].startTime,
          endTime: mockBookings[0].endTime,
        },
      ]);
      expect((result[0] as any).bookedBy).toBeUndefined();
      expect((result[0] as any).unit).toBeUndefined();
    });

    it('должен возвращать полные данные (квартира, ФИО, телефон, примечание) для персонала ЖК', async () => {
      prismaMock.bookableResource.findUnique.mockResolvedValue(mockResource);
      prismaMock.booking.findMany.mockResolvedValue(mockBookings);

      const result = await service.getAvailability(mockResourceId, fromStr, toStr, staffAdminUser);

      expect(result[0]).toHaveProperty('id', 'b-1');
      expect(result[0]).toHaveProperty('bookedBy');
      expect((result[0] as any).bookedBy.firstName).toBe('Айдос');
      expect(result[0]).toHaveProperty('unit');
    });
  });

  describe('BOLA / Изоляция тенантов на read-only эндпоинтах (getResources, getResourceById, getAvailability)', () => {
    const fromStr = '2026-10-01T00:00:00.000Z';
    const toStr = '2026-10-01T23:59:59.000Z';

    it('должен запрещать жителю без верифицированного жилья доступ к каталогу (getResources)', async () => {
      prismaMock.unitOwnership.findFirst.mockResolvedValue(null);

      await expect(service.getResources('other-tenant', residentOwnerUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('должен запрещать жителю без верифицированного жилья просмотр карточки пространства (getResourceById)', async () => {
      prismaMock.bookableResource.findUnique.mockResolvedValue(mockResource);
      prismaMock.unitOwnership.findFirst.mockResolvedValue(null);

      await expect(service.getResourceById(mockResourceId, residentOwnerUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('должен запрещать жителю без верифицированного жилья просмотр доступности слотов (getAvailability)', async () => {
      prismaMock.bookableResource.findUnique.mockResolvedValue(mockResource);
      prismaMock.unitOwnership.findFirst.mockResolvedValue(null);

      await expect(
        service.getAvailability(mockResourceId, fromStr, toStr, residentOwnerUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('должен запрещать персоналу чужого ЖК доступ к ресурсам другого ЖК', async () => {
      prismaMock.bookableResource.findUnique.mockResolvedValue(mockResource);

      await expect(service.getResources(mockTenantId, staffOtherTenantUser)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.getResourceById(mockResourceId, staffOtherTenantUser)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        service.getAvailability(mockResourceId, fromStr, toStr, staffOtherTenantUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('должен разрешать SUPERADMIN доступ к любым ЖК', async () => {
      prismaMock.bookableResource.findMany.mockResolvedValue([mockResource]);
      prismaMock.bookableResource.findUnique.mockResolvedValue(mockResource);
      prismaMock.booking.findMany.mockResolvedValue([]);

      const list = await service.getResources(mockTenantId, superAdminUser);
      expect(list).toHaveLength(1);

      const res = await service.getResourceById(mockResourceId, superAdminUser);
      expect(res.id).toBe(mockResourceId);

      const avail = await service.getAvailability(mockResourceId, fromStr, toStr, superAdminUser);
      expect(Array.isArray(avail)).toBe(true);
    });
  });

  describe('Создание бронирования (createBooking)', () => {
    beforeEach(() => {
      prismaMock.bookableResource.findUnique.mockResolvedValue(mockResource);
      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        id: 'own-1',
        userId: residentOwnerUser.id,
        unitId: mockUnitId,
        isVerified: true,
        ownershipType: OwnershipType.OWNER,
      });
    });

    it('должен успешно создавать бронирование для верифицированного собственника (OWNER)', async () => {
      prismaMock.booking.findFirst.mockResolvedValue(null); // нет перекрытий
      prismaMock.booking.create.mockImplementation((args: any) =>
        Promise.resolve({ id: 'b-new', status: BookingStatus.CONFIRMED, ...args.data }),
      );

      const booking = await service.createBooking(
        mockResourceId,
        {
          startTime: '2026-10-01T10:00:00.000Z',
          endTime: '2026-10-01T12:00:00.000Z',
          note: 'Праздник',
        },
        residentOwnerUser,
      );

      expect(booking.id).toBe('b-new');
      expect(booking.status).toBe(BookingStatus.CONFIRMED);
    });

    it('должен успешно создавать бронирование для верифицированного арендатора (TENANT)', async () => {
      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        id: 'own-2',
        userId: residentTenantUser.id,
        unitId: mockUnitId,
        isVerified: true,
        ownershipType: OwnershipType.TENANT,
      });
      prismaMock.booking.findFirst.mockResolvedValue(null);
      prismaMock.booking.create.mockImplementation((args: any) =>
        Promise.resolve({ id: 'b-tenant-new', status: BookingStatus.CONFIRMED, ...args.data }),
      );

      const booking = await service.createBooking(
        mockResourceId,
        {
          startTime: '2026-10-01T14:00:00.000Z',
          endTime: '2026-10-01T16:00:00.000Z',
        },
        residentTenantUser,
      );

      expect(booking.id).toBe('b-tenant-new');
      expect(booking.status).toBe(BookingStatus.CONFIRMED);
    });

    it('должен отклонять бронирование от жителя без верифицированного жилья', async () => {
      prismaMock.unitOwnership.findFirst.mockResolvedValue(null);

      await expect(
        service.createBooking(
          mockResourceId,
          {
            startTime: '2026-10-01T10:00:00.000Z',
            endTime: '2026-10-01T12:00:00.000Z',
          },
          unverifiedUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('должен отклонять бронирование со временем в прошлом', async () => {
      const pastStart = new Date(Date.now() - 3600000).toISOString();
      const pastEnd = new Date(Date.now() + 3600000).toISOString();

      await expect(
        service.createBooking(
          mockResourceId,
          { startTime: pastStart, endTime: pastEnd },
          residentOwnerUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('должен отклонять бронирование, если startTime >= endTime', async () => {
      await expect(
        service.createBooking(
          mockResourceId,
          {
            startTime: '2026-10-01T12:00:00.000Z',
            endTime: '2026-10-01T10:00:00.000Z',
          },
          residentOwnerUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('должен отклонять бронирование при превышении maxDurationMinutes', async () => {
      // 180 минут максимум = 3 часа, запрашиваем 4 часа (10:00 - 14:00)
      await expect(
        service.createBooking(
          mockResourceId,
          {
            startTime: '2026-10-01T10:00:00.000Z',
            endTime: '2026-10-01T14:01:00.000Z',
          },
          residentOwnerUser,
        ),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.createBooking(
          mockResourceId,
          {
            startTime: '2026-10-01T10:00:00.000Z',
            endTime: '2026-10-01T14:01:00.000Z',
          },
          residentOwnerUser,
        );
        fail('Should throw');
      } catch (err: any) {
        expect(err.getResponse().code).toBe('BOOKINGS.DURATION_EXCEEDS_LIMIT');
        expect(err.getResponse().params).toEqual({
          durationMinutes: 241,
          maxDurationMinutes: 180,
        });
      }
    });

    it('должен отклонять бронирование вне рабочих часов пространства (08:00 - 22:00 UTC)', async () => {
      // До открытия (07:00 - 09:00)
      await expect(
        service.createBooking(
          mockResourceId,
          {
            startTime: '2026-10-01T07:00:00.000Z',
            endTime: '2026-10-01T09:00:00.000Z',
          },
          residentOwnerUser,
        ),
      ).rejects.toThrow(BadRequestException);

      // После закрытия (21:00 - 23:00)
      await expect(
        service.createBooking(
          mockResourceId,
          {
            startTime: '2026-10-01T21:00:00.000Z',
            endTime: '2026-10-01T23:00:00.000Z',
          },
          residentOwnerUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('должен отклонять наложение при exact match или partial overlap', async () => {
      // Имитируем существующее бронирование с 10:00 до 12:00
      prismaMock.booking.findFirst.mockResolvedValue({
        id: 'b-existing',
        startTime: new Date('2026-10-01T10:00:00.000Z'),
        endTime: new Date('2026-10-01T12:00:00.000Z'),
      });

      // Попытка точного совпадения или частичного перекрытия
      await expect(
        service.createBooking(
          mockResourceId,
          {
            startTime: '2026-10-01T11:00:00.000Z',
            endTime: '2026-10-01T13:00:00.000Z',
          },
          residentOwnerUser,
        ),
      ).rejects.toThrow(ConflictException);

      try {
        await service.createBooking(
          mockResourceId,
          {
            startTime: '2026-10-01T11:00:00.000Z',
            endTime: '2026-10-01T13:00:00.000Z',
          },
          residentOwnerUser,
        );
        fail('Should throw');
      } catch (err: any) {
        expect(err.getResponse().code).toBe('BOOKINGS.SLOT_CONFLICT');
      }
    });

    it('соседние неперекрывающиеся слоты (adjacent) должны успешно создаваться', async () => {
      // При запросе слота 12:00 - 14:00 база не находит перекрытия
      prismaMock.booking.findFirst.mockResolvedValue(null);
      prismaMock.booking.create.mockImplementation((args: any) =>
        Promise.resolve({ id: 'b-adjacent', status: BookingStatus.CONFIRMED, ...args.data }),
      );

      const booking = await service.createBooking(
        mockResourceId,
        {
          startTime: '2026-10-01T12:00:00.000Z',
          endTime: '2026-10-01T14:00:00.000Z',
        },
        residentOwnerUser,
      );

      expect(booking.id).toBe('b-adjacent');
      expect(booking.status).toBe(BookingStatus.CONFIRMED);
    });
  });

  describe('Отмена бронирования (cancelBooking)', () => {
    const existingBooking = {
      id: 'b-cancel-1',
      resourceId: mockResourceId,
      bookedById: residentOwnerUser.id,
      status: BookingStatus.CONFIRMED,
      resource: mockResource,
    };

    it('автор бронирования может отменить свою бронь', async () => {
      prismaMock.booking.findUnique.mockResolvedValue(existingBooking);
      prismaMock.booking.update.mockResolvedValue({
        ...existingBooking,
        status: BookingStatus.CANCELLED,
        cancelledById: residentOwnerUser.id,
      });

      const res = await service.cancelBooking('b-cancel-1', residentOwnerUser);
      expect(res.status).toBe(BookingStatus.CANCELLED);
    });

    it('другой житель НЕ может отменить чужую бронь', async () => {
      prismaMock.booking.findUnique.mockResolvedValue(existingBooking);

      await expect(
        service.cancelBooking('b-cancel-1', residentTenantUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('сотрудник своего ЖК может отменить любую бронь', async () => {
      prismaMock.booking.findUnique.mockResolvedValue(existingBooking);
      prismaMock.booking.update.mockResolvedValue({
        ...existingBooking,
        status: BookingStatus.CANCELLED,
        cancelledById: staffAdminUser.id,
      });

      const res = await service.cancelBooking('b-cancel-1', staffAdminUser);
      expect(res.status).toBe(BookingStatus.CANCELLED);
    });

    it('сотрудник чужого ЖК НЕ может отменить бронь', async () => {
      prismaMock.booking.findUnique.mockResolvedValue(existingBooking);

      await expect(
        service.cancelBooking('b-cancel-1', staffOtherTenantUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('SUPERADMIN может отменить любую бронь', async () => {
      prismaMock.booking.findUnique.mockResolvedValue(existingBooking);
      prismaMock.booking.update.mockResolvedValue({
        ...existingBooking,
        status: BookingStatus.CANCELLED,
        cancelledById: superAdminUser.id,
      });

      const res = await service.cancelBooking('b-cancel-1', superAdminUser);
      expect(res.status).toBe(BookingStatus.CANCELLED);
    });

    it('Task 0070: уведомляет и удаляет ровно те записи листа ожидания, что совпадают по слоту', async () => {
      const cancelledBookingWithSlot = {
        ...existingBooking,
        resourceId: mockResourceId,
        startTime: new Date('2026-09-20T10:00:00Z'),
        endTime: new Date('2026-09-20T12:00:00Z'),
      };
      prismaMock.booking.findUnique.mockResolvedValue(cancelledBookingWithSlot);
      prismaMock.booking.update.mockResolvedValue({
        ...cancelledBookingWithSlot,
        status: BookingStatus.CANCELLED,
      });
      prismaMock.bookingWaitlistEntry.findMany.mockResolvedValueOnce([
        { id: 'w-1', userId: 'user-w1' },
        { id: 'w-2', userId: 'user-w2' },
      ]);
      prismaMock.bookableResource.findUnique.mockResolvedValue(mockResource);

      await service.cancelBooking('b-cancel-1', residentOwnerUser);

      expect(notificationsMock.sendToUser).toHaveBeenCalledTimes(2);
      expect(notificationsMock.sendToUser).toHaveBeenCalledWith(
        'user-w1',
        expect.objectContaining({ data: expect.objectContaining({ type: 'BOOKING_WAITLIST_SLOT_AVAILABLE' }) }),
      );
      expect(notificationsMock.sendToUser).toHaveBeenCalledWith(
        'user-w2',
        expect.objectContaining({ data: expect.objectContaining({ type: 'BOOKING_WAITLIST_SLOT_AVAILABLE' }) }),
      );
      expect(prismaMock.bookingWaitlistEntry.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['w-1', 'w-2'] } },
      });
    });

    it('Task 0070: отмена без совпадающих записей листа ожидания не отправляет уведомлений и не падает', async () => {
      prismaMock.booking.findUnique.mockResolvedValue(existingBooking);
      prismaMock.booking.update.mockResolvedValue({
        ...existingBooking,
        status: BookingStatus.CANCELLED,
      });
      prismaMock.bookingWaitlistEntry.findMany.mockResolvedValueOnce([]);

      await expect(
        service.cancelBooking('b-cancel-1', residentOwnerUser),
      ).resolves.toBeDefined();
      expect(notificationsMock.sendToUser).not.toHaveBeenCalled();
      expect(prismaMock.bookingWaitlistEntry.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('Лист ожидания (joinWaitlist / getMyWaitlistEntries / leaveWaitlist) — Task 0070', () => {
    const futureStart = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const futureEnd = new Date(futureStart.getTime() + 2 * 60 * 60 * 1000);

    beforeEach(() => {
      prismaMock.bookableResource.findUnique.mockResolvedValue(mockResource);
      prismaMock.unitOwnership.findFirst.mockResolvedValue({
        id: 'own-1',
        userId: residentOwnerUser.id,
        unitId: mockUnitId,
        isVerified: true,
        unit: { id: mockUnitId },
      });
    });

    it('отклоняет присоединение к листу ожидания, если слот сейчас свободен (SLOT_NOT_FULL)', async () => {
      prismaMock.booking.findFirst.mockResolvedValue(null); // нет конфликтующей брони

      const promise = service.joinWaitlist(
        mockResourceId,
        { startTime: futureStart.toISOString(), endTime: futureEnd.toISOString() },
        residentOwnerUser,
      );
      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'BOOKINGS.SLOT_NOT_FULL' },
      });
      expect(prismaMock.bookingWaitlistEntry.create).not.toHaveBeenCalled();
    });

    it('разрешает присоединение, когда слот действительно занят', async () => {
      prismaMock.booking.findFirst.mockResolvedValue({ id: 'existing-conflict' });
      prismaMock.bookingWaitlistEntry.create.mockResolvedValue({
        id: 'wl-1',
        resourceId: mockResourceId,
        unitId: mockUnitId,
        userId: residentOwnerUser.id,
      });

      const result = await service.joinWaitlist(
        mockResourceId,
        { startTime: futureStart.toISOString(), endTime: futureEnd.toISOString() },
        residentOwnerUser,
      );

      expect(result.id).toBe('wl-1');
    });

    it('отклоняет неверифицированного жителя (ForbiddenException)', async () => {
      prismaMock.unitOwnership.findFirst.mockResolvedValue(null);
      prismaMock.booking.findFirst.mockResolvedValue({ id: 'existing-conflict' });

      await expect(
        service.joinWaitlist(
          mockResourceId,
          { startTime: futureStart.toISOString(), endTime: futureEnd.toISOString() },
          unverifiedUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('отклоняет повторное присоединение того же юнита на тот же слот (ALREADY_ON_WAITLIST)', async () => {
      prismaMock.booking.findFirst.mockResolvedValue({ id: 'existing-conflict' });
      prismaMock.bookingWaitlistEntry.create.mockRejectedValue(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
      );

      const promise = service.joinWaitlist(
        mockResourceId,
        { startTime: futureStart.toISOString(), endTime: futureEnd.toISOString() },
        residentOwnerUser,
      );
      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'BOOKINGS.ALREADY_ON_WAITLIST' },
      });
    });

    it('getMyWaitlistEntries возвращает только записи вызывающего пользователя', async () => {
      prismaMock.bookingWaitlistEntry.findMany.mockResolvedValueOnce([{ id: 'wl-1' }]);

      const result = await service.getMyWaitlistEntries(residentOwnerUser);

      expect(result).toEqual([{ id: 'wl-1' }]);
      expect(prismaMock.bookingWaitlistEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: residentOwnerUser.id } }),
      );
    });

    it('leaveWaitlist позволяет удалить только собственную запись', async () => {
      prismaMock.bookingWaitlistEntry.findUnique.mockResolvedValue({
        id: 'wl-1',
        userId: residentOwnerUser.id,
      });

      const result = await service.leaveWaitlist('wl-1', residentOwnerUser);
      expect(result.success).toBe(true);
      expect(prismaMock.bookingWaitlistEntry.delete).toHaveBeenCalledWith({ where: { id: 'wl-1' } });
    });

    it('leaveWaitlist отклоняет удаление чужой записи (ForbiddenException)', async () => {
      prismaMock.bookingWaitlistEntry.findUnique.mockResolvedValue({
        id: 'wl-1',
        userId: 'someone-else',
      });

      await expect(
        service.leaveWaitlist('wl-1', residentOwnerUser),
      ).rejects.toThrow(ForbiddenException);
      expect(prismaMock.bookingWaitlistEntry.delete).not.toHaveBeenCalled();
    });

    it('leaveWaitlist выбрасывает NotFoundException для несуществующей записи', async () => {
      prismaMock.bookingWaitlistEntry.findUnique.mockResolvedValue(null);

      await expect(
        service.leaveWaitlist('missing-id', residentOwnerUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getTenantWaitlist (Task 0076: спрос листа ожидания для персонала)', () => {
    it('отклоняет вызов жителем (ForbiddenException BOOKINGS.MANAGE_FORBIDDEN)', async () => {
      await expect(
        service.getTenantWaitlist(mockTenantId, {}, residentOwnerUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('отклоняет вызов сотрудником другого ЖК (ForbiddenException)', async () => {
      await expect(
        service.getTenantWaitlist(mockTenantId, {}, staffOtherTenantUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('позволяет SUPERADMIN просматривать чужой ЖК', async () => {
      prismaMock.bookingWaitlistEntry.findMany.mockResolvedValueOnce([]);

      const result = await service.getTenantWaitlist(mockTenantId, {}, superAdminUser);
      expect(result).toEqual([]);
      expect(prismaMock.bookingWaitlistEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ resource: { tenantId: mockTenantId } }),
        }),
      );
    });

    it('позволяет сотруднику ЖК просматривать записи своего ЖК с изоляцией по resource.tenantId', async () => {
      const mockEntries = [
        {
          id: 'wl-1',
          resourceId: 'res-1',
          resource: { id: 'res-1', name: 'Барбекю', type: 'BBQ_AREA' },
          unit: { id: 'u-1', unitNumber: '101', building: { id: 'b-1', blockName: 'A' } },
          user: { id: 'usr-1', firstName: 'Асан', lastName: 'Асанов', phone: '+77011112233' },
          createdAt: new Date(),
        },
      ];
      prismaMock.bookingWaitlistEntry.findMany.mockResolvedValueOnce(mockEntries);

      const result = await service.getTenantWaitlist(mockTenantId, {}, staffAdminUser);
      expect(result).toEqual(mockEntries);
      expect(prismaMock.bookingWaitlistEntry.findMany).toHaveBeenCalledWith({
        where: { resource: { tenantId: mockTenantId } },
        include: {
          resource: { select: { id: true, name: true, type: true } },
          unit: {
            select: {
              id: true,
              unitNumber: true,
              building: { select: { id: true, blockName: true } },
            },
          },
          user: {
            select: { id: true, firstName: true, lastName: true, phone: true },
          },
        },
        orderBy: [{ resourceId: 'asc' }, { createdAt: 'asc' }],
      });
    });

    it('фильтрует по resourceId при передаче в query', async () => {
      prismaMock.bookingWaitlistEntry.findMany.mockResolvedValueOnce([]);

      await service.getTenantWaitlist(mockTenantId, { resourceId: 'res-special' }, staffAdminUser);
      expect(prismaMock.bookingWaitlistEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            resource: { tenantId: mockTenantId },
            resourceId: 'res-special',
          },
        }),
      );
    });
  });
});
