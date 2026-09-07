import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/announcements.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Announcements & News (Лента новостей и оповещений)')
@Controller('announcements')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get('tenant/:tenantId')
  @ApiOperation({ summary: 'Лента новостей и оповещений жилого комплекса' })
  async getAnnouncements(@Param('tenantId') tenantId: string) {
    return this.announcementsService.getAnnouncements(tenantId);
  }

  @Post()
  @Roles(UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.DISPATCHER, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Опубликовать новость / экстренное оповещение (УК / ОСИ)' })
  async createAnnouncement(@CurrentUser('id') authorId: string, @Body() dto: CreateAnnouncementDto) {
    return this.announcementsService.createAnnouncement(authorId, dto);
  }
}
