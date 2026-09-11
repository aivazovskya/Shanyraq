import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { AuditLogService, AuditLogQueryDto } from './audit-log.service';

@ApiTags('Audit Log (Журнал аудита действий сотрудников)')
@Controller('audit-log')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN, UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN)
@ApiBearerAuth()
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get('tenants/:tenantId')
  @ApiOperation({
    summary: 'Журнал действий сотрудников по ЖК (тарифы, жильцы, модерация, собственность)',
  })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiQuery({ name: 'action', required: false, type: String })
  async getAuditLogs(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
    @Query() query: AuditLogQueryDto,
  ) {
    return this.auditLogService.getAuditLogs(tenantId, user, query);
  }

  @Get('tenants/:tenantId/export')
  @ApiOperation({
    summary: 'Экспорт журнала действий сотрудников в формате CSV с UTF-8 BOM',
  })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiQuery({ name: 'action', required: false, type: String })
  async exportAuditLogsCsv(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
    @Query() query: AuditLogQueryDto,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.auditLogService.exportAuditLogsCsv(
      tenantId,
      user,
      query,
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }
}
