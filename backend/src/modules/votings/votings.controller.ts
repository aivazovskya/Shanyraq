import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VotingsService } from './votings.service';
import { CreateMeetingDto, CastVoteDto } from './dto/votings.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { Request } from 'express';

@ApiTags('Votings & Meetings (Собрания и Голосования ОСС)')
@Controller('votings')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class VotingsController {
  constructor(private readonly votingsService: VotingsService) {}

  @Get('tenant/:tenantId')
  @ApiOperation({ summary: 'Список собраний и голосований ЖК с актуальным кворумом' })
  async getMeetingsByTenant(@Param('tenantId') tenantId: string) {
    return this.votingsService.getMeetingsByTenant(tenantId);
  }

  @Get(':meetingId')
  @ApiOperation({ summary: 'Детальная информация о собрании, повестке дня и итогах' })
  async getMeetingDetails(@Param('meetingId') meetingId: string) {
    return this.votingsService.getMeetingDetails(meetingId);
  }

  @Post('meetings')
  @Roles(UserRole.HOA_CHAIRMAN, UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Инициировать новое собрание ОСС (Председатель ОСИ / УК)' })
  async createMeeting(@Body() dto: CreateMeetingDto) {
    return this.votingsService.createMeeting(dto);
  }

  @Post('vote')
  @Roles(UserRole.RESIDENT_OWNER, UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Проголосовать по вопросу повестки с весом полезной площади' })
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
  async closeMeeting(@Param('meetingId') meetingId: string) {
    return this.votingsService.closeMeetingAndGenerateProtocol(meetingId);
  }
}
