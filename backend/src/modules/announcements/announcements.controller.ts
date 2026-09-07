import { Controller, Get, Post, Body, Param, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/announcements.dto';
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
    return this.announcementsService.getAnnouncements(tenantId);
  }

  @Post()
  @Roles(UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.DISPATCHER, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Опубликовать новость / экстренное оповещение (УК / ОСИ своего ЖК)' })
  async createAnnouncement(@CurrentUser() user: any, @Body() dto: CreateAnnouncementDto) {
    // Безопасность: tenantId берется из токена сотрудника, исключая создание новостей в чужом ЖК
    const targetTenantId = user.role === UserRole.SUPERADMIN ? (dto.tenantId || user.tenantId) : user.tenantId;

    if (!targetTenantId) {
      throw new BadRequestException('Не указан идентификатор жилого комплекса');
    }

    return this.announcementsService.createAnnouncement(user.id, targetTenantId, dto);
  }
}
