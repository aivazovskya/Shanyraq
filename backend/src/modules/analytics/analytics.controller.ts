import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
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

  @Get('platform/overview')
  @Roles(UserRole.SUPERADMIN)
  @ApiOperation({
    summary: 'Обзор платформы по всем ЖК (только для SUPERADMIN)',
  })
  async getPlatformOverview(@Request() req: any) {
    return this.analyticsService.getPlatformOverview(req.user);
  }

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

  @Get('tenants/:tenantId/finance/export')
  @ApiOperation({
    summary:
      'Экспорт финансовой аналитики ЖК в формате CSV (сводка, тарифы, полный список должников)',
  })
  @ApiQuery({ name: 'month', required: false, type: Number })
  @ApiQuery({ name: 'year', required: false, type: Number })
  async exportFinanceAnalyticsCsv(
    @Param('tenantId') tenantId: string,
    @Query() query: FinanceAnalyticsQueryDto,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const { buffer, filename } =
      await this.analyticsService.exportFinanceAnalyticsCsv(tenantId, req.user, query);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
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

  @Get('tenants/:tenantId/activity/export')
  @ApiOperation({
    summary:
      'Экспорт активности жителей ЖК в формате CSV (с разбивкой по каждому жителю)',
  })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  async exportResidentActivityCsv(
    @Param('tenantId') tenantId: string,
    @Query() query: DateRangeAnalyticsQueryDto,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const { buffer, filename } =
      await this.analyticsService.exportResidentActivityCsv(tenantId, req.user, query);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Get('tenants/:tenantId/bookings')
  @ApiOperation({
    summary: 'Аналитика утилизации бронируемых пространств и ресурсов ЖК',
  })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  async getBookingUtilizationAnalytics(
    @Param('tenantId') tenantId: string,
    @Query() query: DateRangeAnalyticsQueryDto,
    @Request() req: any,
  ) {
    return this.analyticsService.getBookingUtilizationAnalytics(tenantId, req.user, query);
  }

  @Get('tenants/:tenantId/staff-performance')
  @ApiOperation({
    summary:
      'Скорость реагирования персонала (среднее время закрытия заявок и реагирования на SOS по сотруднику)',
  })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  async getStaffResponseTimeAnalytics(
    @Param('tenantId') tenantId: string,
    @Query() query: DateRangeAnalyticsQueryDto,
    @Request() req: any,
  ) {
    return this.analyticsService.getStaffResponseTimeAnalytics(tenantId, req.user, query);
  }

  @Get('tenants/:tenantId/occupancy')
  @ApiOperation({
    summary: 'Занятость/вакантность юнитов (доля помещений с подтверждённым собственником)',
  })
  async getUnitOccupancyAnalytics(
    @Param('tenantId') tenantId: string,
    @Request() req: any,
  ) {
    return this.analyticsService.getUnitOccupancyAnalytics(tenantId, req.user);
  }
}

