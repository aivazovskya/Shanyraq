import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { BudgetService } from './budget.service';
import {
  GetBudgetQueryDto,
  BudgetVsActualQueryDto,
  UpdateBudgetDto,
  DeleteBudgetCategoryQueryDto,
} from './dto/budget.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Budget & Plan/Fact (Бюджет и план/факт)')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class BudgetController {
  constructor(private readonly budgetService: BudgetService) {}

  // -------------------------------------------------------------
  // 1. Получить строки бюджета за год
  // -------------------------------------------------------------
  @Get(['tenants/:tenantId/budget', 'finance/tenants/:tenantId/budget'])
  @Roles(UserRole.HOA_ADMIN, UserRole.SUPERADMIN, UserRole.HOA_CHAIRMAN)
  @ApiOperation({ summary: 'Получить строки бюджета ЖК за выбранный год' })
  async getBudgetLines(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
    @Query() query: GetBudgetQueryDto,
  ) {
    return this.budgetService.getBudgetLines(tenantId, user, query);
  }

  // -------------------------------------------------------------
  // 2. Сохранить / обновить строки бюджета (Upsert)
  // -------------------------------------------------------------
  @Put(['tenants/:tenantId/budget', 'finance/tenants/:tenantId/budget'])
  @Roles(UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Сохранить или обновить строки бюджета ЖК' })
  async updateBudget(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.budgetService.updateBudgetLines(tenantId, user, body);
  }

  // -------------------------------------------------------------
  // 3. Удалить категорию бюджета за год
  // -------------------------------------------------------------
  @Delete([
    'tenants/:tenantId/budget/category',
    'finance/tenants/:tenantId/budget/category',
    'tenants/:tenantId/budget',
    'finance/tenants/:tenantId/budget',
  ])
  @Roles(UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Удалить категорию из бюджета за выбранный год' })
  async deleteBudgetCategory(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
    @Query() query: DeleteBudgetCategoryQueryDto,
  ) {
    return this.budgetService.deleteBudgetCategory(tenantId, user, query);
  }

  // -------------------------------------------------------------
  // 4. Сводка План / Факт (Budget vs Actual)
  // -------------------------------------------------------------
  @Get([
    'finance/tenants/:tenantId/budget-vs-actual',
    'tenants/:tenantId/budget-vs-actual',
  ])
  @Roles(UserRole.HOA_ADMIN, UserRole.SUPERADMIN, UserRole.HOA_CHAIRMAN)
  @ApiOperation({
    summary: 'Сводный отчет План/Факт по месяцам, кварталам и году с флагами перерасхода',
  })
  async getBudgetVsActual(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
    @Query() query: BudgetVsActualQueryDto,
  ) {
    return this.budgetService.getBudgetVsActual(tenantId, user, query);
  }

  // -------------------------------------------------------------
  // 5. Экспорт План / Факт в многолистовой Excel (.xlsx)
  // -------------------------------------------------------------
  @Get([
    'finance/tenants/:tenantId/budget-vs-actual/export.xlsx',
    'tenants/:tenantId/budget-vs-actual/export.xlsx',
  ])
  @Roles(UserRole.HOA_ADMIN, UserRole.SUPERADMIN, UserRole.HOA_CHAIRMAN)
  @ApiOperation({
    summary: 'Экспорт сводки План/Факт в многолистовую книгу Excel (.xlsx)',
  })
  async exportBudgetVsActualXlsx(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
    @Query() query: BudgetVsActualQueryDto,
    @Res() res: Response,
  ) {
    const { buffer, filename } =
      await this.budgetService.exportBudgetVsActualXlsx(tenantId, user, query);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }
}
