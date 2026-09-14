import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, RequestStatus, BookingStatus, OwnershipType } from '@prisma/client';
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
  ResourceUtilizationItem,
  BookingUtilizationResponse,
  StaffResponseTimeItem,
  StaffResponseTimeAnalyticsResponse,
  BuildingOccupancyItem,
  VacantUnitItem,
  UnitOccupancyResponse,
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

  /**
   * Аналитика утилизации бронируемых пространств и ресурсов ЖК за период.
   */
  async getBookingUtilizationAnalytics(
    tenantId: string,
    user: RequestUser,
    query?: DateRangeAnalyticsQueryDto,
  ): Promise<BookingUtilizationResponse> {
    await this.assertStaffAccess(user, tenantId);

    const now = new Date();
    const to = query?.to ? new Date(query.to) : now;
    const from = query?.from
      ? new Date(query.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 1. Активные ресурсы данного ЖК
    const resources = await this.prisma.bookableResource.findMany({
      where: {
        tenantId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        type: true,
        operatingHoursStart: true,
        operatingHoursEnd: true,
      },
    });

    // 2. Подтвержденные бронирования в диапазоне startTime
    const bookings = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.CONFIRMED,
        startTime: { gte: from, lte: to },
        resource: {
          tenantId,
          isActive: true,
        },
      },
      select: {
        resourceId: true,
        startTime: true,
        endTime: true,
      },
    });

    // 3. Агрегация бронирований в памяти (часы и количество)
    const bookingsByResource = new Map<string, { count: number; totalHours: number }>();
    for (const b of bookings) {
      const durationMs = Math.max(
        0,
        new Date(b.endTime).getTime() - new Date(b.startTime).getTime(),
      );
      const durationHours = durationMs / (1000 * 60 * 60);

      const current = bookingsByResource.get(b.resourceId) || { count: 0, totalHours: 0 };
      current.count += 1;
      current.totalHours += durationHours;
      bookingsByResource.set(b.resourceId, current);
    }

    // 4. Дней в периоде
    const daysInRange = Math.max(
      1,
      Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)),
    );

    // 5. Расчет утилизации для каждого активного ресурса (с zero-fill)
    const resourceItems: ResourceUtilizationItem[] = resources.map((r) => {
      let dailyWindowHours = 24;
      if (r.operatingHoursStart && r.operatingHoursEnd) {
        const [startH, startM] = r.operatingHoursStart.split(':').map(Number);
        const [endH, endM] = r.operatingHoursEnd.split(':').map(Number);
        if (!isNaN(startH) && !isNaN(startM) && !isNaN(endH) && !isNaN(endM)) {
          const diff = endH + endM / 60 - (startH + startM / 60);
          if (diff > 0) {
            dailyWindowHours = diff;
          }
        }
      }

      const availableHours = Math.round(dailyWindowHours * daysInRange * 10) / 10;
      const agg = bookingsByResource.get(r.id) || { count: 0, totalHours: 0 };
      const totalBookedHours = Math.round(agg.totalHours * 10) / 10;

      const rawPercent = availableHours > 0 ? (totalBookedHours / availableHours) * 100 : 0;
      const utilizationPercent = Math.round(rawPercent * 10) / 10;

      return {
        resourceId: r.id,
        resourceName: r.name,
        resourceType: r.type,
        bookingsCount: agg.count,
        totalBookedHours,
        availableHours,
        utilizationPercent,
      };
    });

    // 6. Сортировка: utilizationPercent desc, totalBookedHours desc
    resourceItems.sort((a, b) => {
      if (b.utilizationPercent !== a.utilizationPercent) {
        return b.utilizationPercent - a.utilizationPercent;
      }
      return b.totalBookedHours - a.totalBookedHours;
    });

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      resources: resourceItems,
    };
  }

  /**
   * Аналитика скорости реагирования персонала: среднее время закрытия
   * заявок (ServiceRequest) и среднее время реагирования на SOS
   * (SosAlert) в разбивке по конкретному сотруднику.
   */
  async getStaffResponseTimeAnalytics(
    tenantId: string,
    user: RequestUser,
    query?: DateRangeAnalyticsQueryDto,
  ): Promise<StaffResponseTimeAnalyticsResponse> {
    await this.assertStaffAccess(user, tenantId);

    const now = new Date();
    const to = query?.to ? new Date(query.to) : now;
    const from = query?.from
      ? new Date(query.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 1. Заявки, закрытые за период, с назначенным исполнителем
    const resolvedRequests = await this.prisma.serviceRequest.findMany({
      where: {
        tenantId,
        assigneeId: { not: null },
        status: { in: [RequestStatus.RESOLVED, RequestStatus.CLOSED] },
        createdAt: { gte: from, lte: to },
      },
      select: {
        assigneeId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const requestsByStaff = new Map<string, { count: number; totalHours: number }>();
    for (const r of resolvedRequests) {
      const diffHours = Math.max(
        0,
        (r.updatedAt.getTime() - r.createdAt.getTime()) / (1000 * 60 * 60),
      );
      const current = requestsByStaff.get(r.assigneeId!) || { count: 0, totalHours: 0 };
      current.count += 1;
      current.totalHours += diffHours;
      requestsByStaff.set(r.assigneeId!, current);
    }

    // 2. SOS-вызовы, разрешенные за период
    const resolvedAlerts = await this.prisma.sosAlert.findMany({
      where: {
        tenantId,
        resolvedById: { not: null },
        resolvedAt: { not: null },
        createdAt: { gte: from, lte: to },
      },
      select: {
        resolvedById: true,
        createdAt: true,
        resolvedAt: true,
      },
    });

    const sosByStaff = new Map<string, { count: number; totalMinutes: number }>();
    for (const a of resolvedAlerts) {
      const diffMinutes = Math.max(
        0,
        (a.resolvedAt!.getTime() - a.createdAt.getTime()) / (1000 * 60),
      );
      const current = sosByStaff.get(a.resolvedById!) || { count: 0, totalMinutes: 0 };
      current.count += 1;
      current.totalMinutes += diffMinutes;
      sosByStaff.set(a.resolvedById!, current);
    }

    // 3. Объединение id сотрудников, встретившихся хотя бы в одном из наборов
    const staffIds = Array.from(new Set([...requestsByStaff.keys(), ...sosByStaff.keys()]));

    if (staffIds.length === 0) {
      return { from: from.toISOString(), to: to.toISOString(), staff: [] };
    }

    const staffUsers = await this.prisma.user.findMany({
      where: { id: { in: staffIds } },
      select: { id: true, firstName: true, lastName: true, role: true },
    });
    const staffById = new Map(staffUsers.map((u) => [u.id, u]));

    const staffItems: StaffResponseTimeItem[] = staffIds.map((staffId) => {
      const staffUser = staffById.get(staffId);
      const staffName = staffUser
        ? [staffUser.firstName, staffUser.lastName].filter(Boolean).join(' ')
        : 'Неизвестный сотрудник';
      const staffRole = staffUser?.role || '';

      const requestsAgg = requestsByStaff.get(staffId);
      const sosAgg = sosByStaff.get(staffId);

      const requestsResolvedCount = requestsAgg?.count || 0;
      const avgRequestResolutionHours = requestsAgg
        ? Math.round((requestsAgg.totalHours / requestsAgg.count) * 10) / 10
        : 0;

      const sosResolvedCount = sosAgg?.count || 0;
      const avgSosResponseMinutes = sosAgg
        ? Math.round((sosAgg.totalMinutes / sosAgg.count) * 10) / 10
        : 0;

      return {
        staffId,
        staffName,
        staffRole,
        requestsResolvedCount,
        avgRequestResolutionHours,
        sosResolvedCount,
        avgSosResponseMinutes,
      };
    });

    // 4. Сортировка по суммарному количеству обработанных обращений (desc)
    staffItems.sort(
      (a, b) =>
        b.requestsResolvedCount +
        b.sosResolvedCount -
        (a.requestsResolvedCount + a.sosResolvedCount),
    );

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      staff: staffItems,
    };
  }

  // -------------------------------------------------------------
  // 7. Занятость/вакантность юнитов (Unit occupancy)
  // -------------------------------------------------------------
  async getUnitOccupancyAnalytics(
    tenantId: string,
    user: RequestUser,
  ): Promise<UnitOccupancyResponse> {
    await this.assertStaffAccess(user, tenantId);

    const buildings = await this.prisma.building.findMany({
      where: { tenantId },
      include: {
        units: {
          include: {
            ownerships: {
              where: { isVerified: true, ownershipType: OwnershipType.OWNER },
            },
          },
        },
      },
      orderBy: { blockName: 'asc' },
    });

    const byBuilding: BuildingOccupancyItem[] = [];
    const vacantUnitsList: VacantUnitItem[] = [];
    let totalUnits = 0;
    let occupiedUnits = 0;

    for (const building of buildings) {
      let buildingOccupied = 0;

      for (const unit of building.units) {
        const isOccupied = unit.ownerships.length > 0;
        if (isOccupied) {
          buildingOccupied += 1;
        } else {
          vacantUnitsList.push({
            unitId: unit.id,
            unitNumber: unit.unitNumber,
            floor: unit.floor,
            blockName: building.blockName,
          });
        }
      }

      const buildingTotal = building.units.length;
      byBuilding.push({
        buildingId: building.id,
        blockName: building.blockName,
        totalUnits: buildingTotal,
        occupiedUnits: buildingOccupied,
        vacantUnits: buildingTotal - buildingOccupied,
        occupancyPercent:
          buildingTotal > 0
            ? Math.round((buildingOccupied / buildingTotal) * 10000) / 100
            : 0,
      });

      totalUnits += buildingTotal;
      occupiedUnits += buildingOccupied;
    }

    vacantUnitsList.sort((a, b) => {
      const blockCompare = a.blockName.localeCompare(b.blockName);
      return blockCompare !== 0 ? blockCompare : a.unitNumber.localeCompare(b.unitNumber);
    });

    return {
      tenantId,
      totalUnits,
      occupiedUnits,
      vacantUnits: totalUnits - occupiedUnits,
      occupancyPercent:
        totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 10000) / 100 : 0,
      byBuilding,
      vacantUnitsList,
    };
  }
}

