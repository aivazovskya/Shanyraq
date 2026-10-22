import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  IsNumber,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ImportKind, ImportStatus, ExpenseSource } from '@prisma/client';

export class ColumnMappingDto {
  @ApiPropertyOptional({ description: 'Имя или индекс колонки даты' })
  @IsOptional()
  date?: string | number;

  @ApiPropertyOptional({ description: 'Имя или индекс колонки суммы' })
  @IsOptional()
  amount?: string | number;

  @ApiPropertyOptional({ description: 'Имя или индекс колонки статьи/категории' })
  @IsOptional()
  category?: string | number;

  @ApiPropertyOptional({ description: 'Имя или индекс колонки контрагента' })
  @IsOptional()
  counterparty?: string | number;

  @ApiPropertyOptional({ description: 'Имя или индекс колонки номера документа' })
  @IsOptional()
  documentNumber?: string | number;

  @ApiPropertyOptional({ description: 'Имя или индекс колонки описания' })
  @IsOptional()
  description?: string | number;
}

export class PreviewExpensesDto {
  @ApiPropertyOptional({ type: ColumnMappingDto, description: 'Ручной маппинг колонок (JSON)' })
  @IsOptional()
  mapping?: ColumnMappingDto | string;
}

export class PreviewBudgetDto {
  @ApiPropertyOptional({ description: 'Год бюджета (2000-2100)', example: 2026 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}

export class ApplyImportDto {
  @ApiPropertyOptional({
    type: [Number],
    description: 'Индексы строк (начиная с 0), которые необходимо пропустить',
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Type(() => Number)
  rowIndexesToSkip?: number[];

  @ApiPropertyOptional({
    description: 'Подтверждение создания новых категорий расходов, обнаруженных в файле',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === 1 || value === '1') {
      return true;
    }
    if (value === false || value === 'false' || value === 0 || value === '0') {
      return false;
    }
    return value;
  })
  @IsBoolean()
  confirmNewCategories?: boolean;
}

export class VoidImportDto {
  @ApiProperty({
    example: 'Ошибочно загружен файл за предыдущий квартал',
    description: 'Обязательная причина аннулирования партии',
  })
  @IsNotEmpty({ message: 'Причина отката обязательна для заполнения' })
  @IsString()
  reason: string;
}

export class GetImportsQueryDto {
  @ApiPropertyOptional({ enum: ImportKind })
  @IsOptional()
  @IsEnum(ImportKind)
  kind?: ImportKind;

  @ApiPropertyOptional({ enum: ImportStatus })
  @IsOptional()
  @IsEnum(ImportStatus)
  status?: ImportStatus;

  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export interface ParsedExpenseRow {
  rowIndex: number;
  dateRaw: string;
  expenseDate: Date | null;
  amount: number;
  amountRaw: string;
  category: string;
  counterparty?: string | null;
  documentNumber?: string | null;
  description?: string | null;
  isValid: boolean;
  errors: string[];
  isDuplicate: boolean;
  duplicateReason?: string;
  isNewCategory: boolean;
  skip?: boolean;
}

export interface ImportPreviewResult {
  batchId: string;
  tenantId: string;
  fileName: string;
  kind: ImportKind;
  rowsTotal: number;
  validCount: number;
  duplicateCount: number;
  errorCount: number;
  newCategories: string[];
  detectedColumns: Record<string, string | number | null>;
  rows: ParsedExpenseRow[];
}

export interface ParsedBudgetMonthItem {
  month: number;
  plannedAmount: number;
  amountRaw: string;
  willUpdate: boolean;
  isValid: boolean;
  errors: string[];
}

export interface ParsedBudgetCategoryRow {
  rowIndex: number;
  category: string;
  categoryRaw: string;
  year: number;
  months: ParsedBudgetMonthItem[];
  rowTotal: number;
  isValid: boolean;
  errors: string[];
  willUpdateCount: number;
  newCount: number;
  skip?: boolean;
}

export interface BudgetImportPreviewResult {
  batchId: string;
  tenantId: string;
  year: number;
  fileName: string;
  kind: ImportKind;
  rowsTotal: number;
  validCount: number;
  willUpdateCount: number;
  newCount: number;
  errorCount: number;
  categoriesCount: number;
  detectedColumns: {
    categoryColumn: string | number | null;
    monthsMapped: Record<number, string | number>;
  };
  rows: ParsedBudgetCategoryRow[];
}
