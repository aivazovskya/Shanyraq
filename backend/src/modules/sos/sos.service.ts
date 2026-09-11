import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UserRole, SosAlertStatus } from '@prisma/client';
import {
  TriggerSosDto,
  ResolveSosDto,
  GetTenantAlertsQueryDto,
  GetSosStatisticsQueryDto,
} from './dto/sos.dto';
import { assertUserBelongsToTenant } from '../../common/guards/tenant.guard';
import { buildCsv } from '../../common/csv/csv.helper';

@Injectable()
export class SosService {
  private readonly logger = new Logger(SosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

  /**
   * Экстренный вызов SOS жильцом.
   * Доступен любому авторизованному жильцу без проверки верификации прав собственности.
   * Дедупликация: если у пользователя уже есть активный вызов, возвращает его и повторяет push.
   */
  async trigger(user: any, dto: TriggerSosDto) {
    if (!user || !user.id) {
      throw new ForbiddenException({
        code: 'SOS.AUTH_REQUIRED',
        message: 'Требуется авторизация',
      });
    }

    // 1. Определение юнита (best-effort): любой ownership без требования к isVerified
    const ownership = await this.prisma.unitOwnership.findFirst({
      where: { userId: user.id },
      include: {
        unit: {
          include: { building: true },
        },
      },
    });

    const unitId = ownership ? ownership.unitId : null;
    const tenantId = user.tenantId || ownership?.unit?.building?.tenantId;

    if (!tenantId) {
      throw new BadRequestException({
        code: 'SOS.TENANT_UNRESOLVED',
        message:
          'Не удалось определить жилой комплекс пользователя для вызова экстренных служб',
      });
    }

    // Полные данные пользователя для уведомления
    const userRecord = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
      },
    });

    const residentName = userRecord
      ? `${userRecord.firstName} ${userRecord.lastName}`.trim()
      : `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Житель';
    const residentPhone = userRecord?.phone || user.phone || 'Не указан';
    const unitNumber = ownership?.unit?.unitNumber ? `кв. ${ownership.unit.unitNumber}` : '';

    // 2. Проверка активного вызова (дедупликация по triggeredById)
    const existingActiveAlert = await this.prisma.sosAlert.findFirst({
      where: {
        triggeredById: user.id,
        status: SosAlertStatus.ACTIVE,
      },
      include: {
        unit: {
          include: { building: true },
        },
        triggeredBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });

    const alertToNotify = existingActiveAlert || (await this.prisma.sosAlert.create({
      data: {
        tenantId,
        unitId,
        triggeredById: user.id,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        status: SosAlertStatus.ACTIVE,
      },
      include: {
        unit: {
          include: { building: true },
        },
        triggeredBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    }));

    // 3. Отправка push-уведомления дежурным службам (SECURITY, DISPATCHER, HOA_ADMIN)
    const notificationTitle = '🚨 ЭКСТРЕННЫЙ ВЫЗОВ (SOS)';
    const locationInfo = dto.latitude && dto.longitude
      ? ` [Локация: ${dto.latitude.toFixed(5)}, ${dto.longitude.toFixed(5)}]`
      : '';
    const unitPart = unitNumber ? `, ${unitNumber}` : '';
    const notificationBody = `${residentName}${unitPart}: срочный сигнал тревоги! Тел: ${residentPhone}${locationInfo}`;

    try {
      await this.notificationsService.sendToTenantRoles(
        tenantId,
        [UserRole.SECURITY, UserRole.DISPATCHER, UserRole.HOA_ADMIN],
        {
          title: notificationTitle,
          body: notificationBody,
          data: {
            alertId: alertToNotify.id,
            latitude: dto.latitude ?? alertToNotify.latitude,
            longitude: dto.longitude ?? alertToNotify.longitude,
            unitId: alertToNotify.unitId,
            phone: residentPhone,
            type: 'SOS_ALERT',
          },
        },
      );
    } catch (err: any) {
      this.logger.error(`Ошибка отправки push-уведомления SOS: ${err?.message}`);
    }

    this.logger.warn(
      `[SOS] 🚨 Вызов SOS ${existingActiveAlert ? '(повторный push)' : 'создан'}: ${residentName} (${residentPhone}) в ЖК ${tenantId}`,
    );

    // Real-time событие для WebSocket шлюза
    try {
      this.eventEmitter?.emit('sos.alert.triggered', {
        alert: alertToNotify,
        tenantId,
      });
    } catch (e) {
      this.logger.warn(`Failed to emit sos.alert.triggered event: ${e}`);
    }

    return alertToNotify;
  }

  /**
   * Получение списка алертов для персонала ЖК.
   * Доступно: SECURITY, DISPATCHER, HOA_ADMIN, HOA_CHAIRMAN (read-only), SUPERADMIN.
   */
  async getTenantAlerts(tenantId: string, user: any, query?: GetTenantAlertsQueryDto) {
    this.assertStaffOrChairmanRole(user, tenantId);

    const where: any = { tenantId };
    if (query?.status) {
      where.status = query.status;
    }

    return this.prisma.sosAlert.findMany({
      where,
      include: {
        unit: {
          include: { building: true },
        },
        triggeredBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        resolvedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [
        { status: 'asc' }, // ACTIVE first
        { createdAt: 'desc' },
      ],
    });
  }

  /**
   * Статистика и тренды вызовов SOS (частота, разбивка по статусам, время реагирования).
   * Доступно: SECURITY, DISPATCHER, HOA_ADMIN, HOA_CHAIRMAN (read-only), SUPERADMIN.
   */
  async getSosStatistics(
    tenantId: string,
    user: any,
    query?: GetSosStatisticsQueryDto,
  ) {
    this.assertStaffOrChairmanRole(user, tenantId);

    const now = new Date();
    const toDate = query?.to ? new Date(query.to) : now;
    if (query?.to && query.to.length === 10) {
      toDate.setUTCHours(23, 59, 59, 999);
    }

    const fromDate = query?.from
      ? new Date(query.from)
      : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (query?.from && query.from.length === 10) {
      fromDate.setUTCHours(0, 0, 0, 0);
    }

    const alerts = await this.prisma.sosAlert.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const byStatus = {
      ACTIVE: 0,
      RESOLVED: 0,
      FALSE_ALARM: 0,
    };

    let totalResponseMinutes = 0;
    let resolvedCount = 0;

    for (const alert of alerts) {
      if (byStatus[alert.status] !== undefined) {
        byStatus[alert.status]++;
      }

      if (alert.resolvedAt) {
        const diffMs =
          new Date(alert.resolvedAt).getTime() - new Date(alert.createdAt).getTime();
        totalResponseMinutes += Math.max(0, diffMs / (1000 * 60));
        resolvedCount++;
      }
    }

    const averageResponseTimeMinutes =
      resolvedCount > 0
        ? Math.round((totalResponseMinutes / resolvedCount) * 10) / 10
        : 0;

    // Daily trend: every calendar day in the range (UTC)
    const dailyMap = new Map<string, number>();
    const cursor = new Date(fromDate);
    cursor.setUTCHours(0, 0, 0, 0);
    const endCursor = new Date(toDate);
    endCursor.setUTCHours(23, 59, 59, 999);

    while (cursor <= endCursor) {
      const dKey = cursor.toISOString().split('T')[0];
      dailyMap.set(dKey, 0);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    for (const alert of alerts) {
      const dKey = new Date(alert.createdAt).toISOString().split('T')[0];
      if (dailyMap.has(dKey)) {
        dailyMap.set(dKey, dailyMap.get(dKey)! + 1);
      } else {
        dailyMap.set(dKey, 1);
      }
    }

    const dailyTrend = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    return {
      totalAlerts: alerts.length,
      byStatus,
      averageResponseTimeMinutes,
      dailyTrend,
    };
  }

  /**
   * Экспорт журнала вызовов SOS в CSV (построчно, один вызов — одна строка).
   * Доступно: SECURITY, DISPATCHER, HOA_ADMIN, HOA_CHAIRMAN (read-only), SUPERADMIN.
   */
  async exportAlertsCsv(
    tenantId: string,
    user: any,
    query?: GetSosStatisticsQueryDto,
  ): Promise<{ buffer: Buffer; filename: string }> {
    this.assertStaffOrChairmanRole(user, tenantId);

    const now = new Date();
    const toDate = query?.to ? new Date(query.to) : now;
    if (query?.to && query.to.length === 10) {
      toDate.setUTCHours(23, 59, 59, 999);
    }

    const fromDate = query?.from
      ? new Date(query.from)
      : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (query?.from && query.from.length === 10) {
      fromDate.setUTCHours(0, 0, 0, 0);
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    const alerts = await this.prisma.sosAlert.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
      include: {
        unit: {
          include: { building: true },
        },
        triggeredBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        resolvedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const statusLabels: Record<string, string> = {
      ACTIVE: 'Активен',
      RESOLVED: 'Разрешен',
      FALSE_ALARM: 'Ложная тревога',
    };

    const fromDateStr = fromDate.toISOString().split('T')[0];
    const toDateStr = toDate.toISOString().split('T')[0];

    const rows: unknown[][] = [
      ['Журнал экстренных вызовов SOS'],
      ['Жилой комплекс', tenant?.name || 'Не указан'],
      ['Период', `${fromDateStr} — ${toDateStr}`],
      [],
      [
        'Дата и время',
        'Статус',
        'ФИО жильца',
        'Телефон',
        'Квартира/Помещение',
        'Блок/Подъезд',
        'Широта',
        'Долгота',
        'Время реагирования (мин)',
        'Кем разрешено',
        'Примечание разрешения',
      ],
    ];

    for (const alert of alerts) {
      const triggeredByName = [alert.triggeredBy?.firstName, alert.triggeredBy?.lastName]
        .filter(Boolean)
        .join(' ');
      const resolvedByName = alert.resolvedBy
        ? [alert.resolvedBy.firstName, alert.resolvedBy.lastName].filter(Boolean).join(' ')
        : '';
      const unitNumber = alert.unit?.unitNumber || '';
      const blockName = alert.unit?.building?.blockName || '';

      let responseMinutes: number | string = '';
      if (alert.resolvedAt) {
        const diffMs =
          new Date(alert.resolvedAt).getTime() - new Date(alert.createdAt).getTime();
        responseMinutes = Math.round((Math.max(0, diffMs) / (1000 * 60)) * 10) / 10;
      }

      rows.push([
        alert.createdAt.toISOString(),
        statusLabels[alert.status] || alert.status,
        triggeredByName,
        alert.triggeredBy?.phone || '',
        unitNumber,
        blockName,
        alert.latitude ?? '',
        alert.longitude ?? '',
        responseMinutes,
        resolvedByName,
        alert.resolutionNote || '',
      ]);
    }

    const buffer = buildCsv(rows);
    const filename = `sos-alerts-${tenantId}-${fromDateStr}_${toDateStr}.csv`;

    return { buffer, filename };
  }

  /**
   * Разрешение / закрытие тревоги персоналом.
   * Доступно: SECURITY, DISPATCHER, HOA_ADMIN, SUPERADMIN.
   * Председатель ОСИ (HOA_CHAIRMAN) исключен — только просмотр.
   */
  async resolve(alertId: string, user: any, dto: ResolveSosDto) {
    if (user.role === UserRole.HOA_CHAIRMAN) {
      throw new ForbiddenException({
        code: 'SOS.CHAIRMAN_VIEW_ONLY',
        message: 'Председатель ОСИ имеет доступ только к просмотру сигналов SOS',
      });
    }

    const alert = await this.prisma.sosAlert.findUnique({
      where: { id: alertId },
    });

    if (!alert) {
      throw new NotFoundException({
        code: 'SOS.ALERT_NOT_FOUND',
        message: 'Вызов SOS не найден',
      });
    }

    assertUserBelongsToTenant(user, alert.tenantId, {
      code: 'SOS.CROSS_TENANT_PROCESS_FORBIDDEN',
      message: 'Вы не можете обрабатывать вызовы другого ЖК',
    });

    const allowedRoles = [
      UserRole.SECURITY,
      UserRole.DISPATCHER,
      UserRole.HOA_ADMIN,
      UserRole.SUPERADMIN,
    ];

    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException({
        code: 'SOS.PROCESS_FORBIDDEN',
        message: 'Недостаточно прав для обработки сигнала SOS',
      });
    }

    if (alert.status !== SosAlertStatus.ACTIVE) {
      throw new BadRequestException({
        code: 'SOS.ALREADY_PROCESSED',
        message: 'Данный вызов SOS уже был обработан ранее',
      });
    }

    const updatedAlert = await this.prisma.sosAlert.update({
      where: { id: alertId },
      data: {
        status: dto.status,
        resolvedById: user.id,
        resolvedAt: new Date(),
        resolutionNote: dto.note?.trim() || null,
      },
      include: {
        unit: {
          include: { building: true },
        },
        triggeredBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        resolvedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Real-time событие для WebSocket шлюза
    try {
      this.eventEmitter?.emit('sos.alert.updated', {
        alert: updatedAlert,
        tenantId: alert.tenantId,
      });
    } catch (e) {
      this.logger.warn(`Failed to emit sos.alert.updated event: ${e}`);
    }

    return updatedAlert;
  }

  /**
   * История сигналов SOS текущего авторизованного жителя.
   */
  async getMyAlerts(user: any) {
    if (!user || !user.id) {
      throw new ForbiddenException({
        code: 'SOS.AUTH_REQUIRED',
        message: 'Требуется авторизация',
      });
    }

    return this.prisma.sosAlert.findMany({
      where: { triggeredById: user.id },
      include: {
        unit: {
          include: { building: true },
        },
        resolvedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // =============================================================
  // Вспомогательные проверки
  // =============================================================

  assertStaffOrChairmanRole(user: any, tenantId: string): void {
    if (!user) {
      throw new ForbiddenException({
        code: 'SOS.AUTH_REQUIRED',
        message: 'Требуется авторизация',
      });
    }

    if (user.role === UserRole.SUPERADMIN) {
      return;
    }

    const allowedRoles = [
      UserRole.SECURITY,
      UserRole.DISPATCHER,
      UserRole.HOA_ADMIN,
      UserRole.HOA_CHAIRMAN,
    ];

    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException({
        code: 'SOS.LOG_ACCESS_FORBIDDEN',
        message: 'Недостаточно прав для доступа к журналу SOS данного ЖК',
      });
    }

    if (user.tenantId !== tenantId) {
      throw new ForbiddenException({
        code: 'SOS.CROSS_TENANT_VIEW_FORBIDDEN',
        message: 'Вы не можете просматривать сигналы SOS другого ЖК',
      });
    }
  }
}
