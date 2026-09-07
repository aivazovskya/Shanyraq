import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OpenBarrierDto, CreateGuestPassDto } from './dto/access-control.dto';
import { AccessPointType, UserRole } from '@prisma/client';

@Injectable()
export class AccessControlService {
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

    // Check user rights (either staff/security or verified resident)
    const isStaff = ([UserRole.SUPERADMIN, UserRole.HOA_ADMIN, UserRole.SECURITY, UserRole.DISPATCHER] as UserRole[]).includes(userRole);

    if (!isStaff) {
      const hasAccess = await this.prisma.unitOwnership.findFirst({
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

      if (!hasAccess) {
        // Record denied access in audit log
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
    }

    // Trigger hardware controller (Pal-ES / Relay / MQTT)
    console.log(`[ACCESS-IOT] 🚧 Отправлен импульс на открытие шлагбаума "${accessPoint.name}" (${accessPoint.controllerType})`);

    // Record success in immutable audit log
    const log = await this.prisma.accessLog.create({
      data: {
        accessPointId: accessPoint.id,
        userId,
        unitId: dto.unitId,
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

  async createGuestPass(userId: string, dto: CreateGuestPassDto) {
    // Generate 6-digit random code
    const accessCode = Math.floor(100000 + Math.random() * 900000).toString();

    return this.prisma.guestPass.create({
      data: {
        unitId: dto.unitId,
        creatorId: userId,
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
