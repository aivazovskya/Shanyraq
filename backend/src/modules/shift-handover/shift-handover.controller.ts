import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { ShiftHandoverService } from './shift-handover.service';
import { CreateShiftHandoverNoteDto } from './dto/shift-handover.dto';

@ApiTags('Shift Handover (Заметки передачи смены)')
@Controller('shift-handover')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ShiftHandoverController {
  constructor(private readonly shiftHandoverService: ShiftHandoverService) {}

  @Post('tenants/:tenantId/notes')
  @Roles(UserRole.SECURITY, UserRole.DISPATCHER, UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Оставить заметку передачи смены (охрана/диспетчерская/УК)' })
  async createNote(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateShiftHandoverNoteDto,
  ) {
    return this.shiftHandoverService.createNote(tenantId, user, dto);
  }

  @Get('tenants/:tenantId/notes')
  @Roles(
    UserRole.SECURITY,
    UserRole.DISPATCHER,
    UserRole.HOA_ADMIN,
    UserRole.HOA_CHAIRMAN,
    UserRole.SUPERADMIN,
  )
  @ApiOperation({ summary: 'Последние 50 заметок передачи смены ЖК (председатель ОСИ — только чтение)' })
  async getNotes(@Param('tenantId') tenantId: string, @CurrentUser() user: any) {
    return this.shiftHandoverService.getNotes(tenantId, user);
  }
}
