import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VotingsService } from './votings.service';
import { CreateMeetingDto, CastVoteDto } from './dto/votings.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { assertUserBelongsToTenant } from '../../common/guards/tenant.guard';
import { UserRole } from '@prisma/client';
import { Request } from 'express';

@ApiTags('Votings & Meetings (Собрания и Голосования ОСС)')
@Controller('votings')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class VotingsController {
  constructor(private readonly votingsService: VotingsService) {}

  @Get('tenant/:tenantId')
  @ApiOperation({ summary: 'Список собраний и голосований ЖК с актуальным кворумом (с изоляцией ЖК)' })
  async getMeetingsByTenant(@Param('tenantId') tenantId: string, @CurrentUser() user: any) {
    // Аудит безопасности: BOLA/IDOR защита — житель или сотрудник может запрашивать собрания только своего ЖК
    assertUserBelongsToTenant(user, tenantId, 'собраний ОСС');
    return this.votingsService.getMeetingsByTenant(tenantId);
  }

  @Get(':meetingId')
  @ApiOperation({ summary: 'Детальная информация о собрании, повестке дня и итогах' })
  async getMeetingDetails(@Param('meetingId') meetingId: string, @CurrentUser() user: any) {
    // Сервис выполняет проверку tenant isolation и маскирует персональные данные для жильцов
    return this.votingsService.getMeetingDetails(meetingId, user);
  }

  @Post('meetings')
  @Roles(UserRole.HOA_CHAIRMAN, UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Инициировать новое собрание ОСС (Председатель ОСИ / УК своего ЖК)' })
  async createMeeting(@Body() dto: CreateMeetingDto, @CurrentUser() user: any) {
    // Аудит безопасности: председатель ОСИ / УК может создавать собрания только для своего ЖК
    const targetTenantId = user.role === UserRole.SUPERADMIN ? (dto.tenantId || user.tenantId) : user.tenantId;
    return this.votingsService.createMeeting(targetTenantId, dto);
  }

  @Post('vote')
  @Roles(UserRole.RESIDENT_OWNER, UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Проголосовать по вопросу повестки с весом полезной площади и SMS-OTP' })
  async castVote(@CurrentUser('id') userId: string, @Body() dto: CastVoteDto, @Req() req: Request) {
    const clientMeta = {
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
    };
    return this.votingsService.castVote(userId, dto, clientMeta);
  }

  @Post(':meetingId/close')
  @Roles(UserRole.HOA_CHAIRMAN, UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Завершить голосование и сгенерировать официальный протокол собрания' })
  async closeMeeting(@Param('meetingId') meetingId: string, @CurrentUser() user: any) {
    return this.votingsService.closeMeetingAndGenerateProtocol(meetingId, user);
  }
}
