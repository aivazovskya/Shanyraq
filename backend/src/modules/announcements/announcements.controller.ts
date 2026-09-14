import { Controller, Get, Post, Patch, Body, Param, Query, Res, UseGuards, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto, RemoveAnnouncementDto } from './dto/announcements.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { assertUserBelongsToTenant } from '../../common/guards/tenant.guard';
import { UserRole } from '@prisma/client';

@ApiTags('Announcements & News (Лента новостей и оповещений)')
@Controller('announcements')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get('tenant/:tenantId')
  @ApiOperation({ summary: 'Лента новостей и оповещений жилого комплекса (с tenant-изоляцией)' })
  async getAnnouncements(@Param('tenantId') tenantId: string, @CurrentUser() user: any) {
    // Безопасность: BOLA/IDOR защита — житель или сотрудник может читать новости только своего ЖК
    assertUserBelongsToTenant(user, tenantId, 'новостей ЖК');
    return this.announcementsService.getAnnouncements(tenantId, user);
  }

  @Get('tenant/:tenantId/export')
  @Roles(UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.DISPATCHER, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Экспорт истории объявлений и новостей ЖК в формате CSV' })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  async exportAnnouncementsCsv(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Res() res: Response,
  ) {
    assertUserBelongsToTenant(user, tenantId, 'истории объявлений');
    const { buffer, filename } = await this.announcementsService.exportAnnouncementsCsv(
      tenantId,
      user,
      { from, to },
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Post()
  @Roles(UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.DISPATCHER, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Опубликовать новость / экстренное оповещение (УК / ОСИ своего ЖК)' })
  async createAnnouncement(@CurrentUser() user: any, @Body() dto: CreateAnnouncementDto) {
    // Безопасность: tenantId берется из токена сотрудника, исключая создание новостей в чужом ЖК
    const targetTenantId = user.role === UserRole.SUPERADMIN ? (dto.tenantId || user.tenantId) : user.tenantId;

    if (!targetTenantId) {
      throw new BadRequestException({
        code: 'ANNOUNCEMENTS.TENANT_ID_REQUIRED',
        message: 'Не указан идентификатор жилого комплекса',
      });
    }

    return this.announcementsService.createAnnouncement(user.id, targetTenantId, dto);
  }

  @Patch(':id/remove')
  @Roles(UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.DISPATCHER, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Удаление/деактивация опубликованной новости' })
  async removeAnnouncement(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: RemoveAnnouncementDto,
  ) {
    return this.announcementsService.removeAnnouncement(id, user, dto);
  }
}
