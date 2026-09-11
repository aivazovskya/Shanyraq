import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { SosService } from './sos.service';
import {
  TriggerSosDto,
  ResolveSosDto,
  GetTenantAlertsQueryDto,
  GetSosStatisticsQueryDto,
} from './dto/sos.dto';

@ApiTags('SOS (Экстренный вызов охраны/диспетчера)')
@Controller('sos')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SosController {
  constructor(private readonly sosService: SosService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Экстренный вызов SOS (для жителей)' })
  async trigger(@Body() dto: TriggerSosDto, @Request() req: any) {
    return this.sosService.trigger(req.user, dto);
  }

  @Get('my')
  @ApiOperation({ summary: 'Мои обращения SOS (для текущего жителя)' })
  async getMyAlerts(@Request() req: any) {
    return this.sosService.getMyAlerts(req.user);
  }

  @Get('tenants/:tenantId')
  @Roles(
    UserRole.SECURITY,
    UserRole.DISPATCHER,
    UserRole.HOA_ADMIN,
    UserRole.HOA_CHAIRMAN,
    UserRole.SUPERADMIN,
  )
  @ApiOperation({ summary: 'Журнал экстренных вызовов ЖК для охраны и персонала' })
  async getTenantAlerts(
    @Param('tenantId') tenantId: string,
    @Query() query: GetTenantAlertsQueryDto,
    @Request() req: any,
  ) {
    return this.sosService.getTenantAlerts(tenantId, req.user, query);
  }

  @Get('tenants/:tenantId/statistics')
  @Roles(
    UserRole.SECURITY,
    UserRole.DISPATCHER,
    UserRole.HOA_ADMIN,
    UserRole.HOA_CHAIRMAN,
    UserRole.SUPERADMIN,
  )
  @ApiOperation({ summary: 'Статистика и тренды экстренных вызовов SOS' })
  async getSosStatistics(
    @Param('tenantId') tenantId: string,
    @Query() query: GetSosStatisticsQueryDto,
    @Request() req: any,
  ) {
    return this.sosService.getSosStatistics(tenantId, req.user, query);
  }

  @Patch(':id/resolve')
  @Roles(
    UserRole.SECURITY,
    UserRole.DISPATCHER,
    UserRole.HOA_ADMIN,
    UserRole.SUPERADMIN,
  )
  @ApiOperation({ summary: 'Обработать / закрыть вызов SOS (охрана/диспетчер/УК)' })
  async resolve(
    @Param('id') id: string,
    @Body() dto: ResolveSosDto,
    @Request() req: any,
  ) {
    return this.sosService.resolve(id, req.user, dto);
  }
}
