import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTenantDto, CreateUnitDto, ClaimOwnershipDto } from './dto/properties.dto';

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
        sharePercent: dto.sharePercent || 100.0,
        verificationDoc: dto.verificationDoc,
        isVerified: false, // Requires HOA admin / dispatcher approval
      },
    });
  }

  async verifyOwnership(ownershipId: string, isVerified: boolean) {
    const record = await this.prisma.unitOwnership.findUnique({ where: { id: ownershipId } });
    if (!record) {
      throw new NotFoundException('Запись о праве собственности не найдена');
    }

    const updated = await this.prisma.unitOwnership.update({
      where: { id: ownershipId },
      data: {
        isVerified,
        verifiedAt: isVerified ? new Date() : null,
      },
    });

    if (isVerified) {
      await this.prisma.user.update({
        where: { id: record.userId },
        data: { isVerified: true },
      });
    }

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
