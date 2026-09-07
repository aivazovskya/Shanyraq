import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
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

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async getAccessPoints(tenantId: string, userRole: UserRole) {
    const points = await this.prisma.accessPoint.findMany({
      where: { tenantId, isActive: true },
      orderBy: { type: 'asc' },
    });

    const isPrivilegedStaff = ([UserRole.SUPERADMIN, UserRole.HOA_ADMIN] as UserRole[]).includes(userRole);

    // Аудит безопасности: скрываем сырые RTSP-креды и адреса внутренних контроллеров от обычных жителей
    if (!isPrivilegedStaff) {
      return points.map((p) => ({
        id: p.id,
        tenantId: p.tenantId,
        name: p.name,
        type: p.type,
        controllerType: p.controllerType,
        streamName: p.streamName,
        isActive: p.isActive,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }));
    }

    return points;
  }

  async getCameraStream(userId: string, userRole: UserRole, accessPointId: string) {
    const accessPoint = await this.prisma.accessPoint.findUnique({
      where: { id: accessPointId },
    });

    if (!accessPoint || !accessPoint.isActive) {
      throw new NotFoundException('Камера не найдена или отключена');
    }

    if (accessPoint.type !== AccessPointType.CAMERA) {
      throw new BadRequestException('Указанная точка доступа не является видеокамерой');
    }

    const isStaff = ([
      UserRole.SUPERADMIN,
      UserRole.HOA_ADMIN,
      UserRole.HOA_CHAIRMAN,
      UserRole.SECURITY,
      UserRole.DISPATCHER,
    ] as UserRole[]).includes(userRole);

    if (!isStaff) {
      // Validate resident has verified apartment in this tenant
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
        throw new ForbiddenException('У вас нет подтвержденного доступа к видеокамерам данного жилого комплекса');
      }
    }

    const streamName = accessPoint.streamName || accessPoint.id;
    const go2rtcBaseUrl = this.configService.get<string>('GO2RTC_API_URL', 'http://localhost:1984');
    const wsBaseUrl = go2rtcBaseUrl.replace(/^http/, 'ws');

    return {
      accessPointId: accessPoint.id,
      name: accessPoint.name,
      streamName,
      // Безопасные endpoints go2rtc: сырой RTSP с логином и паролем камеры на клиента не отдается
      endpoints: {
        webrtcWs: `${wsBaseUrl}/api/ws?src=${streamName}`,
        hls: `${go2rtcBaseUrl}/api/stream.m3u8?src=${streamName}`,
        mp4: `${go2rtcBaseUrl}/api/frame.mp4?src=${streamName}`,
        webPlayer: `${go2rtcBaseUrl}/stream.html?src=${streamName}`,
      },
    };
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

      verifiedUnitId = verifiedOwnership.unitId;
    } else {
      verifiedUnitId = dto.unitId || null;
    }

    await this.barrierAdapter.triggerOpen(
      accessPoint.endpointUrl || 'local://relay',
      accessPoint.controllerType,
    );

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
