import { Controller, Get, Post, Patch, Body, Param, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AccessControlService } from './access-control.service';
import {
  OpenBarrierDto,
  CreateGuestPassDto,
  CreateAccessPointDto,
  UpdateAccessPointDto,
} from './dto/access-control.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { assertUserBelongsToTenant } from '../../common/guards/tenant.guard';
import { UserRole } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Access Control & Video (СКУД, Шлагбаумы, Камеры)')
@Controller('access')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AccessControlController {
  constructor(private readonly accessControlService: AccessControlService) {}

  @Get('tenant/:tenantId/points')
  @ApiOperation({ summary: 'Список доступных шлагбаумов, ворот и камер ЖК (RTSP скрыт от жителей)' })
  async getAccessPoints(@Param('tenantId') tenantId: string, @CurrentUser() user: any) {
    // Аудит безопасности: BOLA защита — житель или сотрудник видит только инфраструктуру своего ЖК
    assertUserBelongsToTenant(user, tenantId, 'точек доступа');
    return this.accessControlService.getAccessPoints(tenantId, user.role);
  }

  @Post('tenant/:tenantId/points')
  @Roles(UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Зарегистрировать новую точку доступа (шлагбаум, домофон, камера)' })
  async createAccessPoint(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateAccessPointDto,
  ) {
    return this.accessControlService.createAccessPoint(user, tenantId, dto);
  }

  @Patch('points/:id')
  @Roles(UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Обновить параметры или статус точки доступа' })
  async updateAccessPoint(
    @Param('id') accessPointId: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateAccessPointDto,
  ) {
    return this.accessControlService.updateAccessPoint(user, accessPointId, dto);
  }

  @Get('points/:id/health-check')
  @Roles(UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Проверить доступность домофона Hikvision по ISAPI' })
  async healthCheck(
    @Param('id') accessPointId: string,
    @CurrentUser() user: any,
  ) {
    return this.accessControlService.healthCheck(user, accessPointId);
  }

  @Get('points/:id/stream')
  @ApiOperation({ summary: 'Получить безопасный WebRTC/HLS видеопоток камеры через go2rtc' })
  async getCameraStream(@Param('id') accessPointId: string, @CurrentUser() user: any) {
    // Доступно только для жителей и персонала данного ЖК (или SUPERADMIN)
    return this.accessControlService.getCameraStream(user, accessPointId);
  }

  @Post('open-barrier')
  @ApiOperation({ summary: 'Открыть шлагбаум / ворота / домофон через мобильное приложение' })
  async openBarrier(
    @CurrentUser() user: any,
    @Body() dto: OpenBarrierDto,
  ) {
    return this.accessControlService.openBarrier(user, dto);
  }

  @Post('guest-pass')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Оформить гостевой пропуск (QR-код / PIN-код для своей квартиры)' })
  async createGuestPass(@CurrentUser() user: any, @Body() dto: CreateGuestPassDto) {
    return this.accessControlService.createGuestPass(user, dto);
  }

  @Get('tenant/:tenantId/logs')
  @Roles(UserRole.SECURITY, UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Журнал событий проезда и открытий (только для сотрудников своего ЖК)' })
  async getAccessLogs(@Param('tenantId') tenantId: string, @CurrentUser() user: any) {
    // Аудит безопасности: охрана одного ЖК не может просматривать журнал въездов другого ЖК
    assertUserBelongsToTenant(user, tenantId, 'журнала проездов');
    return this.accessControlService.getAccessLogs(tenantId);
  }

  @Get('tenant/:tenantId/logs/export')
  @Roles(UserRole.SECURITY, UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Экспорт журнала доступа в формате CSV' })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  async exportAccessLogsCsv(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Res() res: Response,
  ) {
    assertUserBelongsToTenant(user, tenantId, 'журнала проездов');
    const { buffer, filename } =
      await this.accessControlService.exportAccessLogsCsv(tenantId, user, {
        from,
        to,
      });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }
}
