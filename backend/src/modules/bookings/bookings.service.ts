import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, BookingStatus, OwnershipType } from '@prisma/client';
import {
  CreateBookableResourceDto,
  UpdateBookableResourceDto,
  CreateBookingDto,
  GetBookingsQueryDto,
} from './dto/bookings.dto';

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

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
      throw new NotFoundException('Пространство не найдено');
    }

    await this.assertAccessToTenant(user, resource.tenantId);

    return resource;
  }

  async createResource(tenantId: string, dto: CreateBookableResourceDto, user: any) {
    this.assertStaffRole(user, tenantId);

    if (dto.operatingHoursStart && dto.operatingHoursEnd) {
      if (dto.operatingHoursStart >= dto.operatingHoursEnd) {
        throw new BadRequestException('Время начала работы должно быть раньше времени окончания');
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
      throw new NotFoundException('Пространство не найдено');
    }

    this.assertStaffRole(user, resource.tenantId);

    const start = dto.operatingHoursStart !== undefined ? dto.operatingHoursStart : resource.operatingHoursStart;
    const end = dto.operatingHoursEnd !== undefined ? dto.operatingHoursEnd : resource.operatingHoursEnd;

    if (start && end && start >= end) {
      throw new BadRequestException('Время начала работы должно быть раньше времени окончания');
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
      throw new NotFoundException('Пространство не найдено');
    }

    const isStaff = await this.assertAccessToTenant(user, resource.tenantId);

    const fromDate = new Date(fromStr);
    const toDate = new Date(toStr);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new BadRequestException('Некорректный формат диапазона дат');
    }
    if (fromDate >= toDate) {
      throw new BadRequestException('Дата начала должна быть раньше даты окончания');
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
      throw new NotFoundException('Пространство не найдено');
    }
    if (!resource.isActive) {
      throw new BadRequestException('Данное пространство временно недоступно для бронирования');
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
      throw new ForbiddenException(
        'Для бронирования общих пространств требуется подтвержденное право владения или проживания в данном ЖК',
      );
    }

    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Некорректный формат времени');
    }

    // Валидация: бронирование только в будущем
    if (start.getTime() <= Date.now()) {
      throw new BadRequestException('Время начала бронирования должно быть в будущем');
    }

    // Валидация: start < end
    if (start.getTime() >= end.getTime()) {
      throw new BadRequestException('Время окончания бронирования должно быть позже времени начала');
    }

    // Валидация: лимит длительности
    const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
    if (resource.maxDurationMinutes && durationMinutes > resource.maxDurationMinutes) {
      throw new BadRequestException(
        `Длительность бронирования (${durationMinutes} мин) превышает установленный лимит (${resource.maxDurationMinutes} мин)`,
      );
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
        throw new ConflictException('Выбранный временной слот уже занят');
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
      throw new NotFoundException('Бронирование не найдено');
    }

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Бронирование уже было отменено');
    }

    const isBooker = booking.bookedById === user.id;
    const isStaff = this.isStaffUser(user, booking.resource.tenantId);

    if (!isBooker && !isStaff) {
      throw new ForbiddenException('У вас нет прав на отмену этого бронирования');
    }

    return this.prisma.booking.update({
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
  }

  // =============================================================
  // Вспомогательные методы
  // =============================================================

  /**
   * Проверка доступа пользователя к ресурсам/каталогу тенанта.
   * - SUPERADMIN: доступ ко всем ЖК.
   * - Персонал (HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER, SECURITY): доступ только к своему ЖК (user.tenantId === tenantId).
   * - Жители (OWNER, TENANT): доступ только при наличии верифицированного владения/проживания в зданиях данного ЖК.
   * Возвращает true, если пользователь является персоналом (или SUPERADMIN), и false, если жителем.
   */
  private async assertAccessToTenant(user: any, tenantId: string): Promise<boolean> {
    if (!user) {
      throw new ForbiddenException('Требуется авторизация');
    }

    if (user.role === UserRole.SUPERADMIN) {
      return true;
    }

    const staffRoles = [
      UserRole.HOA_ADMIN,
      UserRole.HOA_CHAIRMAN,
      UserRole.DISPATCHER,
      UserRole.SECURITY,
    ];

    if (staffRoles.includes(user.role)) {
      if (user.tenantId !== tenantId) {
        throw new ForbiddenException('Персонал имеет доступ только к ресурсам своего жилого комплекса');
      }
      return true;
    }

    // Проверяем подтвержденное владение/проживание в здании данного ЖК (зеркально getCameraStream)
    const verifiedOwnership = await this.prisma.unitOwnership.findFirst({
      where: {
        userId: user.id,
        isVerified: true,
        unit: {
          building: {
            tenantId,
          },
        },
      },
    });

    if (!verifiedOwnership) {
      throw new ForbiddenException('У вас нет подтвержденного доступа к общим пространствам данного жилого комплекса');
    }

    return false;
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
      throw new ForbiddenException('Недостаточно прав для управления бронированиями данного ЖК');
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
      throw new BadRequestException(
        `Бронирование возможно только в часы работы пространства (с ${opStart} до ${opEnd})`,
      );
    }
  }
}
