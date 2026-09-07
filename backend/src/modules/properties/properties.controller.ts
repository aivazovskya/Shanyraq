import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PropertiesService } from './properties.service';
import { CreateTenantDto, CreateUnitDto, ClaimOwnershipDto, VerifyOwnershipDto } from './dto/properties.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Properties & Units (ЖК, Дома, Квартиры)')
@Controller('properties')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Get('tenants')
  @ApiOperation({ summary: 'Список жилых комплексов' })
  async getAllTenants() {
    return this.propertiesService.getAllTenants();
  }

  @Get('tenants/:id')
  @ApiOperation({ summary: 'Информация о ЖК с домами и квартирами' })
  async getTenantById(@Param('id') id: string) {
    return this.propertiesService.getTenantById(id);
  }

  @Post('tenants')
  @Roles(UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Создать новый ЖК (только для суперадмина)' })
  async createTenant(@Body() dto: CreateTenantDto) {
    return this.propertiesService.createTenant(dto);
  }

  @Post('buildings/:buildingId/units')
  @Roles(UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Добавить квартиру/помещение в блок ЖК' })
  async addUnit(@Param('buildingId') buildingId: string, @Body() dto: CreateUnitDto) {
    return this.propertiesService.addUnit(buildingId, dto);
  }

  @Post('ownerships/claim')
  @ApiOperation({ summary: 'Подать заявку на привязку квартиры/помещения к своему аккаунту' })
  async claimOwnership(@CurrentUser('id') userId: string, @Body() dto: ClaimOwnershipDto) {
    return this.propertiesService.claimOwnership(userId, dto);
  }

  @Get('tenants/:tenantId/pending-verifications')
  @Roles(UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.DISPATCHER)
  @ApiOperation({ summary: 'Список заявок на подтверждение прав собственности для УК/ОСИ' })
  async getPendingVerifications(@Param('tenantId') tenantId: string) {
    return this.propertiesService.getPendingVerifications(tenantId);
  }

  @Patch('ownerships/:id/verify')
  @Roles(UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.DISPATCHER)
  @ApiOperation({ summary: 'Верифицировать право собственности (Одобрить/Отклонить)' })
  async verifyOwnership(@Param('id') id: string, @Body() dto: VerifyOwnershipDto) {
    return this.propertiesService.verifyOwnership(id, dto.isVerified);
  }
}
