import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTenantDto, CreateUnitDto, ClaimOwnershipDto, VerifyOwnershipDto } from './dto/properties.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class PropertiesService {
  constructor(private prisma: PrismaService) {}

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
      throw new NotFoundException('Жилой комплекс не найден');
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

  async getTenantById(id: string) {
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
      throw new NotFoundException('Жилой комплекс не найден');
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

  async addUnit(buildingId: string, dto: CreateUnitDto) {
    const building = await this.prisma.building.findUnique({ where: { id: buildingId } });
    if (!building) {
      throw new NotFoundException('Блок/дом не найден');
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
      throw new NotFoundException('Квартира/помещение не найдено');
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
      throw new BadRequestException('Заявка на привязку этого объекта уже существует');
    }

    // Аудит безопасности: проверка суммы долей по квартире
    const requestedShare = dto.sharePercent !== undefined ? dto.sharePercent : 100.0;
    if (requestedShare <= 0 || requestedShare > 100.0) {
      throw new BadRequestException('Доля собственности должна быть в диапазоне от 0.01% до 100%');
    }

    const existingVerified = await this.prisma.unitOwnership.findMany({
      where: { unitId: dto.unitId, isVerified: true },
    });
    const currentSum = existingVerified.reduce((sum, o) => sum + o.sharePercent, 0);

    if (currentSum + requestedShare > 100.0) {
      throw new BadRequestException(
        `Суммарная доля собственности по данной квартире не может превышать 100%. ` +
        `Уже подтверждено: ${currentSum}%, запрошено: ${requestedShare}%`,
      );
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
      throw new NotFoundException('Запись о праве собственности не найдена');
    }

    // Аудит безопасности (Tenant isolation): сотрудник УК может верифицировать только свой ЖК
    if (verifierUser.role !== UserRole.SUPERADMIN) {
      if (!verifierUser.tenantId || verifierUser.tenantId !== record.unit.building.tenantId) {
        throw new ForbiddenException(
          'Доступ запрещен: вы не можете верифицировать права собственности в другом жилом комплексе',
        );
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
        throw new BadRequestException(
          `Невозможно подтвердить долю: сумма долей всех собственников квартиры превысит 100% ` +
          `(уже подтверждено другим: ${otherSum}%, заявляется: ${finalSharePercent}%)`,
        );
      }
    }

    if (!dto.isVerified) {
      // При отклонении заявки удаляем ее из очереди, освобождая возможность повторной подачи
      await this.prisma.unitOwnership.delete({
        where: { id: ownershipId },
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
