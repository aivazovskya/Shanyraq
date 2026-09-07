import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ServiceRequestsService } from './service-requests.service';
import { CreateServiceRequestDto, UpdateRequestStatusDto, AddCommentDto, RateRequestDto } from './dto/service-requests.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestStatus, UserRole } from '@prisma/client';

@ApiTags('Service Requests (Заявки и Service Desk)')
@Controller('service-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ServiceRequestsController {
  constructor(private readonly serviceRequestsService: ServiceRequestsService) {}

  @Post()
  @ApiOperation({ summary: 'Подать новую заявку на обслуживание с фото' })
  async createRequest(@CurrentUser('id') userId: string, @Body() dto: CreateServiceRequestDto) {
    return this.serviceRequestsService.createRequest(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Получить список заявок (с фильтрацией по статусу и ЖК)' })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: RequestStatus })
  async getRequests(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
    @CurrentUser('tenantId') tenantId: string,
    @Query('status') status?: RequestStatus,
  ) {
    const isStaff = ([UserRole.SUPERADMIN, UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.DISPATCHER] as UserRole[]).includes(role);
    return this.serviceRequestsService.getRequests({
      tenantId: isStaff ? tenantId : undefined,
      userId: isStaff ? undefined : userId,
      status,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Детальная информация о заявке, включая историю переписки' })
  async getRequestById(@Param('id') id: string, @CurrentUser('role') role: UserRole) {
    return this.serviceRequestsService.getRequestById(id, role);
  }

  @Patch(':id/status')
  @Roles(UserRole.DISPATCHER, UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Изменить статус заявки / назначить мастера (Диспетчер)' })
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateRequestStatusDto) {
    return this.serviceRequestsService.updateStatus(id, dto);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Добавить комментарий / сообщение в чат заявки' })
  async addComment(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: AddCommentDto) {
    return this.serviceRequestsService.addComment(id, userId, dto);
  }

  @Post(':id/rate')
  @ApiOperation({ summary: 'Оценить качество выполнения заявки (1-5 звезд)' })
  async rateRequest(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: RateRequestDto) {
    return this.serviceRequestsService.rateRequest(id, userId, dto);
  }
}
