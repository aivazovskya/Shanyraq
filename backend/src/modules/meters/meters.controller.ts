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
import { UserRole, ReadingStatus } from '@prisma/client';
import { MetersService } from './meters.service';
import {
  CreateMeterDto,
  UpdateMeterDto,
  SubmitReadingDto,
  ReviewReadingDto,
} from './dto/meters.dto';

@ApiTags('Meters (Приборы учёта и показания)')
@Controller('meters')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class MetersController {
  constructor(private readonly metersService: MetersService) {}

  // -------------------------------------------------------------
  // Приборы учёта (Счётчики)
  // -------------------------------------------------------------

  @Get('units/:unitId')
  @ApiOperation({ summary: 'Список счётчиков квартиры (для жильцов или сотрудников)' })
  async getUnitMeters(@Param('unitId') unitId: string, @Request() req: any) {
    return this.metersService.getUnitMeters(unitId, req.user);
  }

  @Post('units/:unitId')
  @Roles(UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Регистрация нового счётчика в квартире (УК/ОСИ)' })
  async createMeter(
    @Param('unitId') unitId: string,
    @Body() dto: CreateMeterDto,
    @Request() req: any,
  ) {
    return this.metersService.createMeter(unitId, dto, req.user);
  }

  @Patch(':id')
  @Roles(UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Обновление данных счётчика / деактивация (УК/ОСИ)' })
  async updateMeter(
    @Param('id') id: string,
    @Body() dto: UpdateMeterDto,
    @Request() req: any,
  ) {
    return this.metersService.updateMeter(id, dto, req.user);
  }

  // -------------------------------------------------------------
  // Показания (Подача жильцами и история)
  // -------------------------------------------------------------

  @Post(':meterId/readings')
  @Roles(UserRole.RESIDENT_OWNER, UserRole.RESIDENT_TENANT)
  @ApiOperation({ summary: 'Подача показаний счётчика с фото (Собственник или Арендатор)' })
  async submitReading(
    @Param('meterId') meterId: string,
    @Body() dto: SubmitReadingDto,
    @Request() req: any,
  ) {
    return this.metersService.submitReading(meterId, dto, req.user);
  }

  @Get(':meterId/readings')
  @ApiOperation({ summary: 'История показаний конкретного счётчика' })
  async getMeterReadings(@Param('meterId') meterId: string, @Request() req: any) {
    return this.metersService.getMeterReadings(meterId, req.user);
  }

  // -------------------------------------------------------------
  // Очередь проверки показаний (Диспетчер / УК / Председатель)
  // -------------------------------------------------------------

  @Get('tenants/:tenantId/readings/export')
  @Roles(
    UserRole.DISPATCHER,
    UserRole.HOA_ADMIN,
    UserRole.SUPERADMIN,
    UserRole.HOA_CHAIRMAN,
  )
  @ApiQuery({ name: 'month', required: false, type: Number })
  @ApiQuery({ name: 'year', required: false, type: Number })
  @ApiOperation({ summary: 'Экспорт истории показаний счётчиков в формате CSV' })
  async exportReadingsCsv(
    @Param('tenantId') tenantId: string,
    @Query('month') month: string | undefined,
    @Query('year') year: string | undefined,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.metersService.exportReadingsCsv(
      tenantId,
      req.user,
      { month, year },
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Get('tenants/:tenantId/readings')
  @Roles(
    UserRole.DISPATCHER,
    UserRole.HOA_ADMIN,
    UserRole.SUPERADMIN,
    UserRole.HOA_CHAIRMAN,
  )
  @ApiQuery({ name: 'status', enum: ReadingStatus, required: false })
  @ApiOperation({ summary: 'Очередь поданных показаний по ЖК' })
  async getTenantReadingsQueue(
    @Param('tenantId') tenantId: string,
    @Query('status') status: ReadingStatus | undefined,
    @Request() req: any,
  ) {
    return this.metersService.getTenantReadingsQueue(tenantId, status, req.user);
  }

  @Patch('readings/:id/review')
  @Roles(UserRole.DISPATCHER, UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Проверка показания (Подтвердить или Отклонить)' })
  async reviewReading(
    @Param('id') id: string,
    @Body() dto: ReviewReadingDto,
    @Request() req: any,
  ) {
    return this.metersService.reviewReading(id, dto, req.user);
  }
}
