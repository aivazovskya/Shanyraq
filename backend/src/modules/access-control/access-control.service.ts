import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OpenBarrierDto, CreateGuestPassDto } from './dto/access-control.dto';
import { AccessPointType, UserRole } from '@prisma/client';

export interface IBarrierAdapter {
  triggerOpen(endpointUrl: string, controllerType: string): Promise<{ success: boolean; latencyMs: number }>;
}

@Injectable()
export class MockBarrierAdapter implements IBarrierAdapter {
  async triggerOpen(endpointUrl: string, controllerType: string): Promise<{ success: boolean; latencyMs: number }> {
    console.log(`[HARDWARE-RELAY] 🚧 Подача сигнала на реле шлагбаума: ${endpointUrl} (Протокол: ${controllerType})`);
    return { success: true, latencyMs: 180 };
  }
}

@Injectable()
export class AccessControlService {
  private barrierAdapter: IBarrierAdapter = new MockBarrierAdapter();

  constructor(private prisma: PrismaService) {}

  async getAccessPoints(tenantId: string) {
    return this.prisma.accessPoint.findMany({
      where: { tenantId, isActive: true },
      orderBy: { type: 'asc' },
    });
  }

  async openBarrier(userId: string, userRole: UserRole, dto: OpenBarrierDto) {
    const accessPoint = await this.prisma.accessPoint.findUnique({
      where: { id: dto.accessPointId },
    });

    if (!accessPoint) {
      throw new NotFoundException('Точка доступа не найдена');
    }

    if (accessPoint.type !== AccessPointType.BARRIER && accessPoint.type !== AccessPointType.GATE) {
      throw new ForbiddenException('Указанная точка доступа не является шлагбаумом или воротами');
    }

    const isStaff = ([UserRole.SUPERADMIN, UserRole.HOA_ADMIN, UserRole.SECURITY, UserRole.DISPATCHER] as UserRole[]).includes(userRole);

    let verifiedUnitId: string | null = null;

    if (!isStaff) {
      // Find actual verified apartment of user in this residential complex
      const verifiedOwnership = await this.prisma.unitOwnership.findFirst({
        where: {
          userId,
          isVerified: true,
          unit: {
            building: {
              tenantId: accessPoint.tenantId,
            },
          },
        },
      });

      if (!verifiedOwnership) {
        // Record denied access attempt in audit log
        await this.prisma.accessLog.create({
          data: {
            accessPointId: accessPoint.id,
            userId,
            action: 'OPEN_BARRIER',
            status: 'DENIED',
            note: 'Попытка открытия без подтвержденного права доступа к ЖК',
          },
        });
        throw new ForbiddenException('У вас нет активного права доступа к шлагбауму данного жилого комплекса');
      }

      // Аудит безопасности: берем проверенный unitId из базы, исключая подмену через клиентский DTO
      verifiedUnitId = verifiedOwnership.unitId;
    } else {
      // For staff, optionally associate with unit if provided and valid
      verifiedUnitId = dto.unitId || null;
    }

    // Trigger hardware controller via adapter
    await this.barrierAdapter.triggerOpen(
      accessPoint.endpointUrl || 'local://relay',
      accessPoint.controllerType,
    );

    // Record success in immutable audit log
    const log = await this.prisma.accessLog.create({
      data: {
        accessPointId: accessPoint.id,
        userId,
        unitId: verifiedUnitId,
        action: 'OPEN_BARRIER',
        status: 'SUCCESS',
        note: `Открыто через мобильное приложение пользователем ${userId}`,
      },
    });

    return {
      success: true,
      message: `Шлагбаум «${accessPoint.name}» открыт`,
      openedAt: log.createdAt,
    };
  }

  async createGuestPass(user: { id: string; role: UserRole; tenantId?: string | null }, dto: CreateGuestPassDto) {
    // Аудит безопасности: IDOR защита — житель может выписывать пропуск только для СВОЕЙ квартиры
    if (user.role !== UserRole.SUPERADMIN) {
      const ownership = await this.prisma.unitOwnership.findFirst({
        where: {
          userId: user.id,
          unitId: dto.unitId,
          isVerified: true,
        },
      });

      if (!ownership) {
        throw new ForbiddenException(
          'IDOR защита: вы можете оформлять гостевой пропуск только для своей подтвержденной квартиры',
        );
      }
    }

    // Generate 6-digit random code
    const accessCode = Math.floor(100000 + Math.random() * 900000).toString();

    return this.prisma.guestPass.create({
      data: {
        unitId: dto.unitId,
        creatorId: user.id,
        guestName: dto.guestName,
        guestPlateNumber: dto.guestPlateNumber,
        accessCode,
        qrCodeUrl: `https://api.shanyraq.kz/qr/pass-${accessCode}`,
        validFrom: new Date(dto.validFrom),
        validTo: new Date(dto.validTo),
      },
    });
  }

  async getAccessLogs(tenantId: string) {
    return this.prisma.accessLog.findMany({
      where: {
        accessPoint: { tenantId },
      },
      include: {
        accessPoint: true,
        user: {
          select: { firstName: true, lastName: true, phone: true },
        },
        unit: {
          include: { building: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
