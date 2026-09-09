import { Test, TestingModule } from '@nestjs/testing';
import { BookingsService } from './bookings.service';
import { PrismaService } from '../../prisma/prisma.service';
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
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(prismaMock);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: PrismaService, useValue: prismaMock },
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
  });
});
