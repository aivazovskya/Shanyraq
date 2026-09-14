import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, BookingStatus, OwnershipType } from '@prisma/client';
import {
  CreateBookableResourceDto,
  UpdateBookableResourceDto,
  CreateBookingDto,
  GetBookingsQueryDto,
  JoinWaitlistDto,
} from './dto/bookings.dto';
import { assertAccessToTenant, TenantAccessErrorCodes } from '../../common/guards/tenant.guard';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // =============================================================
  // Каталог ресурсов (BookableResource)
  // =============================================================

  async getResources(tenantId: string, user: any) {
    const isStaff = await this.assertAccessToTenant(user, tenantId);

    // Для жителей отображаются только активные пространства
    const whereClause: any = { tenantId };
    if (!isStaff) {
      whereClause.isActive = true;
    }

    return this.prisma.bookableResource.findMany({
      where: whereClause,
      orderBy: { name: 'asc' },
    });
  }

  async getResourceById(id: string, user: any) {
    const resource = await this.prisma.bookableResource.findUnique({
      where: { id },
    });
    if (!resource) {
      throw new NotFoundException({
        code: 'BOOKINGS.RESOURCE_NOT_FOUND',
        message: 'Пространство не найдено',
      });
    }

    await this.assertAccessToTenant(user, resource.tenantId);

    return resource;
  }

  async createResource(tenantId: string, dto: CreateBookableResourceDto, user: any) {
    this.assertStaffRole(user, tenantId);

    if (dto.operatingHoursStart && dto.operatingHoursEnd) {
      if (dto.operatingHoursStart >= dto.operatingHoursEnd) {
        throw new BadRequestException({
          code: 'BOOKINGS.INVALID_OPERATING_HOURS',
          message: 'Время начала работы должно быть раньше времени окончания',
        });
      }
    }

    return this.prisma.bookableResource.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        type: dto.type,
        description: dto.description?.trim() || null,
        operatingHoursStart: dto.operatingHoursStart || null,
        operatingHoursEnd: dto.operatingHoursEnd || null,
        maxDurationMinutes: dto.maxDurationMinutes || null,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      },
    });
  }

  async updateResource(id: string, dto: UpdateBookableResourceDto, user: any) {
    const resource = await this.prisma.bookableResource.findUnique({
      where: { id },
    });
    if (!resource) {
      throw new NotFoundException({
        code: 'BOOKINGS.RESOURCE_NOT_FOUND',
        message: 'Пространство не найдено',
      });
    }

    this.assertStaffRole(user, resource.tenantId);

    const start = dto.operatingHoursStart !== undefined ? dto.operatingHoursStart : resource.operatingHoursStart;
    const end = dto.operatingHoursEnd !== undefined ? dto.operatingHoursEnd : resource.operatingHoursEnd;

    if (start && end && start >= end) {
      throw new BadRequestException({
        code: 'BOOKINGS.INVALID_OPERATING_HOURS',
        message: 'Время начала работы должно быть раньше времени окончания',
      });
    }

    return this.prisma.bookableResource.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
        ...(dto.operatingHoursStart !== undefined && { operatingHoursStart: dto.operatingHoursStart || null }),
        ...(dto.operatingHoursEnd !== undefined && { operatingHoursEnd: dto.operatingHoursEnd || null }),
        ...(dto.maxDurationMinutes !== undefined && { maxDurationMinutes: dto.maxDurationMinutes || null }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  // =============================================================
  // Доступность слотов (Availability)
  // =============================================================

  async getAvailability(resourceId: string, fromStr: string, toStr: string, user: any) {
    const resource = await this.prisma.bookableResource.findUnique({
      where: { id: resourceId },
    });
    if (!resource) {
      throw new NotFoundException({
        code: 'BOOKINGS.RESOURCE_NOT_FOUND',
        message: 'Пространство не найдено',
      });
    }

    const isStaff = await this.assertAccessToTenant(user, resource.tenantId);

    const fromDate = new Date(fromStr);
    const toDate = new Date(toStr);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new BadRequestException({
        code: 'BOOKINGS.INVALID_DATE_RANGE_FORMAT',
        message: 'Некорректный формат диапазона дат',
      });
    }
    if (fromDate >= toDate) {
      throw new BadRequestException({
        code: 'BOOKINGS.DATE_RANGE_INVERTED',
        message: 'Дата начала должна быть раньше даты окончания',
      });
    }

    const bookings = await this.prisma.booking.findMany({
      where: {
        resourceId,
        status: BookingStatus.CONFIRMED,
        startTime: { lt: toDate },
        endTime: { gt: fromDate },
      },
      include: {
        unit: {
          select: {
            id: true,
            unitNumber: true,
          },
        },
        bookedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    // Архитектурное решение #3: Для жителей скрываем личные данные, отдаем только { startTime, endTime }
    if (!isStaff) {
      return bookings.map((b) => ({
        startTime: b.startTime,
        endTime: b.endTime,
      }));
    }

    // Для персонала возвращаем полную информацию
    return bookings.map((b) => ({
      id: b.id,
      startTime: b.startTime,
      endTime: b.endTime,
      status: b.status,
      note: b.note,
      unit: b.unit,
      bookedBy: b.bookedBy,
    }));
  }

  // =============================================================
  // Бронирование (Booking)
  // =============================================================

  async createBooking(resourceId: string, dto: CreateBookingDto, user: any) {
    const resource = await this.prisma.bookableResource.findUnique({
      where: { id: resourceId },
    });
    if (!resource) {
      throw new NotFoundException({
        code: 'BOOKINGS.RESOURCE_NOT_FOUND',
        message: 'Пространство не найдено',
      });
    }
    if (!resource.isActive) {
      throw new BadRequestException({
        code: 'BOOKINGS.RESOURCE_INACTIVE',
        message: 'Данное пространство временно недоступно для бронирования',
      });
    }

    // Архитектурное решение #2: Доступно любому верифицированному жителю (собственнику или арендатору)
    const ownership = await this.prisma.unitOwnership.findFirst({
      where: {
        userId: user.id,
        isVerified: true,
        unit: {
          building: {
            tenantId: resource.tenantId,
          },
        },
      },
      include: { unit: true },
    });

    if (!ownership) {
      throw new ForbiddenException({
        code: 'BOOKINGS.OWNERSHIP_REQUIRED',
        message: 'Для бронирования общих пространств требуется подтвержденное право владения или проживания в данном ЖК',
      });
    }

    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException({
        code: 'BOOKINGS.INVALID_TIME_FORMAT',
        message: 'Некорректный формат времени',
      });
    }

    // Валидация: бронирование только в будущем
    if (start.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: 'BOOKINGS.START_TIME_MUST_BE_FUTURE',
        message: 'Время начала бронирования должно быть в будущем',
      });
    }

    // Валидация: start < end
    if (start.getTime() >= end.getTime()) {
      throw new BadRequestException({
        code: 'BOOKINGS.END_BEFORE_START',
        message: 'Время окончания бронирования должно быть позже времени начала',
      });
    }

    // Валидация: лимит длительности
    const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
    if (resource.maxDurationMinutes && durationMinutes > resource.maxDurationMinutes) {
      throw new BadRequestException({
        code: 'BOOKINGS.DURATION_EXCEEDS_LIMIT',
        message: `Длительность бронирования (${durationMinutes} мин) превышает установленный лимит (${resource.maxDurationMinutes} мин)`,
        params: { durationMinutes, maxDurationMinutes: resource.maxDurationMinutes },
      });
    }

    // Валидация: рабочие часы
    if (resource.operatingHoursStart && resource.operatingHoursEnd) {
      this.validateOperatingHours(start, end, resource.operatingHoursStart, resource.operatingHoursEnd);
    }

    // Архитектурное решение #4: Проверка перекрытия интервалов внутри транзакции
    // existing.startTime < newEnd AND existing.endTime > newStart
    return this.prisma.$transaction(async (tx) => {
      const conflict = await tx.booking.findFirst({
        where: {
          resourceId,
          status: BookingStatus.CONFIRMED,
          startTime: { lt: end },
          endTime: { gt: start },
        },
      });

      if (conflict) {
        throw new ConflictException({
          code: 'BOOKINGS.SLOT_CONFLICT',
          message: 'Выбранный временной слот уже занят',
        });
      }

      return tx.booking.create({
        data: {
          resourceId,
          unitId: ownership.unitId,
          bookedById: user.id,
          startTime: start,
          endTime: end,
          note: dto.note?.trim() || null,
          status: BookingStatus.CONFIRMED,
        },
        include: {
          resource: true,
          unit: {
            select: {
              id: true,
              unitNumber: true,
            },
          },
          bookedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
            },
          },
        },
      });
    });
  }

  /**
   * Встать в лист ожидания на слот, который сейчас полностью занят.
   * Доступно только для действительно занятого слота — если слот свободен,
   * ожидание не нужно, житель должен забронировать его напрямую.
   */
  async joinWaitlist(resourceId: string, dto: JoinWaitlistDto, user: any) {
    const resource = await this.prisma.bookableResource.findUnique({
      where: { id: resourceId },
    });
    if (!resource) {
      throw new NotFoundException({
        code: 'BOOKINGS.RESOURCE_NOT_FOUND',
        message: 'Пространство не найдено',
      });
    }
    if (!resource.isActive) {
      throw new BadRequestException({
        code: 'BOOKINGS.RESOURCE_INACTIVE',
        message: 'Данное пространство временно недоступно для бронирования',
      });
    }

    const ownership = await this.prisma.unitOwnership.findFirst({
      where: {
        userId: user.id,
        isVerified: true,
        unit: {
          building: {
            tenantId: resource.tenantId,
          },
        },
      },
      include: { unit: true },
    });

    if (!ownership) {
      throw new ForbiddenException({
        code: 'BOOKINGS.OWNERSHIP_REQUIRED',
        message: 'Для листа ожидания требуется подтвержденное право владения или проживания в данном ЖК',
      });
    }

    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException({
        code: 'BOOKINGS.INVALID_TIME_FORMAT',
        message: 'Некорректный формат времени',
      });
    }

    if (start.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: 'BOOKINGS.START_TIME_MUST_BE_FUTURE',
        message: 'Время начала бронирования должно быть в будущем',
      });
    }

    if (start.getTime() >= end.getTime()) {
      throw new BadRequestException({
        code: 'BOOKINGS.END_BEFORE_START',
        message: 'Время окончания бронирования должно быть позже времени начала',
      });
    }

    // Лист ожидания имеет смысл только для реально занятого слота
    const conflict = await this.prisma.booking.findFirst({
      where: {
        resourceId,
        status: BookingStatus.CONFIRMED,
        startTime: { lt: end },
        endTime: { gt: start },
      },
    });

    if (!conflict) {
      throw new BadRequestException({
        code: 'BOOKINGS.SLOT_NOT_FULL',
        message: 'Выбранный слот сейчас свободен — забронируйте его напрямую',
      });
    }

    try {
      return await this.prisma.bookingWaitlistEntry.create({
        data: {
          resourceId,
          unitId: ownership.unitId,
          userId: user.id,
          startTime: start,
          endTime: end,
        },
      });
    } catch {
      throw new BadRequestException({
        code: 'BOOKINGS.ALREADY_ON_WAITLIST',
        message: 'Это помещение уже стоит в листе ожидания на данный слот',
      });
    }
  }

  async getMyWaitlistEntries(user: any) {
    return this.prisma.bookingWaitlistEntry.findMany({
      where: { userId: user.id },
      include: {
        resource: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async leaveWaitlist(id: string, user: any) {
    const entry = await this.prisma.bookingWaitlistEntry.findUnique({
      where: { id },
    });

    if (!entry) {
      throw new NotFoundException({
        code: 'BOOKINGS.WAITLIST_ENTRY_NOT_FOUND',
        message: 'Запись в листе ожидания не найдена',
      });
    }

    if (entry.userId !== user.id) {
      throw new ForbiddenException({
        code: 'BOOKINGS.WAITLIST_LEAVE_FORBIDDEN',
        message: 'Вы можете удалить только собственную запись в листе ожидания',
      });
    }

    await this.prisma.bookingWaitlistEntry.delete({ where: { id } });
    return { success: true };
  }

  async getMyBookings(user: any) {
    return this.prisma.booking.findMany({
      where: {
        bookedById: user.id,
      },
      include: {
        resource: true,
        unit: {
          select: {
            id: true,
            unitNumber: true,
            building: {
              select: {
                id: true,
                blockName: true,
              },
            },
          },
        },
      },
      orderBy: { startTime: 'desc' },
    });
  }

  async getTenantBookings(tenantId: string, query: GetBookingsQueryDto, user: any) {
    this.assertStaffRole(user, tenantId);

    const where: any = {
      resource: { tenantId },
    };

    if (query.resourceId) {
      where.resourceId = query.resourceId;
    }

    if (query.from || query.to) {
      where.AND = [];
      if (query.from) {
        where.AND.push({ endTime: { gte: new Date(query.from) } });
      }
      if (query.to) {
        where.AND.push({ startTime: { lte: new Date(query.to) } });
      }
    }

    return this.prisma.booking.findMany({
      where,
      include: {
        resource: true,
        unit: {
          select: {
            id: true,
            unitNumber: true,
            building: {
              select: {
                id: true,
                blockName: true,
              },
            },
          },
        },
        bookedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        cancelledBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { startTime: 'desc' },
    });
  }

  async cancelBooking(bookingId: string, user: any) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { resource: true },
    });

    if (!booking) {
      throw new NotFoundException({
        code: 'BOOKINGS.BOOKING_NOT_FOUND',
        message: 'Бронирование не найдено',
      });
    }

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException({
        code: 'BOOKINGS.ALREADY_CANCELLED',
        message: 'Бронирование уже было отменено',
      });
    }

    const isBooker = booking.bookedById === user.id;
    const isStaff = this.isStaffUser(user, booking.resource.tenantId);

    if (!isBooker && !isStaff) {
      throw new ForbiddenException({
        code: 'BOOKINGS.CANCEL_FORBIDDEN',
        message: 'У вас нет прав на отмену этого бронирования',
      });
    }

    const cancelled = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CANCELLED,
        cancelledById: user.id,
        cancelledAt: new Date(),
      },
      include: {
        resource: true,
        unit: {
          select: {
            id: true,
            unitNumber: true,
          },
        },
      },
    });

    await this.notifyAndClearWaitlistForFreedSlot(cancelled);

    return cancelled;
  }

  /**
   * После освобождения слота уведомляет всех, кто стоит в листе ожидания
   * ИМЕННО на этот слот (resourceId + startTime + endTime), и удаляет их
   * записи — дальше это обычная гонка за бронирование, как и для всех.
   */
  private async notifyAndClearWaitlistForFreedSlot(booking: {
    resourceId: string;
    startTime: Date;
    endTime: Date;
  }) {
    try {
      const waitlistEntries = await this.prisma.bookingWaitlistEntry.findMany({
        where: {
          resourceId: booking.resourceId,
          startTime: booking.startTime,
          endTime: booking.endTime,
        },
      });

      if (waitlistEntries.length === 0) return;

      const resource = await this.prisma.bookableResource.findUnique({
        where: { id: booking.resourceId },
        select: { name: true },
      });
      const resourceName = resource?.name || 'Пространство';

      for (const entry of waitlistEntries) {
        try {
          await this.notificationsService.sendToUser(entry.userId, {
            title: '🎉 Освободился забронированный слот',
            body: `${resourceName} — слот, который вы ждали, теперь свободен. Успейте забронировать!`,
            data: {
              type: 'BOOKING_WAITLIST_SLOT_AVAILABLE',
              resourceId: booking.resourceId,
              startTime: booking.startTime.toISOString(),
              endTime: booking.endTime.toISOString(),
            },
          });
        } catch (e) {
          this.logger.warn(`Failed to notify waitlist entry ${entry.id}: ${e}`);
        }
      }

      await this.prisma.bookingWaitlistEntry.deleteMany({
        where: { id: { in: waitlistEntries.map((e) => e.id) } },
      });
    } catch (e) {
      this.logger.warn(`Failed to process waitlist for freed slot: ${e}`);
    }
  }

  // =============================================================
  // Вспомогательные методы
  // =============================================================

  private static readonly BOOKINGS_ACCESS_ERRORS: TenantAccessErrorCodes = {
    authRequired: {
      code: 'BOOKINGS.AUTH_REQUIRED',
      message: 'Требуется авторизация',
    },
    staffForbidden: {
      code: 'BOOKINGS.STAFF_CROSS_TENANT_FORBIDDEN',
      message: 'Персонал имеет доступ только к ресурсам своего жилого комплекса',
    },
    residentForbidden: {
      code: 'BOOKINGS.RESIDENT_ACCESS_FORBIDDEN',
      message: 'У вас нет подтвержденного доступа к общим пространствам данного жилого комплекса',
    },
  };

  /**
   * Проверка доступа пользователя к ресурсам/каталогу тенанта.
   * Делегирует единому хелперу assertAccessToTenant.
   */
  private async assertAccessToTenant(user: any, tenantId: string): Promise<boolean> {
    return assertAccessToTenant(
      this.prisma,
      user,
      tenantId,
      BookingsService.BOOKINGS_ACCESS_ERRORS,
    );
  }

  private isStaffUser(user: any, tenantId: string): boolean {
    if (!user) return false;
    if (user.role === UserRole.SUPERADMIN) return true;
    const staffRoles = [UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.DISPATCHER];
    return staffRoles.includes(user.role) && user.tenantId === tenantId;
  }

  private assertStaffRole(user: any, tenantId: string): void {
    if (user.role === UserRole.SUPERADMIN) return;
    const staffRoles = [UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.DISPATCHER];
    if (!staffRoles.includes(user.role) || user.tenantId !== tenantId) {
      throw new ForbiddenException({
        code: 'BOOKINGS.MANAGE_FORBIDDEN',
        message: 'Недостаточно прав для управления бронированиями данного ЖК',
      });
    }
  }

  private validateOperatingHours(start: Date, end: Date, opStart: string, opEnd: string): void {
    const [startH, startM] = opStart.split(':').map(Number);
    const [endH, endM] = opEnd.split(':').map(Number);
    const opStartMin = startH * 60 + startM;
    const opEndMin = endH * 60 + endM;

    // Сверяем по UTC
    const bookingStartMin = start.getUTCHours() * 60 + start.getUTCMinutes();
    const bookingEndMin = end.getUTCHours() * 60 + end.getUTCMinutes();

    const isSameDay =
      start.getUTCFullYear() === end.getUTCFullYear() &&
      start.getUTCMonth() === end.getUTCMonth() &&
      start.getUTCDate() === end.getUTCDate();

    if (!isSameDay || bookingStartMin < opStartMin || bookingEndMin > opEndMin) {
      throw new BadRequestException({
        code: 'BOOKINGS.OUTSIDE_OPERATING_HOURS',
        message: `Бронирование возможно только в часы работы пространства (с ${opStart} до ${opEnd})`,
        params: { opStart, opEnd },
      });
    }
  }
}
