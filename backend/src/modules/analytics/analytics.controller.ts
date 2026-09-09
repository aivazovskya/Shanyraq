import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { AnalyticsService } from './analytics.service';
import {
  FinanceAnalyticsQueryDto,
  DateRangeAnalyticsQueryDto,
} from './dto/analytics.dto';

@ApiTags('Analytics (Расширенная аналитика и отчёты)')
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN)
@ApiBearerAuth()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('tenants/:tenantId/finance')
  @ApiOperation({
    summary:
      'Финансовая аналитика ЖК (собираемость, разбивка по тарифам, топ должников)',
  })
  @ApiQuery({ name: 'month', required: false, type: Number })
  @ApiQuery({ name: 'year', required: false, type: Number })
  async getFinanceAnalytics(
    @Param('tenantId') tenantId: string,
    @Query() query: FinanceAnalyticsQueryDto,
    @Request() req: any,
  ) {
    return this.analyticsService.getFinanceAnalytics(tenantId, req.user, query);
  }

  @Get('tenants/:tenantId/requests')
  @ApiOperation({
    summary:
      'Статистика по заявкам (по статусам, по категориям, среднее время решения, средний рейтинг)',
  })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  async getRequestsAnalytics(
    @Param('tenantId') tenantId: string,
    @Query() query: DateRangeAnalyticsQueryDto,
    @Request() req: any,
  ) {
    return this.analyticsService.getRequestsAnalytics(tenantId, req.user, query);
  }

  @Get('tenants/:tenantId/activity')
  @ApiOperation({
    summary:
      'Активность жильцов (доля верификации, количество действий в модулях за период)',
  })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  async getActivityAnalytics(
    @Param('tenantId') tenantId: string,
    @Query() query: DateRangeAnalyticsQueryDto,
    @Request() req: any,
  ) {
    return this.analyticsService.getActivityAnalytics(tenantId, req.user, query);
  }
}
