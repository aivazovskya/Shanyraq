import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, RequestStatus } from '@prisma/client';
import { assertUserBelongsToTenant } from '../../common/guards/tenant.guard';
import {
  FinanceAnalyticsQueryDto,
  DateRangeAnalyticsQueryDto,
  FinanceAnalyticsResponse,
  RequestsAnalyticsResponse,
  ActivityAnalyticsResponse,
  TariffBreakdownItem,
  TopDebtorItem,
  RequestStatusCount,
  RequestCategoryCount,
  PlatformOverviewResponse,
  PlatformTenantSummary,
} from './dto/analytics.dto';
import { buildCsv } from '../../common/csv/csv.helper';

interface RequestUser {
  id: string;
  role: UserRole;
  tenantId?: string | null;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertStaffAccess(user: RequestUser, tenantId: string) {
    if (
      user.role !== UserRole.SUPERADMIN &&
      user.role !== UserRole.HOA_ADMIN &&
      user.role !== UserRole.HOA_CHAIRMAN
    ) {
      throw new ForbiddenException({
        code: 'ANALYTICS.ACCESS_FORBIDDEN',
        message:
          'Доступ к аналитике разрешен только для администраторов и председателя ОСИ',
      });
    }

    assertUserBelongsToTenant(user, tenantId, 'аналитики');

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException({
        code: 'ANALYTICS.COMPLEX_NOT_FOUND',
        message: 'Жилой комплекс не найден',
      });
    }
  }

  // -------------------------------------------------------------
  // 1. Финансовая аналитика (Finance)
  // -------------------------------------------------------------
  async getFinanceAnalytics(
    tenantId: string,
    user: RequestUser,
    query?: FinanceAnalyticsQueryDto,
  ): Promise<FinanceAnalyticsResponse> {
    await this.assertStaffAccess(user, tenantId);

    const now = new Date();
    const periodMonth = query?.month
      ? parseInt(String(query.month), 10)
      : now.getMonth() + 1;
    const periodYear = query?.year
      ? parseInt(String(query.year), 10)
      : now.getFullYear();

    // 1. Начислено за выбранный период (месяц/год)
    const chargesAgg = await this.prisma.charge.aggregate({
      where: {
        periodMonth,
        periodYear,
        account: {
          unit: {
            building: {
              tenantId,
            },
          },
        },
      },
      _sum: { amount: true },
    });
    const totalCharged = chargesAgg._sum.amount
      ? Math.round(chargesAgg._sum.amount * 100) / 100
      : 0;

    // 2. Оплачено в этом месяце (по дате paidAt)
    const startOfMonth = new Date(Date.UTC(periodYear, periodMonth - 1, 1, 0, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(periodYear, periodMonth, 1, 0, 0, 0, 0));

    const paymentsAgg = await this.prisma.payment.aggregate({
      where: {
        account: {
          unit: {
            building: {
              tenantId,
            },
          },
        },
        paidAt: {
          gte: startOfMonth,
          lt: endOfMonth,
        },
      },
      _sum: { amount: true },
    });
    const totalCollected = paymentsAgg._sum.amount
      ? Math.round(paymentsAgg._sum.amount * 100) / 100
      : 0;

    const collectionRatePercent =
      totalCharged > 0
        ? Math.round((totalCollected / totalCharged) * 1000) / 10
        : 0;

    // 3. Структура начислений по тарифам (byTariff)
    const groupedCharges = await this.prisma.charge.groupBy({
      by: ['tariffItemId'],
      where: {
        periodMonth,
        periodYear,
        account: {
          unit: {
            building: {
              tenantId,
            },
          },
        },
      },
      _sum: { amount: true },
    });

    const tariffIds = groupedCharges.map((g) => g.tariffItemId);
    const tariffs =
      tariffIds.length > 0
        ? await this.prisma.tariffItem.findMany({
            where: { id: { in: tariffIds } },
            select: { id: true, name: true },
          })
        : [];
    const tariffNameMap = new Map(tariffs.map((t) => [t.id, t.name]));

    const byTariff: TariffBreakdownItem[] = groupedCharges.map((g) => ({
      tariffId: g.tariffItemId,
      tariffName: tariffNameMap.get(g.tariffItemId) || 'Услуга',
      amount: g._sum.amount ? Math.round(g._sum.amount * 100) / 100 : 0,
    }));

    // 4. Топ должников (topDebtors - отрицательный баланс, топ-10)
    const debtorAccounts = await this.prisma.personalAccount.findMany({
      where: {
        unit: {
          building: {
            tenantId,
          },
        },
        balance: { lt: 0 },
      },
      orderBy: { balance: 'asc' },
      take: 10,
      include: {
        unit: {
          include: {
            building: true,
          },
        },
      },
    });

    const topDebtors: TopDebtorItem[] = debtorAccounts.map((acc) => ({
      accountId: acc.id,
      accountNumber: acc.accountNumber,
      unitId: acc.unitId,
      unitNumber: acc.unit.unitNumber,
      buildingBlock: acc.unit.building.blockName,
      balance: Math.round(acc.balance * 100) / 100,
    }));

    return {
      periodMonth,
      periodYear,
      totalCharged,
      totalCollected,
      collectionRatePercent,
      byTariff,
      topDebtors,
    };
  }

  /**
   * Экспорт финансовой аналитики в формате CSV (сводка, тарифы, полный список должников).
   * Выгружает всех должников (отрицательный баланс) без ограничения take: 10.
   */
  async exportFinanceAnalyticsCsv(
    tenantId: string,
    user: RequestUser,
    query?: FinanceAnalyticsQueryDto,
  ): Promise<{ buffer: Buffer; filename: string }> {
    await this.assertStaffAccess(user, tenantId);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    const now = new Date();
    const periodMonth = query?.month
      ? parseInt(String(query.month), 10)
      : now.getMonth() + 1;
    const periodYear = query?.year
      ? parseInt(String(query.year), 10)
      : now.getFullYear();

    // 1. Начислено за выбранный период (месяц/год)
    const chargesAgg = await this.prisma.charge.aggregate({
      where: {
        periodMonth,
        periodYear,
        account: {
          unit: {
            building: {
              tenantId,
            },
          },
        },
      },
      _sum: { amount: true },
    });
    const totalCharged = chargesAgg._sum.amount
      ? Math.round(chargesAgg._sum.amount * 100) / 100
      : 0;

    // 2. Оплачено в этом месяце (по дате paidAt)
    const startOfMonth = new Date(Date.UTC(periodYear, periodMonth - 1, 1, 0, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(periodYear, periodMonth, 1, 0, 0, 0, 0));

    const paymentsAgg = await this.prisma.payment.aggregate({
      where: {
        account: {
          unit: {
            building: {
              tenantId,
            },
          },
        },
        paidAt: {
          gte: startOfMonth,
          lt: endOfMonth,
        },
      },
      _sum: { amount: true },
    });
    const totalCollected = paymentsAgg._sum.amount
      ? Math.round(paymentsAgg._sum.amount * 100) / 100
      : 0;

    const collectionRatePercent =
      totalCharged > 0
        ? Math.round((totalCollected / totalCharged) * 1000) / 10
        : 0;

    // 3. Структура начислений по тарифам (byTariff)
    const groupedCharges = await this.prisma.charge.groupBy({
      by: ['tariffItemId'],
      where: {
        periodMonth,
        periodYear,
        account: {
          unit: {
            building: {
              tenantId,
            },
          },
        },
      },
      _sum: { amount: true },
    });

    const tariffIds = groupedCharges.map((g) => g.tariffItemId);
    const tariffs =
      tariffIds.length > 0
        ? await this.prisma.tariffItem.findMany({
            where: { id: { in: tariffIds } },
            select: { id: true, name: true },
          })
        : [];
    const tariffNameMap = new Map(tariffs.map((t) => [t.id, t.name]));

    const byTariff: TariffBreakdownItem[] = groupedCharges.map((g) => ({
      tariffId: g.tariffItemId,
      tariffName: tariffNameMap.get(g.tariffItemId) || 'Услуга',
      amount: g._sum.amount ? Math.round(g._sum.amount * 100) / 100 : 0,
    }));

    // 4. Все должники ЖК (без ограничения take: 10)
    const debtorAccounts = await this.prisma.personalAccount.findMany({
      where: {
        unit: {
          building: {
            tenantId,
          },
        },
        balance: { lt: 0 },
      },
      orderBy: { balance: 'asc' },
      include: {
        unit: {
          include: {
            building: true,
          },
        },
      },
    });

    // 5. Формирование строк CSV
    const rows: unknown[][] = [
      ['Финансовая аналитика ЖК'],
      ['Жилой комплекс', tenant?.name || 'Не указан'],
      ['Период', `${String(periodMonth).padStart(2, '0')}.${periodYear}`],
      ['Начислено всего (₸)', totalCharged],
      ['Оплачено всего (₸)', totalCollected],
      ['Собираемость', `${collectionRatePercent}%`],
      [],
      ['Начисления по тарифам'],
      ['Тариф', 'Сумма (₸)'],
    ];

    for (const item of byTariff) {
      rows.push([item.tariffName, item.amount]);
    }

    rows.push([]);
    rows.push(['Должники']);
    rows.push(['Лицевой счет', 'Квартира/Помещение', 'Блок/Подъезд', 'Баланс (₸)']);

    for (const acc of debtorAccounts) {
      rows.push([
        acc.accountNumber,
        acc.unit?.unitNumber ?? '',
        acc.unit?.building?.blockName ?? '',
        Math.round(acc.balance * 100) / 100,
      ]);
    }

    const buffer = buildCsv(rows);
    const filename = `finance-analytics-${tenantId}-${periodYear}-${String(periodMonth).padStart(2, '0')}.csv`;

    return { buffer, filename };
  }

  // -------------------------------------------------------------
  // 2. Аналитика заявок (Requests)
  // -------------------------------------------------------------
  async getRequestsAnalytics(
    tenantId: string,
    user: RequestUser,
    query?: DateRangeAnalyticsQueryDto,
  ): Promise<RequestsAnalyticsResponse> {
    await this.assertStaffAccess(user, tenantId);

    const now = new Date();
    const to = query?.to ? new Date(query.to) : now;
    const from = query?.from
      ? new Date(query.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 1. По статусам
    const byStatusGroup = await this.prisma.serviceRequest.groupBy({
      by: ['status'],
      where: {
        tenantId,
        createdAt: { gte: from, lte: to },
      },
      _count: { id: true },
    });
    const byStatus: RequestStatusCount[] = byStatusGroup.map((g) => ({
      status: g.status,
      count: g._count.id,
    }));

    // 2. По категориям
    const byCategoryGroup = await this.prisma.serviceRequest.groupBy({
      by: ['category'],
      where: {
        tenantId,
        createdAt: { gte: from, lte: to },
      },
      _count: { id: true },
    });
    const byCategory: RequestCategoryCount[] = byCategoryGroup.map((g) => ({
      category: g.category,
      count: g._count.id,
    }));

    // 3. Всего заявок за период
    const totalRequests = await this.prisma.serviceRequest.count({
      where: {
        tenantId,
        createdAt: { gte: from, lte: to },
      },
    });

    // 4. Среднее время закрытия (часы) для завершенных заявок (RESOLVED / CLOSED)
    const resolvedRequests = await this.prisma.serviceRequest.findMany({
      where: {
        tenantId,
        status: { in: [RequestStatus.RESOLVED, RequestStatus.CLOSED] },
        createdAt: { gte: from, lte: to },
      },
      select: {
        createdAt: true,
        updatedAt: true,
      },
    });

    let averageResolutionTimeHours = 0;
    if (resolvedRequests.length > 0) {
      const totalHours = resolvedRequests.reduce((sum, r) => {
        const diffHours = Math.max(
          0,
          (r.updatedAt.getTime() - r.createdAt.getTime()) / (1000 * 60 * 60),
        );
        return sum + diffHours;
      }, 0);
      averageResolutionTimeHours =
        Math.round((totalHours / resolvedRequests.length) * 10) / 10;
    }

    // 5. Средняя оценка жильцов
    const ratingAgg = await this.prisma.serviceRequest.aggregate({
      where: {
        tenantId,
        createdAt: { gte: from, lte: to },
        rating: { not: null },
      },
      _avg: { rating: true },
      _count: { rating: true },
    });
    const averageRating = ratingAgg._avg.rating
      ? Math.round(ratingAgg._avg.rating * 10) / 10
      : 0;
    const ratedRequestsCount = ratingAgg._count.rating || 0;

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      totalRequests,
      byStatus,
      byCategory,
      averageResolutionTimeHours,
      averageRating,
      ratedRequestsCount,
    };
  }

  // -------------------------------------------------------------
  // 3. Активность жильцов (Activity)
  // -------------------------------------------------------------
  async getActivityAnalytics(
    tenantId: string,
    user: RequestUser,
    query?: DateRangeAnalyticsQueryDto,
  ): Promise<ActivityAnalyticsResponse> {
    await this.assertStaffAccess(user, tenantId);

    const now = new Date();
    const to = query?.to ? new Date(query.to) : now;
    const from = query?.from
      ? new Date(query.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 1. Отношение верифицированных жильцов (снимок на текущий момент)
    const [totalRegisteredResidentsCount, verifiedResidentsCount] =
      await Promise.all([
        this.prisma.user.count({
          where: {
            tenantId,
            role: { in: [UserRole.RESIDENT_OWNER, UserRole.RESIDENT_TENANT] },
          },
        }),
        this.prisma.user.count({
          where: {
            tenantId,
            role: { in: [UserRole.RESIDENT_OWNER, UserRole.RESIDENT_TENANT] },
            isVerified: true,
          },
        }),
      ]);

    const adoptionRatePercent =
      totalRegisteredResidentsCount > 0
        ? Math.round(
            (verifiedResidentsCount / totalRegisteredResidentsCount) * 1000,
          ) / 10
        : 0;

    // 2. Взаимодействия за период
    const [
      votesCast,
      requestsCreated,
      bookingsCreated,
      listingsCreated,
      chatMessagesSent,
      meterReadingsSubmitted,
    ] = await Promise.all([
      this.prisma.vote.count({
        where: {
          agendaItem: { meeting: { tenantId } },
          createdAt: { gte: from, lte: to },
        },
      }),
      this.prisma.serviceRequest.count({
        where: {
          tenantId,
          createdAt: { gte: from, lte: to },
        },
      }),
      this.prisma.booking.count({
        where: {
          resource: { tenantId },
          createdAt: { gte: from, lte: to },
        },
      }),
      this.prisma.communityListing.count({
        where: {
          tenantId,
          createdAt: { gte: from, lte: to },
        },
      }),
      this.prisma.chatMessage.count({
        where: {
          conversation: { tenantId },
          createdAt: { gte: from, lte: to },
        },
      }),
      this.prisma.meterReading.count({
        where: {
          meter: { unit: { building: { tenantId } } },
          createdAt: { gte: from, lte: to },
        },
      }),
    ]);

    return {
      totalRegisteredResidentsCount,
      verifiedResidentsCount,
      adoptionRatePercent,
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      votesCast,
      requestsCreated,
      bookingsCreated,
      listingsCreated,
      chatMessagesSent,
      meterReadingsSubmitted,
    };
  }

  // -------------------------------------------------------------
  // 4. Обзор всей платформы (Cross-tenant platform overview, SUPERADMIN only)
  // -------------------------------------------------------------

  async getPlatformOverview(user: RequestUser): Promise<PlatformOverviewResponse> {
    if (!user || user.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException({
        code: 'ANALYTICS.PLATFORM_ACCESS_FORBIDDEN',
        message: 'Доступ к общей аналитике платформы разрешен только суперадминистратору',
      });
    }

    const [
      tenants,
      totalResidentsGroupBy,
      verifiedResidentsGroupBy,
      activeSosGroupBy,
      openRequestsGroupBy,
      debtAccounts,
    ] = await Promise.all([
      this.prisma.tenant.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.user.groupBy({
        by: ['tenantId'],
        where: {
          role: { in: [UserRole.RESIDENT_OWNER, UserRole.RESIDENT_TENANT] },
          tenantId: { not: null },
        },
        _count: true,
      }),
      this.prisma.user.groupBy({
        by: ['tenantId'],
        where: {
          role: { in: [UserRole.RESIDENT_OWNER, UserRole.RESIDENT_TENANT] },
          isVerified: true,
          tenantId: { not: null },
        },
        _count: true,
      }),
      this.prisma.sosAlert.groupBy({
        by: ['tenantId'],
        where: { status: 'ACTIVE' },
        _count: true,
      }),
      this.prisma.serviceRequest.groupBy({
        by: ['tenantId'],
        where: {
          status: {
            notIn: [
              RequestStatus.RESOLVED,
              RequestStatus.REJECTED,
              RequestStatus.CLOSED,
            ],
          },
        },
        _count: true,
      }),
      this.prisma.personalAccount.findMany({
        where: {
          balance: { lt: 0 },
        },
        select: {
          balance: true,
          unit: {
            select: {
              building: {
                select: {
                  tenantId: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const debtByTenant: Record<string, number> = {};
    let totalOutstandingDebt = 0;
    for (const acc of debtAccounts) {
      const tId = acc.unit?.building?.tenantId;
      const debt = Math.abs(acc.balance);
      totalOutstandingDebt += debt;
      if (tId) {
        debtByTenant[tId] = (debtByTenant[tId] || 0) + debt;
      }
    }

    const totalResidentsMap = new Map<string, number>();
    for (const row of totalResidentsGroupBy) {
      if (row.tenantId) totalResidentsMap.set(row.tenantId, row._count);
    }

    const verifiedResidentsMap = new Map<string, number>();
    for (const row of verifiedResidentsGroupBy) {
      if (row.tenantId) verifiedResidentsMap.set(row.tenantId, row._count);
    }

    const activeSosMap = new Map<string, number>();
    for (const row of activeSosGroupBy) {
      activeSosMap.set(row.tenantId, row._count);
    }

    const openRequestsMap = new Map<string, number>();
    for (const row of openRequestsGroupBy) {
      openRequestsMap.set(row.tenantId, row._count);
    }

    let totalResidentsCount = 0;
    let verifiedResidentsCount = 0;
    let activeSosAlertsCount = 0;
    let openServiceRequestsCount = 0;

    const tenantSummaries: PlatformTenantSummary[] = tenants.map((t) => {
      const resCount = totalResidentsMap.get(t.id) || 0;
      const verCount = verifiedResidentsMap.get(t.id) || 0;
      const sosCount = activeSosMap.get(t.id) || 0;
      const reqCount = openRequestsMap.get(t.id) || 0;
      const debt = Math.round((debtByTenant[t.id] || 0) * 100) / 100;

      totalResidentsCount += resCount;
      verifiedResidentsCount += verCount;
      activeSosAlertsCount += sosCount;
      openServiceRequestsCount += reqCount;

      return {
        tenantId: t.id,
        tenantName: t.name,
        totalResidentsCount: resCount,
        verifiedResidentsCount: verCount,
        activeSosAlertsCount: sosCount,
        openServiceRequestsCount: reqCount,
        outstandingDebt: debt,
      };
    });

    return {
      tenantsCount: tenants.length,
      totalResidentsCount,
      verifiedResidentsCount,
      activeSosAlertsCount,
      openServiceRequestsCount,
      totalOutstandingDebt: Math.round(totalOutstandingDebt * 100) / 100,
      tenants: tenantSummaries,
    };
  }

  // -------------------------------------------------------------
  // 5. Экспорт активности жителей в формате CSV
  // -------------------------------------------------------------
  async exportResidentActivityCsv(
    tenantId: string,
    user: RequestUser,
    query?: DateRangeAnalyticsQueryDto,
  ): Promise<{ buffer: Buffer; filename: string }> {
    await this.assertStaffAccess(user, tenantId);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    const now = new Date();
    const to = query?.to ? new Date(query.to) : now;
    if (query?.to && query.to.length === 10) {
      to.setUTCHours(23, 59, 59, 999);
    }
    const from = query?.from
      ? new Date(query.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (query?.from && query.from.length === 10) {
      from.setUTCHours(0, 0, 0, 0);
    }

    const fromDateStr = from.toISOString().split('T')[0];
    const toDateStr = to.toISOString().split('T')[0];

    // Population of residents (resident owners & tenants)
    const residents = await this.prisma.user.findMany({
      where: {
        tenantId,
        role: { in: [UserRole.RESIDENT_OWNER, UserRole.RESIDENT_TENANT] },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    // 6 groupBy queries executed concurrently
    const [
      votesGroup,
      requestsGroup,
      bookingsGroup,
      listingsGroup,
      messagesGroup,
      meterReadingsGroup,
    ] = await Promise.all([
      this.prisma.vote.groupBy({
        by: ['userId'],
        where: {
          agendaItem: { meeting: { tenantId } },
          createdAt: { gte: from, lte: to },
        },
        _count: true,
      }),
      this.prisma.serviceRequest.groupBy({
        by: ['creatorId'],
        where: {
          tenantId,
          createdAt: { gte: from, lte: to },
        },
        _count: true,
      }),
      this.prisma.booking.groupBy({
        by: ['bookedById'],
        where: {
          resource: { tenantId },
          createdAt: { gte: from, lte: to },
        },
        _count: true,
      }),
      this.prisma.communityListing.groupBy({
        by: ['authorId'],
        where: {
          tenantId,
          createdAt: { gte: from, lte: to },
        },
        _count: true,
      }),
      this.prisma.chatMessage.groupBy({
        by: ['senderId'],
        where: {
          conversation: { tenantId },
          createdAt: { gte: from, lte: to },
        },
        _count: true,
      }),
      this.prisma.meterReading.groupBy({
        by: ['submittedById'],
        where: {
          meter: { unit: { building: { tenantId } } },
          createdAt: { gte: from, lte: to },
        },
        _count: true,
      }),
    ]);

    const extractCount = (val: any): number => {
      if (typeof val === 'number') return val;
      if (val && typeof val === 'object') {
        if (typeof val._all === 'number') return val._all;
        if (typeof val.id === 'number') return val.id;
        const first = Object.values(val)[0];
        if (typeof first === 'number') return first;
      }
      return 0;
    };

    const votesMap = new Map<string, number>();
    for (const g of votesGroup) {
      if (g.userId) votesMap.set(g.userId, extractCount(g._count));
    }

    const requestsMap = new Map<string, number>();
    for (const g of requestsGroup) {
      if (g.creatorId) requestsMap.set(g.creatorId, extractCount(g._count));
    }

    const bookingsMap = new Map<string, number>();
    for (const g of bookingsGroup) {
      if (g.bookedById) bookingsMap.set(g.bookedById, extractCount(g._count));
    }

    const listingsMap = new Map<string, number>();
    for (const g of listingsGroup) {
      if (g.authorId) listingsMap.set(g.authorId, extractCount(g._count));
    }

    const messagesMap = new Map<string, number>();
    for (const g of messagesGroup) {
      if (g.senderId) messagesMap.set(g.senderId, extractCount(g._count));
    }

    const meterReadingsMap = new Map<string, number>();
    for (const g of meterReadingsGroup) {
      if (g.submittedById) meterReadingsMap.set(g.submittedById, extractCount(g._count));
    }

    const residentRows = residents.map((r) => {
      const fullName = `${r.lastName || ''} ${r.firstName || ''}`.trim() || '—';
      const phone = r.phone || '—';
      const votesCount = votesMap.get(r.id) || 0;
      const requestsCount = requestsMap.get(r.id) || 0;
      const bookingsCount = bookingsMap.get(r.id) || 0;
      const listingsCount = listingsMap.get(r.id) || 0;
      const messagesCount = messagesMap.get(r.id) || 0;
      const readingsCount = meterReadingsMap.get(r.id) || 0;
      const totalActivity =
        votesCount +
        requestsCount +
        bookingsCount +
        listingsCount +
        messagesCount +
        readingsCount;

      return {
        fullName,
        phone,
        votesCount,
        requestsCount,
        bookingsCount,
        listingsCount,
        messagesCount,
        readingsCount,
        totalActivity,
      };
    });

    residentRows.sort((a, b) => {
      if (b.totalActivity !== a.totalActivity) {
        return b.totalActivity - a.totalActivity;
      }
      return a.fullName.localeCompare(b.fullName, 'ru');
    });

    const rows: unknown[][] = [
      ['Отчет по активности жителей'],
      ['Жилой комплекс', tenant?.name ?? tenantId],
      ['Период', `${fromDateStr} — ${toDateStr}`],
      [],
      [
        'ФИО',
        'Телефон',
        'Голосов подано',
        'Заявок создано',
        'Бронирований',
        'Объявлений',
        'Сообщений в чате',
        'Показаний счётчиков',
        'Итого',
      ],
    ];

    for (const r of residentRows) {
      rows.push([
        r.fullName,
        r.phone,
        r.votesCount,
        r.requestsCount,
        r.bookingsCount,
        r.listingsCount,
        r.messagesCount,
        r.readingsCount,
        r.totalActivity,
      ]);
    }

    const buffer = buildCsv(rows);
    const filename = `resident-activity-${tenantId}-${fromDateStr}_${toDateStr}.csv`;

    return { buffer, filename };
  }
}
