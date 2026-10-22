import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ImportsService } from './imports.service';
import {
  PreviewExpensesDto,
  PreviewBudgetDto,
  ApplyImportDto,
  VoidImportDto,
  GetImportsQueryDto,
} from './dto/imports.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Imports (Массовый импорт данных)')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  // -------------------------------------------------------------
  // 1. Предпросмотр импорта расходов (Preview)
  // -------------------------------------------------------------
  @Post([
    'tenants/:tenantId/imports/expenses/preview',
    'finance/tenants/:tenantId/imports/expenses/preview',
  ])
  @Roles(UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Загрузка и предпросмотр расходов из Excel (.xlsx) / CSV' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        mapping: { type: 'string', description: 'JSON с ручным сопоставлением колонок' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 15 * 1024 * 1024, // 15 MB
      },
      fileFilter: (_req, file, callback) => {
        const allowedExts = ['.xlsx', '.csv'];
        const lower = (file.originalname || '').toLowerCase();
        if (!allowedExts.some((ext) => lower.endsWith(ext))) {
          return callback(
            new BadRequestException({
              code: 'IMPORTS.INVALID_FILE_TYPE',
              message: 'Разрешены только файлы Excel (.xlsx) и CSV (.csv)',
            }),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  async previewExpenses(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: PreviewExpensesDto,
  ) {
    return this.importsService.previewExpenses(tenantId, user, file, dto);
  }

  // -------------------------------------------------------------
  // 1b. Предпросмотр импорта бюджета (Budget Preview)
  // -------------------------------------------------------------
  @Post([
    'tenants/:tenantId/imports/budget/preview',
    'finance/tenants/:tenantId/imports/budget/preview',
  ])
  @Roles(UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Загрузка и предпросмотр бюджета из Excel (.xlsx) / CSV' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        year: { type: 'number', example: 2026, description: 'Год бюджета (2000-2100)' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 15 * 1024 * 1024, // 15 MB
      },
      fileFilter: (_req, file, callback) => {
        const allowedExts = ['.xlsx', '.csv'];
        const lower = (file.originalname || '').toLowerCase();
        if (!allowedExts.some((ext) => lower.endsWith(ext))) {
          return callback(
            new BadRequestException({
              code: 'IMPORTS.INVALID_FILE_TYPE',
              message: 'Разрешены только файлы Excel (.xlsx) и CSV (.csv)',
            }),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  async previewBudget(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: PreviewBudgetDto,
    @Query() query: PreviewBudgetDto,
  ) {
    const combinedDto: PreviewBudgetDto = {
      year: dto?.year || query?.year,
    };
    return this.importsService.previewBudget(tenantId, user, file, combinedDto);
  }

  // -------------------------------------------------------------
  // 2. Применение партии расходов (Apply)
  // -------------------------------------------------------------
  @Post(['imports/:batchId/apply', 'finance/imports/:batchId/apply'])
  @Roles(UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Применить проверенные строки партии в журнал расходов' })
  async applyImport(
    @Param('batchId') batchId: string,
    @CurrentUser() user: any,
    @Body() dto: ApplyImportDto,
  ) {
    return this.importsService.applyImport(batchId, user, dto);
  }

  // -------------------------------------------------------------
  // 3. Откат партии расходов (Void)
  // -------------------------------------------------------------
  @Post(['imports/:batchId/void', 'finance/imports/:batchId/void'])
  @Roles(UserRole.HOA_ADMIN, UserRole.SUPERADMIN)
  @ApiOperation({
    summary: 'Аннулировать партию расходов целиком с обязательной причиной',
  })
  async voidImport(
    @Param('batchId') batchId: string,
    @CurrentUser() user: any,
    @Body() dto: VoidImportDto,
  ) {
    return this.importsService.voidImport(batchId, user, dto);
  }

  // -------------------------------------------------------------
  // 4. История партий импорта ЖК
  // -------------------------------------------------------------
  @Get(['tenants/:tenantId/imports', 'finance/tenants/:tenantId/imports'])
  @Roles(UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'История партий импорта ЖК (УК, Председатель, Суперадмин)' })
  async getImportHistory(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
    @Query() query: GetImportsQueryDto,
  ) {
    return this.importsService.getImportHistory(tenantId, user, query);
  }

  // -------------------------------------------------------------
  // 5. Скачивание образца шаблона расходов (Template)
  // -------------------------------------------------------------
  @Get(['imports/templates/expenses.xlsx', 'finance/imports/templates/expenses.xlsx'])
  @Roles(UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Скачать шаблон Excel (.xlsx) с примером расходов и категориями' })
  async downloadExpensesTemplate(@Res() res: Response) {
    const { buffer, filename } = await this.importsService.getExpensesTemplate();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  // -------------------------------------------------------------
  // 6. Скачивание образца шаблона бюджета (Budget Template)
  // -------------------------------------------------------------
  @Get(['imports/templates/budget.xlsx', 'finance/imports/templates/budget.xlsx'])
  @Roles(UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.SUPERADMIN)
  @ApiOperation({ summary: 'Скачать шаблон Excel (.xlsx) с примером бюджета по месяцам' })
  async downloadBudgetTemplate(@Res() res: Response) {
    const { buffer, filename } = await this.importsService.getBudgetTemplate();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }
}
