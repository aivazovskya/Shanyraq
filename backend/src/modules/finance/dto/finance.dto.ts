import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber, IsOptional, IsEnum, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { ChargeCalculationMethod } from '@prisma/client';

export class CreateTariffDto {
  @ApiProperty({ example: 'Коммунальные услуги' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ enum: ChargeCalculationMethod, default: ChargeCalculationMethod.FLAT })
  @IsOptional()
  @IsEnum(ChargeCalculationMethod)
  calculationMethod?: ChargeCalculationMethod;

  @ApiProperty({ example: 110.0, description: 'Фиксированная ставка (тг) или ставка за м²' })
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
