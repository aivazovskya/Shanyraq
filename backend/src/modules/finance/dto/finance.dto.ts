import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber, IsOptional, IsEnum, IsBoolean, IsInt, Min, Max, IsISO8601 } from 'class-validator';
import { Type } from 'class-transformer';
import { ChargeCalculationMethod, MeterType } from '@prisma/client';
import { TariffBreakdownItem } from '../../analytics/dto/analytics.dto';

export class CreateTariffDto {
  @ApiProperty({ example: 'Коммунальные услуги' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ enum: ChargeCalculationMethod, default: ChargeCalculationMethod.FLAT })
  @IsOptional()
  @IsEnum(ChargeCalculationMethod)
  calculationMethod?: ChargeCalculationMethod;

  @ApiPropertyOptional({ enum: MeterType, description: 'Тип счётчика (требуется при PER_CONSUMPTION)' })
  @IsOptional()
  @IsEnum(MeterType)
  meterType?: MeterType;

  @ApiProperty({ example: 110.0, description: 'Фиксированная ставка (тг), ставка за м² или за единицу расхода' })
  @IsNumber()
  @Min(0)
  rate: number;
}

export class UpdateTariffDto {
  @ApiPropertyOptional({ example: 'Эксплуатационные расходы' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: ChargeCalculationMethod })
  @IsOptional()
  @IsEnum(ChargeCalculationMethod)
  calculationMethod?: ChargeCalculationMethod;

  @ApiPropertyOptional({ enum: MeterType })
  @IsOptional()
  @IsEnum(MeterType)
  meterType?: MeterType;

  @ApiPropertyOptional({ example: 120.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  rate?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class GenerateChargesDto {
  @ApiProperty({ example: 10, description: 'Месяц периода (1-12)' })
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiProperty({ example: 2026, description: 'Год периода' })
  @IsInt()
  @Min(2020)
  @Max(2100)
  year: number;
}

export class RecordPaymentDto {
  @ApiProperty({ example: 8000.0, description: 'Сумма принятой оплаты (тг)' })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ example: 'Оплата через кассу ОСИ (наличные)' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateExpenseDto {
  @ApiProperty({ example: 'Ремонт кровли', description: 'Категория расхода (свободный текст)' })
  @IsNotEmpty()
  @IsString()
  category: string;

  @ApiProperty({ example: 150000.0, description: 'Сумма расхода (тг)' })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ example: '2026-09-20T10:00:00.000Z', description: 'Дата фактической траты' })
  @IsNotEmpty()
  @IsISO8601()
  expenseDate: string;

  @ApiPropertyOptional({ example: 'Закупка гидроизоляционных материалов для блока Б' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class VoidExpenseDto {
  @ApiProperty({ example: 'Ошибочно внесен дублирующий чек от поставщика', description: 'Обязательная причина аннулирования' })
  @IsNotEmpty()
  @IsString()
  reason: string;
}

export class GetExpensesQueryDto {
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ example: 'Ремонт' })
  @IsOptional()
  @IsString()
  category?: string;
}

export class TransparencyReportQueryDto {
  @ApiPropertyOptional({ example: 9, description: 'Месяц периода (1-12)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @ApiPropertyOptional({ example: 2026, description: 'Год периода (например, 2026)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}

export interface TransparencyExpenseCategoryItem {
  category: string;
  amount: number;
}

export interface FinancialTransparencyReport {
  periodMonth: number;
  periodYear: number;
  totalCharged: number;
  totalCollected: number;
  collectionRatePercent: number;
  byTariff: TariffBreakdownItem[];
  totalExpenses: number;
  byExpenseCategory: TransparencyExpenseCategoryItem[];
  netBalance: number;
}
