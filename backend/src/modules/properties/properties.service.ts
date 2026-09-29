import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTenantDto, CreateUnitDto, ClaimOwnershipDto, VerifyOwnershipDto, UpdateResidentStatusDto, CreateStaffDto, UpdateStaffDto } from './dto/properties.dto';
import { UserRole } from '@prisma/client';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { getOrCreatePersonalAccount } from '../finance/personal-account.helper';
import { assertUserBelongsToTenant } from '../../common/guards/tenant.guard';
import { AuditLogService } from '../audit-log/audit-log.service';
import { buildCsv } from '../../common/csv/csv.helper';
import { decryptPii, hashIin } from '../../common/crypto/pii-crypto.helper';

@Injectable()
export class PropertiesService {
  private readonly logger = new Logger(PropertiesService.name);

  constructor(
    private prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getAllTenants() {
    return this.prisma.tenant.findMany({
      include: {
        buildings: {
          include: {
            _count: {
              select: { units: true },
            },
          },
        },
      },
    });
  }

  async searchTenants(query?: string) {
    const whereClause =
      query && query.trim().length > 0
        ? {
            OR: [
              { name: { contains: query.trim(), mode: 'insensitive' as const } },
              { address: { contains: query.trim(), mode: 'insensitive' as const } },
              { city: { contains: query.trim(), mode: 'insensitive' as const } },
            ],
          }
        : {};

    const tenants = await this.prisma.tenant.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        _count: {
          select: {
            buildings: true,
          },
        },
      },
      take: 20,
    });

    return tenants.map((t) => ({
      id: t.id,
      name: t.name,
      address: t.address,
      city: t.city,
      buildingsCount: t._count.buildings,
    }));
  }

  async getTenantStructure(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        buildings: {
          include: {
            units: {
              select: {
                id: true,
                unitNumber: true,
                floor: true,
                entrance: true,
                type: true,
                area: true,
              },
              orderBy: { unitNumber: 'asc' },
            },
          },
          orderBy: { blockName: 'asc' },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException({
        code: 'PROPERTIES.COMPLEX_NOT_FOUND',
        message: 'Жилой комплекс не найден',
      });
    }

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      address: tenant.address,
      city: tenant.city,
      buildings: tenant.buildings.map((b) => ({
        id: b.id,
        blockName: b.blockName,
        floorsCount: b.floorsCount,
        entrancesCount: b.entrancesCount,
        units: b.units,
      })),
    };
  }

  async getTenantById(id: string, user?: any) {
    if (user) {
      assertUserBelongsToTenant(user, id, 'жилого комплекса');
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        buildings: {
          include: {
            units: {
              orderBy: { unitNumber: 'asc' },
            },
          },
        },
        _count: {
          select: {
            users: true,
            serviceRequests: true,
            meetings: true,
            accessPoints: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException({
        code: 'PROPERTIES.COMPLEX_NOT_FOUND',
        message: 'Жилой комплекс не найден',
      });
    }

    return tenant;
  }

  async createTenant(dto: CreateTenantDto) {
    return this.prisma.tenant.create({
      data: {
        name: dto.name,
        address: dto.address,
        city: dto.city || 'Астана',
      },
    });
  }

  async createStaff(tenantId: string, dto: CreateStaffDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException({
        code: 'PROPERTIES.COMPLEX_NOT_FOUND',
        message: 'Жилой комплекс не найден',
      });
    }

    const allowedRoles: UserRole[] = [
      UserRole.HOA_ADMIN,
      UserRole.HOA_CHAIRMAN,
      UserRole.DISPATCHER,
      UserRole.SECURITY,
    ];

    if (!allowedRoles.includes(dto.role)) {
      throw new BadRequestException({
        code: 'PROPERTIES.INVALID_STAFF_ROLE',
        message: 'Недопустимая роль сотрудника. Допустимые роли: HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER, SECURITY',
      });
    }

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { phone: dto.phone },
          ...(dto.email ? [{ email: dto.email }] : []),
        ],
      },
    });

    if (existingUser) {
      throw new BadRequestException({
        code: 'PROPERTIES.USER_ALREADY_EXISTS',
        message: 'Пользователь с таким номером телефона или email уже зарегистрирован в системе',
      });
    }

    const tempPassword = crypto.randomBytes(8).toString('hex');
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(tempPassword, salt);

    const user = await this.prisma.user.create({
      data: {
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone.trim(),
        email: dto.email ? dto.email.trim().toLowerCase() : null,
        role: dto.role,
        tenantId: tenant.id,
        passwordHash,
        mustChangePassword: true,
        isActive: true,
      },
    });

    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      tenantId: user.tenantId,
      mustChangePassword: user.mustChangePassword,
      createdAt: user.createdAt,
      tempPassword,
    };
  }

  async getStaffMembers(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException({
        code: 'PROPERTIES.COMPLEX_NOT_FOUND',
        message: 'Жилой комплекс не найден',
      });
    }

    const allowedRoles: UserRole[] = [
      UserRole.HOA_ADMIN,
      UserRole.HOA_CHAIRMAN,
      UserRole.DISPATCHER,
      UserRole.SECURITY,
    ];

    return this.prisma.user.findMany({
      where: {
        tenantId,
        role: { in: allowedRoles },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStaff(tenantId: string, userId: string, dto: UpdateStaffDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException({
        code: 'PROPERTIES.COMPLEX_NOT_FOUND',
        message: 'Жилой комплекс не найден',
      });
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      throw new NotFoundException({
        code: 'PROPERTIES.USER_NOT_FOUND',
        message: 'Пользователь не найден',
      });
    }

    const allowedRoles: UserRole[] = [
      UserRole.HOA_ADMIN,
      UserRole.HOA_CHAIRMAN,
      UserRole.DISPATCHER,
      UserRole.SECURITY,
    ];

    if (!allowedRoles.includes(targetUser.role)) {
      throw new BadRequestException({
        code: 'PROPERTIES.STAFF_MANAGEMENT_STAFF_ONLY',
        message: 'Управление аккаунтом через данный раздел доступно только для сотрудников',
      });
    }

    if (targetUser.tenantId !== tenantId) {
      throw new ForbiddenException({
        code: 'PROPERTIES.CROSS_TENANT_USER_FORBIDDEN',
        message: 'Сотрудник не относится к указанному жилому комплексу',
      });
    }

    if (dto.email !== undefined && dto.email !== null && dto.email.trim() !== '') {
      const emailLower = dto.email.trim().toLowerCase();
      const existingUserWithEmail = await this.prisma.user.findFirst({
        where: {
          email: emailLower,
          id: { not: userId },
        },
      });

      if (existingUserWithEmail) {
        throw new BadRequestException({
          code: 'PROPERTIES.USER_ALREADY_EXISTS',
          message: 'Пользователь с таким email уже зарегистрирован в системе',
        });
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName.trim() } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName.trim() } : {}),
        ...(dto.email !== undefined ? { email: dto.email && dto.email.trim() ? dto.email.trim().toLowerCase() : null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
      },
    });

    return updated;
  }

  async addUnit(buildingId: string, user: any, dto: CreateUnitDto) {
    const building = await this.prisma.building.findUnique({ where: { id: buildingId } });
    if (!building) {
      throw new NotFoundException({
        code: 'PROPERTIES.BLOCK_NOT_FOUND',
        message: 'Блок/дом не найден',
      });
    }

    // Аудит безопасности: проверка принадлежности администратора к ЖК здания
    if (user) {
      assertUserBelongsToTenant(user, building.tenantId, 'квартир');
    }

    const unit = await this.prisma.unit.create({
      data: {
        buildingId,
        unitNumber: dto.unitNumber,
        floor: dto.floor,
        entrance: dto.entrance,
        type: dto.type,
        area: dto.area,
        cadastralNumber: dto.cadastralNumber,
      },
    });

    // Auto-create PersonalAccount for the unit
    await getOrCreatePersonalAccount(this.prisma, {
      id: unit.id,
      unitNumber: unit.unitNumber,
      building: { blockName: building.blockName },
    });

    // Update total areas of building and tenant
    await this.recalculateAreas(building.tenantId, building.id);

    return unit;
  }

  async claimOwnership(userId: string, dto: ClaimOwnershipDto) {
    const unit = await this.prisma.unit.findUnique({
      where: { id: dto.unitId },
      include: { building: true },
    });

    if (!unit) {
      throw new NotFoundException({
        code: 'PROPERTIES.UNIT_NOT_FOUND',
        message: 'Квартира/помещение не найдено',
      });
    }

    const existing = await this.prisma.unitOwnership.findUnique({
      where: {
        userId_unitId: {
          userId,
          unitId: dto.unitId,
        },
      },
    });

    if (existing) {
      throw new BadRequestException({
        code: 'PROPERTIES.OWNERSHIP_REQUEST_EXISTS',
        message: 'Заявка на привязку этого объекта уже существует',
      });
    }

    // Аудит безопасности: проверка суммы долей по квартире
    const requestedShare = dto.sharePercent !== undefined ? dto.sharePercent : 100.0;
    if (requestedShare <= 0 || requestedShare > 100.0) {
      throw new BadRequestException({
        code: 'PROPERTIES.INVALID_SHARE_RANGE',
        message: 'Доля собственности должна быть в диапазоне от 0.01% до 100%',
      });
    }

    const existingVerified = await this.prisma.unitOwnership.findMany({
      where: { unitId: dto.unitId, isVerified: true },
    });
    const currentSum = existingVerified.reduce((sum, o) => sum + o.sharePercent, 0);

    if (currentSum + requestedShare > 100.0) {
      throw new BadRequestException({
        code: 'PROPERTIES.SHARE_EXCEEDS_TOTAL',
        message:
          `Суммарная доля собственности по данной квартире не может превышать 100%. ` +
          `Уже подтверждено: ${currentSum}%, запрошено: ${requestedShare}%`,
        params: { currentSum, requestedShare },
      });
    }

    // Attach tenant to user if not yet attached
    await this.prisma.user.update({
      where: { id: userId },
      data: { tenantId: unit.building.tenantId },
    });

    return this.prisma.unitOwnership.create({
      data: {
        userId,
        unitId: dto.unitId,
        ownershipType: dto.ownershipType,
        sharePercent: requestedShare,
        verificationDoc: dto.verificationDoc,
        isVerified: false, // Requires HOA admin / dispatcher approval
      },
    });
  }

  async verifyOwnership(
    ownershipId: string,
    verifierUser: { id: string; role: UserRole; tenantId?: string | null },
    dto: VerifyOwnershipDto,
  ) {
    const record = await this.prisma.unitOwnership.findUnique({
      where: { id: ownershipId },
      include: {
        unit: {
          include: {
            building: true,
          },
        },
      },
    });

    if (!record) {
      throw new NotFoundException({
        code: 'PROPERTIES.OWNERSHIP_NOT_FOUND',
        message: 'Запись о праве собственности не найдена',
      });
    }

    // Аудит безопасности (Tenant isolation): сотрудник УК может верифицировать только свой ЖК
    if (verifierUser.role !== UserRole.SUPERADMIN) {
      if (!verifierUser.tenantId || verifierUser.tenantId !== record.unit.building.tenantId) {
        throw new ForbiddenException({
          code: 'PROPERTIES.CROSS_TENANT_VERIFY_FORBIDDEN',
          message: 'Доступ запрещен: вы не можете верифицировать права собственности в другом жилом комплексе',
        });
      }
    }

    // Валидация и корректировка доли при подтверждении
    const finalSharePercent = dto.approvedSharePercent !== undefined ? dto.approvedSharePercent : record.sharePercent;

    if (dto.isVerified) {
      // Check total shares of all OTHER verified owners for this apartment
      const otherOwners = await this.prisma.unitOwnership.findMany({
        where: {
          unitId: record.unitId,
          isVerified: true,
          id: { not: record.id },
        },
      });
      const otherSum = otherOwners.reduce((sum, o) => sum + o.sharePercent, 0);
      if (otherSum + finalSharePercent > 100.0) {
        throw new BadRequestException({
          code: 'PROPERTIES.CONFIRMED_SHARE_EXCEEDS_TOTAL',
          message:
            `Невозможно подтвердить долю: сумма долей всех собственников квартиры превысит 100% ` +
            `(уже подтверждено другим: ${otherSum}%, заявляется: ${finalSharePercent}%)`,
          params: { otherSum, finalSharePercent },
        });
      }
    }

    if (!dto.isVerified) {
      await this.prisma.$transaction(async (tx) => {
        // Проверяем, есть ли у пользователя другие заявки/права собственности в этом же ЖК
        const otherOwnership = await tx.unitOwnership.findFirst({
          where: {
            userId: record.userId,
            id: { not: ownershipId },
            unit: {
              building: {
                tenantId: record.unit.building.tenantId,
              },
            },
          },
        });

        // При отклонении заявки удаляем ее из очереди, освобождая возможность повторной подачи
        await tx.unitOwnership.delete({
          where: { id: ownershipId },
        });

        if (!otherOwnership) {
          // Если других заявок/прав в данном ЖК нет, отзываем выданный при подаче tenantId
          await tx.user.update({
            where: { id: record.userId },
            data: { tenantId: null },
          });
        }
      });

      await this.auditLogService.log({
        tenantId: record.unit.building.tenantId,
        actorId: verifierUser.id,
        action: 'OWNERSHIP_REJECTED',
        targetType: 'UnitOwnership',
        targetId: ownershipId,
        metadata: {
          residentId: record.userId,
          unitId: record.unitId,
          requestedShare: record.sharePercent,
        },
      });

      return { id: ownershipId, isVerified: false, status: 'REJECTED' };
    }

    const updated = await this.prisma.unitOwnership.update({
      where: { id: ownershipId },
      data: {
        isVerified: true,
        sharePercent: finalSharePercent,
        verifiedAt: new Date(),
      },
    });

    await this.prisma.user.update({
      where: { id: record.userId },
      data: { isVerified: true },
    });

    await this.auditLogService.log({
      tenantId: record.unit.building.tenantId,
      actorId: verifierUser.id,
      action: 'OWNERSHIP_VERIFIED',
      targetType: 'UnitOwnership',
      targetId: ownershipId,
      metadata: {
        residentId: record.userId,
        unitId: record.unitId,
        sharePercent: finalSharePercent,
      },
    });

    return updated;
  }

  async getPendingVerifications(tenantId: string) {
    return this.prisma.unitOwnership.findMany({
      where: {
        isVerified: false,
        unit: {
          building: {
            tenantId,
          },
        },
      },
      include: {
        user: true,
        unit: {
          include: {
            building: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getConfirmedResidents(tenantId: string, search?: string) {
    const whereClause: any = {
      ownerships: {
        some: {
          isVerified: true,
          unit: {
            building: {
              tenantId,
            },
          },
        },
      },
    };

    if (search && search.trim().length > 0) {
      const term = search.trim();
      const orConditions: any[] = [
        { firstName: { contains: term, mode: 'insensitive' as const } },
        { lastName: { contains: term, mode: 'insensitive' as const } },
        { phone: { contains: term, mode: 'insensitive' as const } },
        {
          ownerships: {
            some: {
              isVerified: true,
              unit: {
                unitNumber: { contains: term, mode: 'insensitive' as const },
                building: { tenantId },
              },
            },
          },
        },
      ];

      // Поиск по ИИН выполняется строго по HMAC-SHA256 хешу (Decision #3)
      if (/^\d{12}$/.test(term)) {
        orConditions.push({ iinHash: hashIin(term) });
      }

      whereClause.AND = [{ OR: orConditions }];
    }

    const residents = await this.prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        phone: true,
        email: true,
        firstName: true,
        lastName: true,
        iin: true,
        role: true,
        isActive: true,
        isVerified: true,
        createdAt: true,
        ownerships: {
          where: {
            isVerified: true,
            unit: {
              building: {
                tenantId,
              },
            },
          },
          select: {
            id: true,
            ownershipType: true,
            sharePercent: true,
            isVerified: true,
            verificationDoc: true,
            verifiedAt: true,
            createdAt: true,
            unit: {
              select: {
                id: true,
                unitNumber: true,
                floor: true,
                entrance: true,
                type: true,
                area: true,
                cadastralNumber: true,
                building: {
                  select: {
                    id: true,
                    blockName: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    return residents.map((resident) => {
      let iin = resident.iin;
      if (resident.iin) {
        try {
          iin = decryptPii(resident.iin);
        } catch (err) {
          this.logger.error(
            `Failed to decrypt resident IIN (residentId: ${resident.id}): ${err instanceof Error ? err.message : String(err)}`,
          );
          iin = '—';
        }
      }
      return {
        ...resident,
        iin,
      };
    });
  }

  async exportConfirmedResidentsCsv(
    tenantId: string,
    search?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const residents = await this.getConfirmedResidents(tenantId, search);

    const headers = [
      'ФИО',
      'Телефон',
      'Email',
      'ИИН',
      'Тип владения',
      'Блок',
      'Квартира/Помещение',
      'Площадь (кв.м)',
      'Доля (%)',
      'Дата верификации',
      'Статус аккаунта',
    ];

    const rows: unknown[][] = [headers];

    for (const resident of residents) {
      const fullName = `${resident.lastName || ''} ${resident.firstName || ''}`.trim() || '—';
      const phone = resident.phone || '—';
      const email = resident.email || '—';
      let iin = '—';
      if (resident.iin) {
        try {
          iin = decryptPii(resident.iin) || '—';
        } catch (err) {
          this.logger.error(
            `Failed to decrypt resident IIN for CSV export (residentId: ${resident.id}): ${err instanceof Error ? err.message : String(err)}`,
          );
          iin = '—';
        }
      }
      const accountStatus = resident.isActive ? 'Активен' : 'Деактивирован';

      for (const ownership of resident.ownerships) {
        const ownershipType =
          ownership.ownershipType === 'OWNER'
            ? 'Собственник'
            : ownership.ownershipType === 'TENANT'
              ? 'Арендатор'
              : ownership.ownershipType;
        const block = ownership.unit?.building?.blockName || '—';
        const unitNumber = ownership.unit?.unitNumber || '—';
        const area =
          ownership.unit?.area !== undefined && ownership.unit?.area !== null
            ? ownership.unit.area
            : '—';
        const sharePercent =
          ownership.sharePercent !== undefined && ownership.sharePercent !== null
            ? ownership.sharePercent
            : 100;
        const verifiedAt = ownership.verifiedAt
          ? new Date(ownership.verifiedAt).toISOString().split('T')[0]
          : '—';

        rows.push([
          fullName,
          phone,
          email,
          iin,
          ownershipType,
          block,
          unitNumber,
          area,
          sharePercent,
          verifiedAt,
          accountStatus,
        ]);
      }
    }

    const buffer = buildCsv(rows);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `residents-registry-${tenantId}-${dateStr}.csv`;

    return { buffer, filename };
  }

  async getResidentDetail(tenantId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        email: true,
        firstName: true,
        lastName: true,
        iin: true,
        role: true,
        tenantId: true,
        isActive: true,
        isVerified: true,
        createdAt: true,
        ownerships: {
          where: {
            unit: {
              building: {
                tenantId,
              },
            },
          },
          select: {
            id: true,
            ownershipType: true,
            sharePercent: true,
            isVerified: true,
            verificationDoc: true,
            verifiedAt: true,
            createdAt: true,
            unit: {
              select: {
                id: true,
                unitNumber: true,
                floor: true,
                entrance: true,
                type: true,
                area: true,
                cadastralNumber: true,
                building: {
                  select: {
                    id: true,
                    blockName: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'PROPERTIES.RESIDENT_NOT_FOUND',
        message: 'Жилец не найден',
      });
    }

    const hasVerifiedInTenant = user.ownerships.some((o) => o.isVerified);
    if (!hasVerifiedInTenant) {
      throw new NotFoundException({
        code: 'PROPERTIES.RESIDENT_NOT_IN_COMPLEX',
        message: 'Жилец не найден в данном жилом комплексе',
      });
    }

    let iin = user.iin;
    if (user.iin) {
      try {
        iin = decryptPii(user.iin);
      } catch (err) {
        this.logger.error(
          `Failed to decrypt resident IIN in getResidentDetail (userId: ${user.id}): ${err instanceof Error ? err.message : String(err)}`,
        );
        iin = '—';
      }
    }

    return {
      ...user,
      iin,
    };
  }

  async updateResidentStatus(userId: string, staffUser: any, dto: UpdateResidentStatusDto) {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        ownerships: {
          include: {
            unit: {
              include: {
                building: true,
              },
            },
          },
        },
      },
    });

    if (!targetUser) {
      throw new NotFoundException({
        code: 'PROPERTIES.USER_NOT_FOUND',
        message: 'Пользователь не найден',
      });
    }

    if (
      targetUser.role !== UserRole.RESIDENT_OWNER &&
      targetUser.role !== UserRole.RESIDENT_TENANT
    ) {
      throw new BadRequestException({
        code: 'PROPERTIES.STATUS_MANAGEMENT_RESIDENTS_ONLY',
        message: 'Управление статусом через данный раздел доступно только для учетных записей жильцов',
      });
    }

    if (staffUser.role !== UserRole.SUPERADMIN) {
      const belongsToStaffTenant =
        (targetUser.tenantId && targetUser.tenantId === staffUser.tenantId) ||
        targetUser.ownerships.some(
          (o) => o.unit.building.tenantId === staffUser.tenantId,
        );

      if (!belongsToStaffTenant) {
        throw new ForbiddenException({
          code: 'PROPERTIES.CROSS_TENANT_USER_FORBIDDEN',
          message: 'Доступ запрещен: пользователь не относится к вашему жилому комплексу',
        });
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: dto.isActive,
      },
      select: {
        id: true,
        phone: true,
        firstName: true,
        lastName: true,
        isActive: true,
      },
    });

    const tenantIdForLog =
      targetUser.tenantId ||
      targetUser.ownerships[0]?.unit?.building?.tenantId ||
      staffUser.tenantId;

    const residentName = `${updated.firstName || targetUser.firstName || ''} ${updated.lastName || targetUser.lastName || ''}`.trim() || 'Жилец';

    if (tenantIdForLog) {
      await this.auditLogService.log({
        tenantId: tenantIdForLog,
        actorId: staffUser?.id,
        action: dto.isActive ? 'RESIDENT_ACTIVATED' : 'RESIDENT_DEACTIVATED',
        targetType: 'User',
        targetId: userId,
        metadata: {
          residentName,
          previousStatus: targetUser.isActive,
        },
      });
    }

    return {
      id: updated.id,
      isActive: updated.isActive,
      message: updated.isActive
        ? 'Учетная запись жильца успешно активирована'
        : 'Учетная запись жильца успешно деактивирована',
    };
  }

  async unlinkOwnership(ownershipId: string, staffUser: any) {
    const ownership = await this.prisma.unitOwnership.findUnique({
      where: { id: ownershipId },
      include: {
        unit: {
          include: {
            building: true,
          },
        },
      },
    });

    if (!ownership) {
      throw new NotFoundException({
        code: 'PROPERTIES.OWNERSHIP_LINK_NOT_FOUND',
        message: 'Право владения не найдено',
      });
    }

    if (!ownership.isVerified) {
      throw new BadRequestException({
        code: 'PROPERTIES.ONLY_CONFIRMED_UNLINK',
        message:
          'Отвязать можно только подтвержденное право владения. Неподтвержденные заявки обрабатываются через отклонение в очереди верификации',
      });
    }

    if (staffUser.role !== UserRole.SUPERADMIN) {
      if (!staffUser.tenantId || staffUser.tenantId !== ownership.unit.building.tenantId) {
        throw new ForbiddenException({
          code: 'PROPERTIES.CROSS_TENANT_MANAGE_FORBIDDEN',
          message: 'Доступ запрещен: вы не можете управлять помещениями в другом жилом комплексе',
        });
      }
    }

    await this.prisma.unitOwnership.delete({
      where: { id: ownershipId },
    });

    const remainingVerified = await this.prisma.unitOwnership.count({
      where: {
        userId: ownership.userId,
        isVerified: true,
      },
    });

    if (remainingVerified === 0) {
      await this.prisma.user.update({
        where: { id: ownership.userId },
        data: { isVerified: false },
      });
    }

    await this.auditLogService.log({
      tenantId: ownership.unit.building.tenantId,
      actorId: staffUser.id,
      action: 'OWNERSHIP_UNLINKED',
      targetType: 'UnitOwnership',
      targetId: ownershipId,
      metadata: {
        residentId: ownership.userId,
        unitId: ownership.unitId,
        unitNumber: ownership.unit.unitNumber,
      },
    });

    return {
      success: true,
      message: 'Квартира успешно отвязана от жильца',
    };
  }

  private async recalculateAreas(tenantId: string, buildingId: string) {
    const buildingUnits = await this.prisma.unit.findMany({ where: { buildingId } });
    const bArea = buildingUnits.reduce((acc, u) => acc + u.area, 0);
    await this.prisma.building.update({
      where: { id: buildingId },
      data: { totalArea: bArea },
    });

    const allTenantUnits = await this.prisma.unit.findMany({
      where: { building: { tenantId } },
    });
    const tArea = allTenantUnits.reduce((acc, u) => acc + u.area, 0);
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        totalArea: tArea,
        totalUnitsCount: allTenantUnits.length,
      },
    });
  }
}
