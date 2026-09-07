import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AccessControlService } from './access-control.service';
import { OpenBarrierDto, CreateGuestPassDto } from './dto/access-control.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Access Control & Video (СКУД, Шлагбаумы, Камеры)')
@Controller('access')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AccessControlController {
  constructor(private readonly accessControlService: AccessControlService) {}

  @Get('tenant/:tenantId/points')
  @ApiOperation({ summary: 'Список доступных шлагбаумов, ворот и камер ЖК' })
  async getAccessPoints(@Param('tenantId') tenantId: string) {
    return this.accessControlService.getAccessPoints(tenantId);
  }

  @Post('open-barrier')
  @ApiOperation({ summary: 'Открыть шлагбаум / ворота через мобильное приложение' })
  async openBarrier(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
    @Body() dto: OpenBarrierDto,
  ) {
    return this.accessControlService.openBarrier(userId, role, dto);
  }

  @Post('guest-pass')
  @ApiOperation({ summary: 'Оформить гостевой пропуск (QR-код / PIN-код)' })
  async createGuestPass(@CurrentUser('id') userId: string, @Body() dto: CreateGuestPassDto) {
    return this.accessControlService.createGuestPass(userId, dto);
  }

  @Get('tenant/:tenantId/logs')
  @Roles(UserRole.SECURITY, UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Журнал событий проезда и открытий (для поста охраны и УК)' })
  async getAccessLogs(@Param('tenantId') tenantId: string) {
    return this.accessControlService.getAccessLogs(tenantId);
  }
}
