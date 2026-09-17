import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PropertiesService } from './properties.service';
import { CreateTenantDto, CreateUnitDto, ClaimOwnershipDto, VerifyOwnershipDto, UpdateResidentStatusDto, CreateStaffDto, UpdateStaffDto } from './dto/properties.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { assertUserBelongsToTenant } from '../../common/guards/tenant.guard';
import { UserRole } from '@prisma/client';

@ApiTags('Properties & Units (ЖК, Дома, Квартиры)')
@Controller('properties')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Get('search')
  @ApiOperation({ summary: 'Поиск жилых комплексов по названию, городу или адресу (для онбординга жильца)' })
  @ApiQuery({ name: 'query', required: false, description: 'Поисковая строка' })
  async searchTenants(@Query('query') query?: string) {
    return this.propertiesService.searchTenants(query);
  }

  @Get('tenants/:id/structure')
  @ApiOperation({ summary: 'Получить структуру ЖК: список блоков (домов) и квартир для выбора жильцом' })
  async getTenantStructure(@Param('id') id: string) {
    return this.propertiesService.getTenantStructure(id);
  }

  @Get('tenants')
  @ApiOperation({ summary: 'Список жилых комплексов' })
  async getAllTenants() {
    return this.propertiesService.getAllTenants();
  }

  @Get('tenants/:id')
  @ApiOperation({ summary: 'Информация о ЖК с домами и квартирами' })
  async getTenantById(@Param('id') id: string, @CurrentUser() user: any) {
    // Аудит безопасности: доступ к данным ЖК разрешен только для персонала этого ЖК или SUPERADMIN
    assertUserBelongsToTenant(user, id, 'жилого комплекса');
    return this.propertiesService.getTenantById(id, user);
  }

  @Post('tenants')
  @Roles(UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Создать новый ЖК (только для суперадмина)' })
  async createTenant(@Body() dto: CreateTenantDto) {
    return this.propertiesService.createTenant(dto);
  }

  @Post('tenants/:tenantId/staff')
  @Roles(UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Создать сотрудника ЖК с генерацией одноразового временного пароля (только для SUPERADMIN)' })
  async createStaff(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateStaffDto,
  ) {
    return this.propertiesService.createStaff(tenantId, dto);
  }

  @Get('tenants/:tenantId/staff')
  @Roles(UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Получить список сотрудников ЖК (только для SUPERADMIN)' })
  async getStaffMembers(@Param('tenantId') tenantId: string) {
    return this.propertiesService.getStaffMembers(tenantId);
  }

  @Patch('tenants/:tenantId/staff/:userId')
  @Roles(UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Обновить данные или статус активности сотрудника ЖК (только для SUPERADMIN)' })
  async updateStaff(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.propertiesService.updateStaff(tenantId, userId, dto);
  }

  @Post('buildings/:buildingId/units')
  @Roles(UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Добавить квартиру/помещение в блок ЖК' })
  async addUnit(
    @Param('buildingId') buildingId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateUnitDto,
  ) {
    return this.propertiesService.addUnit(buildingId, user, dto);
  }

  @Post('ownerships/claim')
  @ApiOperation({ summary: 'Подать заявку на привязку квартиры/помещения к своему аккаунту' })
  async claimOwnership(@CurrentUser('id') userId: string, @Body() dto: ClaimOwnershipDto) {
    return this.propertiesService.claimOwnership(userId, dto);
  }

  @Get('tenants/:tenantId/pending-verifications')
  @Roles(UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.DISPATCHER, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Список заявок на подтверждение прав собственности для УК/ОСИ своего ЖК' })
  async getPendingVerifications(@Param('tenantId') tenantId: string, @CurrentUser() user: any) {
    // Аудит безопасности: BOLA защита — УК видит заявки на верификацию только своего ЖК
    assertUserBelongsToTenant(user, tenantId, 'заявок на верификацию прав');
    return this.propertiesService.getPendingVerifications(tenantId);
  }

  @Patch('ownerships/:id/verify')
  @Roles(UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.DISPATCHER, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Верифицировать право собственности и скорректировать долю (Одобрить/Отклонить)' })
  async verifyOwnership(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: VerifyOwnershipDto,
  ) {
    return this.propertiesService.verifyOwnership(id, user, dto);
  }

  @Get('tenants/:tenantId/residents')
  @Roles(UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.DISPATCHER, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Реестр подтвержденных жильцов жилого комплекса' })
  @ApiQuery({ name: 'search', required: false, description: 'Поиск по ФИО, телефону или номеру квартиры' })
  async getConfirmedResidents(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
    @Query('search') search?: string,
  ) {
    assertUserBelongsToTenant(user, tenantId, 'реестра жильцов');
    return this.propertiesService.getConfirmedResidents(tenantId, search);
  }

  @Get('tenants/:tenantId/residents/export')
  @Roles(UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.DISPATCHER, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Экспорт реестра подтвержденных жильцов в CSV' })
  @ApiQuery({ name: 'search', required: false, description: 'Поиск по ФИО, телефону или номеру квартиры' })
  async exportConfirmedResidents(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
    @Res() res: Response,
    @Query('search') search?: string,
  ) {
    assertUserBelongsToTenant(user, tenantId, 'реестра жильцов');
    const { buffer, filename } = await this.propertiesService.exportConfirmedResidentsCsv(
      tenantId,
      search,
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get('tenants/:tenantId/residents/:userId')
  @Roles(UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.DISPATCHER, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Детальная карточка жильца со всеми квартирами' })
  async getResidentDetail(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: any,
  ) {
    assertUserBelongsToTenant(user, tenantId, 'данных жильца');
    return this.propertiesService.getResidentDetail(tenantId, userId);
  }

  @Patch('residents/:userId/status')
  @Roles(UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.DISPATCHER, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Активировать / деактивировать аккаунт жильца' })
  async updateResidentStatus(
    @Param('userId') userId: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateResidentStatusDto,
  ) {
    return this.propertiesService.updateResidentStatus(userId, user, dto);
  }

  @Delete('ownerships/:id')
  @Roles(UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.DISPATCHER, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Отвязать подтвержденную квартиру от жильца' })
  async unlinkOwnership(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.propertiesService.unlinkOwnership(id, user);
  }
}
