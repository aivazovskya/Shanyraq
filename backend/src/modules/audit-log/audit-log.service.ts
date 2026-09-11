import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { assertUserBelongsToTenant } from '../../common/guards/tenant.guard';
import { buildCsv } from '../../common/csv/csv.helper';
import { UserRole } from '@prisma/client';

export interface LogAuditParams {
  tenantId: string;
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, any>;
}

export interface AuditLogQueryDto {
  from?: string;
  to?: string;
  action?: string;
}

export interface UserContext {
  id?: string;
  role: UserRole;
  tenantId?: string | null;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Запись события аудита в БД.
   * Выполняется по принципу "best-effort" (try/catch) - ошибка логируется, но не прерывает целевую операцию.
   */
  async log(params: LogAuditParams): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: params.tenantId,
          actorId: params.actorId || null,
          action: params.action,
          targetType: params.targetType,
          targetId: params.targetId,
          metadata: params.metadata ?? undefined,
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to write audit log: ${err?.message || err}`, err?.stack);
    }
  }

  /**
   * Получение журнала действий персонала по ЖК с фильтрацией по дате и действию.
   */
  async getAuditLogs(tenantId: string, user: UserContext, query: AuditLogQueryDto) {
    assertUserBelongsToTenant(user, tenantId, 'журнала аудита действий сотрудников');

    const toDate = query.to ? new Date(query.to) : new Date();
    // Default 30 days window if 'from' is omitted
    const fromDate = query.from
      ? new Date(query.from)
      : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const where: any = {
      tenantId,
      createdAt: {
        gte: fromDate,
        lte: toDate,
      },
    };

    if (query.action && query.action !== 'ALL') {
      where.action = query.action;
    }

    return this.prisma.auditLog.findMany({
      where,
      include: {
        actor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Экспорт журнала действий персонала в формате CSV с UTF-8 BOM.
   */
  async exportAuditLogsCsv(
    tenantId: string,
    user: UserContext,
    query: AuditLogQueryDto,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const logs = await this.getAuditLogs(tenantId, user, query);

    const headers = [
      'Дата и время',
      'Сотрудник (ФИО)',
      'Роль',
      'Действие',
      'Тип объекта',
      'ID объекта',
      'Детали / Изменения',
    ];

    const formatActionName = (action: string): string => {
      switch (action) {
        case 'TARIFF_CREATED':
          return 'Создание тарифа';
        case 'TARIFF_UPDATED':
          return 'Изменение тарифа';
        case 'RESIDENT_ACTIVATED':
          return 'Активация жильца';
        case 'RESIDENT_DEACTIVATED':
          return 'Деактивация жильца';
        case 'LISTING_MODERATED':
          return 'Модерация объявления';
        case 'OWNERSHIP_VERIFIED':
          return 'Подтверждение собственности';
        case 'OWNERSHIP_REJECTED':
          return 'Отклонение собственности';
        default:
          return action;
      }
    };

    const formatMetadataSummary = (metadata: any): string => {
      if (!metadata || typeof metadata !== 'object') return '';
      try {
        return JSON.stringify(metadata);
      } catch {
        return '';
      }
    };

    const rows: unknown[][] = [headers];

    for (const item of logs) {
      const actorName = item.actor
        ? `${item.actor.firstName} ${item.actor.lastName}`.trim()
        : 'Удаленный сотрудник';
      const actorRole = item.actor?.role || '—';

      rows.push([
        item.createdAt.toISOString(),
        actorName,
        actorRole,
        formatActionName(item.action),
        item.targetType,
        item.targetId,
        formatMetadataSummary(item.metadata),
      ]);
    }

    const buffer = buildCsv(rows);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `audit-log-${tenantId}-${dateStr}.csv`;

    return { buffer, filename };
  }
}
