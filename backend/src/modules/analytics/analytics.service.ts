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
} from './dto/analytics.dto';

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
      throw new ForbiddenException(
        'Доступ к аналитике разрешен только для администраторов и председателя ОСИ',
      );
    }

    assertUserBelongsToTenant(user, tenantId, 'аналитики');

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException('Жилой комплекс не найден');
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
}
