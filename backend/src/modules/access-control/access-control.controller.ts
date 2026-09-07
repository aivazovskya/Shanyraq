import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AccessControlService } from './access-control.service';
import { OpenBarrierDto, CreateGuestPassDto } from './dto/access-control.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { assertUserBelongsToTenant } from '../../common/guards/tenant.guard';
import { UserRole } from '@prisma/client';

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

  @Get('points/:id/stream')
  @ApiOperation({ summary: 'Получить безопасный WebRTC/HLS видеопоток камеры через go2rtc' })
  async getCameraStream(@Param('id') accessPointId: string, @CurrentUser() user: any) {
    // Доступно только для жителей и персонала данного ЖК (или SUPERADMIN)
    return this.accessControlService.getCameraStream(user, accessPointId);
  }

  @Post('open-barrier')
  @ApiOperation({ summary: 'Открыть шлагбаум / ворота через мобильное приложение' })
  async openBarrier(
    @CurrentUser() user: any,
    @Body() dto: OpenBarrierDto,
  ) {
    return this.accessControlService.openBarrier(user, dto);
  }

  @Post('guest-pass')
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
}
