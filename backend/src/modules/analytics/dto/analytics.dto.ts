import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class FinanceAnalyticsQueryDto {
  @ApiPropertyOptional({ example: 9, description: 'Месяц периода (1-12)' })
  @IsOptional()
  month?: string | number;

  @ApiPropertyOptional({ example: 2026, description: 'Год периода (например, 2026)' })
  @IsOptional()
  year?: string | number;
}

export class DateRangeAnalyticsQueryDto {
  @ApiPropertyOptional({ example: '2026-08-01T00:00:00.000Z', description: 'Начальная дата (ISO)' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-31T23:59:59.999Z', description: 'Конечная дата (ISO)' })
  @IsOptional()
  @IsString()
  to?: string;
}

export interface TariffBreakdownItem {
  tariffId: string;
  tariffName: string;
  amount: number;
}

export interface TopDebtorItem {
  accountId: string;
  accountNumber: string;
  unitId: string;
  unitNumber: string;
  buildingBlock: string;
  balance: number;
}

export interface FinanceAnalyticsResponse {
  periodMonth: number;
  periodYear: number;
  totalCharged: number;
  totalCollected: number;
  collectionRatePercent: number;
  byTariff: TariffBreakdownItem[];
  topDebtors: TopDebtorItem[];
}

export interface RequestStatusCount {
  status: string;
  count: number;
}

export interface RequestCategoryCount {
  category: string;
  count: number;
}

export interface RequestsAnalyticsResponse {
  from: string;
  to: string;
  totalRequests: number;
  byStatus: RequestStatusCount[];
  byCategory: RequestCategoryCount[];
  averageResolutionTimeHours: number;
  averageRating: number;
  ratedRequestsCount: number;
}

export interface ActivityAnalyticsResponse {
  totalRegisteredResidentsCount: number;
  verifiedResidentsCount: number;
  adoptionRatePercent: number;
  period: {
    from: string;
    to: string;
  };
  votesCast: number;
  requestsCreated: number;
  bookingsCreated: number;
  listingsCreated: number;
  chatMessagesSent: number;
  meterReadingsSubmitted: number;
}

export interface PlatformTenantSummary {
  tenantId: string;
  tenantName: string;
  totalResidentsCount: number;
  verifiedResidentsCount: number;
  activeSosAlertsCount: number;
  openServiceRequestsCount: number;
  outstandingDebt: number;
}

export interface PlatformOverviewResponse {
  tenantsCount: number;
  totalResidentsCount: number;
  verifiedResidentsCount: number;
  activeSosAlertsCount: number;
  openServiceRequestsCount: number;
  totalOutstandingDebt: number;
  tenants: PlatformTenantSummary[];
}
