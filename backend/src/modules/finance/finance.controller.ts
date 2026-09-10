import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FinanceService } from './finance.service';
import {
  CreateTariffDto,
  UpdateTariffDto,
  GenerateChargesDto,
  RecordPaymentDto,
} from './dto/finance.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { assertUserBelongsToTenant } from '../../common/guards/tenant.guard';
import { UserRole } from '@prisma/client';

@ApiTags('Finance & Personal Accounts (Лицевые счета и начисления)')
@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  // -------------------------------------------------------------
  // Тарифы ЖК
  // -------------------------------------------------------------

  @Get('tenants/:tenantId/tariffs')
  @Roles(UserRole.HOA_ADMIN, UserRole.SUPERADMIN, UserRole.HOA_CHAIRMAN)
  @ApiOperation({ summary: 'Список тарифов ЖК' })
  async getTariffs(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
  ) {
    assertUserBelongsToTenant(user, tenantId, 'тарифов');
    return this.financeService.getTariffs(tenantId);
  }

  @Post('tenants/:tenantId/tariffs')
  @Roles(UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Создать новый тариф ЖК (только УК и суперадмин)' })
  async createTariff(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateTariffDto,
  ) {
    assertUserBelongsToTenant(user, tenantId, 'тарифов');
    return this.financeService.createTariff(tenantId, dto);
  }

  @Patch('tariffs/:id')
  @Roles(UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Редактировать тариф ЖК' })
  async updateTariff(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateTariffDto,
  ) {
    return this.financeService.updateTariff(id, user, dto);
  }

  @Delete('tariffs/:id')
  @Roles(UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Деактивировать тариф ЖК (мягкое удаление)' })
  async deleteTariff(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.financeService.deleteTariff(id, user);
  }

  // -------------------------------------------------------------
  // Начисления
  // -------------------------------------------------------------

  @Post('tenants/:tenantId/generate-charges')
  @Roles(UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Массовое начисление по тарифам за период (месяц/год)' })
  async generateCharges(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: GenerateChargesDto,
  ) {
    assertUserBelongsToTenant(user, tenantId, 'начислений');
    return this.financeService.generateCharges(tenantId, dto);
  }

  // -------------------------------------------------------------
  // Оплаты
  // -------------------------------------------------------------

  @Post('accounts/:accountId/payments')
  @Roles(UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Внести оплату по лицевому счету (вручную сотрудником)' })
  async recordPayment(
    @Param('accountId') accountId: string,
    @CurrentUser() user: any,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.financeService.recordPayment(accountId, user, dto);
  }

  // -------------------------------------------------------------
  // Лицевые счета (Сотрудники и Жильцы)
  // -------------------------------------------------------------

  @Get('tenants/:tenantId/accounts')
  @Roles(UserRole.HOA_ADMIN, UserRole.SUPERADMIN, UserRole.HOA_CHAIRMAN)
  @ApiOperation({ summary: 'Реестр лицевых счетов ЖК со сводными балансами' })
  async getTenantAccounts(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.financeService.getTenantAccounts(tenantId, user);
  }

  @Get('my-accounts')
  @Roles(
    UserRole.RESIDENT_OWNER,
    UserRole.RESIDENT_TENANT,
    UserRole.HOA_ADMIN,
    UserRole.SUPERADMIN,
    UserRole.HOA_CHAIRMAN,
  )
  @ApiOperation({ summary: 'Лицевые счета текущего жильца (для мобильного приложения)' })
  async getMyAccounts(@CurrentUser('id') userId: string) {
    return this.financeService.getMyAccounts(userId);
  }

  @Get('accounts/:accountId/statement')
  @Roles(
    UserRole.HOA_ADMIN,
    UserRole.SUPERADMIN,
    UserRole.HOA_CHAIRMAN,
    UserRole.RESIDENT_OWNER,
  )
  @ApiOperation({ summary: 'Скачать выписку по лицевому счету в формате PDF' })
  async downloadStatement(
    @Param('accountId') accountId: string,
    @CurrentUser() user: any,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Res() res?: Response,
  ) {
    const query = {
      month: month ? parseInt(month, 10) : undefined,
      year: year ? parseInt(year, 10) : undefined,
    };
    const { buffer, filename } =
      await this.financeService.generateAccountStatementPdf(
        accountId,
        user,
        query,
      );

    res!.setHeader('Content-Type', 'application/pdf');
    res!.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res!.setHeader('Content-Length', buffer.length);
    res!.end(buffer);
  }

  @Get('accounts/:accountId')
  @Roles(
    UserRole.HOA_ADMIN,
    UserRole.SUPERADMIN,
    UserRole.HOA_CHAIRMAN,
    UserRole.RESIDENT_OWNER,
  )
  @ApiOperation({ summary: 'Детальная карточка лицевого счета с историей начислений и оплат' })
  async getAccountById(
    @Param('accountId') accountId: string,
    @CurrentUser() user: any,
  ) {
    return this.financeService.getAccountById(accountId, user);
  }
}
