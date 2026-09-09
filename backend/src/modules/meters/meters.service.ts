import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  UserRole,
  ReadingStatus,
  MeterType,
} from '@prisma/client';
import { assertUserBelongsToTenant } from '../../common/guards/tenant.guard';
import {
  CreateMeterDto,
  UpdateMeterDto,
  SubmitReadingDto,
  ReviewReadingDto,
} from './dto/meters.dto';

interface UserContext {
  id: string;
  role: UserRole;
  tenantId?: string | null;
}

@Injectable()
export class MetersService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------
  // 1. Управление приборами учёта (Счётчиками)
  // -------------------------------------------------------------

  async getUnitMeters(unitId: string, user: UserContext) {
    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId },
      include: {
        building: true,
        ownerships: true,
      },
    });

    if (!unit) {
      throw new NotFoundException({
        code: 'METERS.UNIT_NOT_FOUND',
        message: 'Квартира/помещение не найдено',
      });
    }

    const isStaff = (
      [
        UserRole.SUPERADMIN,
        UserRole.HOA_ADMIN,
        UserRole.DISPATCHER,
        UserRole.HOA_CHAIRMAN,
      ] as UserRole[]
    ).includes(user.role);

    if (isStaff) {
      assertUserBelongsToTenant(user, unit.building.tenantId);
    } else {
      const hasVerifiedOwnership = unit.ownerships.some(
        (o) => o.userId === user.id && o.isVerified,
      );
      if (!hasVerifiedOwnership) {
        throw new ForbiddenException({
          code: 'METERS.FOREIGN_UNIT_FORBIDDEN',
          message: 'Доступ к счётчикам чужого помещения запрещён',
        });
      }
    }

    return this.prisma.meter.findMany({
      where: { unitId, isActive: true },
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
  }

  async createMeter(unitId: string, dto: CreateMeterDto, user: UserContext) {
    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId },
      include: { building: true },
    });

    if (!unit) {
      throw new NotFoundException({
        code: 'METERS.UNIT_NOT_FOUND',
        message: 'Квартира/помещение не найдено',
      });
    }

    assertUserBelongsToTenant(user, unit.building.tenantId);

    return this.prisma.meter.create({
      data: {
        unitId,
        type: dto.type,
        serialNumber: dto.serialNumber,
        initialValue: dto.initialValue ?? 0,
      },
    });
  }

  async updateMeter(meterId: string, dto: UpdateMeterDto, user: UserContext) {
    const meter = await this.prisma.meter.findUnique({
      where: { id: meterId },
      include: {
        unit: {
          include: { building: true },
        },
      },
    });

    if (!meter) {
      throw new NotFoundException({
        code: 'METERS.METER_NOT_FOUND',
        message: 'Счётчик не найден',
      });
    }

    assertUserBelongsToTenant(user, meter.unit.building.tenantId);

    return this.prisma.meter.update({
      where: { id: meterId },
      data: {
        ...(dto.serialNumber !== undefined && { serialNumber: dto.serialNumber }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  // -------------------------------------------------------------
  // 2. Подача показаний жильцами (OWNER & TENANT)
  // -------------------------------------------------------------

  async submitReading(meterId: string, dto: SubmitReadingDto, user: UserContext) {
    const meter = await this.prisma.meter.findUnique({
      where: { id: meterId },
      include: {
        unit: {
          include: {
            building: true,
            ownerships: true,
          },
        },
      },
    });

    if (!meter) {
      throw new NotFoundException({
        code: 'METERS.METER_NOT_FOUND',
        message: 'Счётчик не найден',
      });
    }

    if (!meter.isActive) {
      throw new BadRequestException({
        code: 'METERS.METER_DEACTIVATED',
        message: 'Данный счётчик деактивирован',
      });
    }

    const hasVerifiedOwnership = meter.unit.ownerships.some(
      (o) => o.userId === user.id && o.isVerified,
    );

    if (!hasVerifiedOwnership) {
      throw new ForbiddenException({
        code: 'METERS.SUBMIT_CONFIRMED_RESIDENTS_ONLY',
        message: 'Подача показаний доступна только подтверждённым жителям данной квартиры',
      });
    }

    // Проверка: показания не могут уменьшаться
    const lastVerified = await this.prisma.meterReading.findFirst({
      where: { meterId, status: ReadingStatus.VERIFIED },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    });

    const baseline = lastVerified ? lastVerified.value : meter.initialValue;
    if (dto.value < baseline) {
      throw new BadRequestException({
        code: 'METERS.VALUE_BELOW_BASELINE',
        message: `Новое показание (${dto.value}) не может быть меньше предыдущего подтверждённого (${baseline})`,
        params: { value: dto.value, baseline },
      });
    }

    // Проверка уникальности периода: [meterId, periodMonth, periodYear]
    const existing = await this.prisma.meterReading.findUnique({
      where: {
        meterId_periodMonth_periodYear: {
          meterId,
          periodMonth: dto.month,
          periodYear: dto.year,
        },
      },
    });

    if (existing) {
      if (existing.status === ReadingStatus.REJECTED) {
        // Повторная подача ранее отклонённого показания за этот же период
        return this.prisma.meterReading.update({
          where: { id: existing.id },
          data: {
            value: dto.value,
            photoUrl: dto.photoUrl,
            status: ReadingStatus.PENDING,
            submittedById: user.id,
            reviewedById: null,
            reviewNote: null,
          },
        });
      }

      throw new BadRequestException({
        code: 'METERS.PERIOD_ALREADY_SUBMITTED',
        message: 'Показания за указанный период уже поданы и находятся на рассмотрении или подтверждены',
      });
    }

    return this.prisma.meterReading.create({
      data: {
        meterId,
        submittedById: user.id,
        value: dto.value,
        photoUrl: dto.photoUrl,
        periodMonth: dto.month,
        periodYear: dto.year,
        status: ReadingStatus.PENDING,
      },
    });
  }

  async getMeterReadings(meterId: string, user: UserContext) {
    const meter = await this.prisma.meter.findUnique({
      where: { id: meterId },
      include: {
        unit: {
          include: {
            building: true,
            ownerships: true,
          },
        },
      },
    });

    if (!meter) {
      throw new NotFoundException({
        code: 'METERS.METER_NOT_FOUND',
        message: 'Счётчик не найден',
      });
    }

    const isStaff = (
      [
        UserRole.SUPERADMIN,
        UserRole.HOA_ADMIN,
        UserRole.DISPATCHER,
        UserRole.HOA_CHAIRMAN,
      ] as UserRole[]
    ).includes(user.role);

    if (isStaff) {
      assertUserBelongsToTenant(user, meter.unit.building.tenantId);
    } else {
      const hasVerifiedOwnership = meter.unit.ownerships.some(
        (o) => o.userId === user.id && o.isVerified,
      );
      if (!hasVerifiedOwnership) {
        throw new ForbiddenException({
          code: 'METERS.FOREIGN_READINGS_FORBIDDEN',
          message: 'Доступ к показаниям чужой квартиры запрещён',
        });
      }
    }

    return this.prisma.meterReading.findMany({
      where: { meterId },
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
  }

  // -------------------------------------------------------------
  // 3. Проверка показаний сотрудниками (DISPATCHER, HOA_ADMIN, SUPERADMIN)
  // -------------------------------------------------------------

  async getTenantReadingsQueue(
    tenantId: string,
    status: ReadingStatus | undefined,
    user: UserContext,
  ) {
    assertUserBelongsToTenant(user, tenantId);

    return this.prisma.meterReading.findMany({
      where: {
        meter: {
          unit: {
            building: { tenantId },
          },
        },
        ...(status ? { status } : {}),
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
  }

  async reviewReading(
    readingId: string,
    dto: ReviewReadingDto,
    user: UserContext,
  ) {
    const reading = await this.prisma.meterReading.findUnique({
      where: { id: readingId },
      include: {
        meter: {
          include: {
            unit: {
              include: { building: true },
            },
          },
        },
      },
    });

    if (!reading) {
      throw new NotFoundException({
        code: 'METERS.READING_NOT_FOUND',
        message: 'Показание счётчика не найдено',
      });
    }

    assertUserBelongsToTenant(user, reading.meter.unit.building.tenantId);

    return this.prisma.meterReading.update({
      where: { id: readingId },
      data: {
        status: dto.status,
        reviewNote: dto.note ?? null,
        reviewedById: user.id,
      },
    });
  }
}
