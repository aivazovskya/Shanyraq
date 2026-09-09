import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { ChatService } from './chat.service';
import { CreateChatMessageDto } from './dto/chat.dto';

@ApiTags('Chat (Чат с диспетчером УК)')
@Controller('chat')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // =============================================================
  // Resident-facing
  // =============================================================

  @Get('my-conversation')
  @ApiOperation({ summary: 'Получение или открытие диалога жителя с диспетчерской' })
  async getMyConversation(@Request() req: any) {
    return this.chatService.getMyConversation(req.user);
  }

  @Post('my-conversation/messages')
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @ApiOperation({ summary: 'Отправка сообщения жителем в чат с диспетчером' })
  async sendResidentMessage(
    @Request() req: any,
    @Body() dto: CreateChatMessageDto,
  ) {
    return this.chatService.sendResidentMessage(req.user, dto);
  }

  // =============================================================
  // Staff-facing (DISPATCHER, HOA_ADMIN, SUPERADMIN)
  // =============================================================

  @Get('tenants/:tenantId/conversations')
  @Roles(UserRole.DISPATCHER, UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Список всех диалогов ЖК для диспетчера' })
  async getTenantConversations(
    @Param('tenantId') tenantId: string,
    @Request() req: any,
  ) {
    return this.chatService.getTenantConversations(tenantId, req.user);
  }

  @Get('conversations/:id/messages')
  @Roles(UserRole.DISPATCHER, UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Сообщения диалога для диспетчера' })
  async getConversationMessages(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    return this.chatService.getConversationMessages(id, req.user);
  }

  @Post('conversations/:id/messages')
  @Roles(UserRole.DISPATCHER, UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Отправка ответа диспетчером в диалог с жителем' })
  async sendStaffMessage(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: CreateChatMessageDto,
  ) {
    return this.chatService.sendStaffMessage(id, req.user, dto);
  }
}
