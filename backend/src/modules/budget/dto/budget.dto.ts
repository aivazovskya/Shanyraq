import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
  IsArray,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GetBudgetQueryDto {
  @ApiPropertyOptional({ description: 'Год бюджета (2000-2100)', default: 2026 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Год должен быть целым числом' })
  @Min(2000, { message: 'Год должен быть не менее 2000' })
  @Max(2100, { message: 'Год должен быть не более 2100' })
  year?: number = new Date().getFullYear();
}

export class BudgetVsActualQueryDto {
  @ApiPropertyOptional({ description: 'Год для сводки план/факт (2000-2100)', default: 2026 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Год должен быть целым числом' })
  @Min(2000, { message: 'Год должен быть не менее 2000' })
  @Max(2100, { message: 'Год должен быть не более 2100' })
  year?: number = new Date().getFullYear();
}

export class BudgetLineItemDto {
  @ApiPropertyOptional({ description: 'ID существующей строки бюджета (если есть)' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ description: 'Год', example: 2026 })
  @Type(() => Number)
  @IsInt({ message: 'Год должен быть целым числом' })
  @Min(2000, { message: 'Год должен быть не менее 2000' })
  @Max(2100, { message: 'Год должен быть не более 2100' })
  year: number;

  @ApiProperty({ description: 'Месяц (1-12)', example: 1 })
  @Type(() => Number)
  @IsInt({ message: 'Месяц должен быть целым числом от 1 до 12' })
  @Min(1, { message: 'Месяц должен быть от 1 до 12' })
  @Max(12, { message: 'Месяц должен быть от 1 до 12' })
  month: number;

  @ApiProperty({ description: 'Категория расходов/бюджета', example: 'Текущий ремонт' })
  @IsString({ message: 'Категория должна быть строкой' })
  @IsNotEmpty({ message: 'Категория обязательна для заполнения' })
  category: string;

  @ApiProperty({ description: 'Плановая сумма расхода (>= 0)', example: 150000 })
  @Type(() => Number)
  @IsNumber({}, { message: 'Плановая сумма должна быть числом' })
  @Min(0, { message: 'Плановая сумма не может быть отрицательной' })
  plannedAmount: number;

  @ApiPropertyOptional({ description: 'Примечание к строке бюджета' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateBudgetDto {
  @ApiPropertyOptional({ description: 'Массив строк бюджета для сохранения/обновления (до 500 строк)' })
  @IsOptional()
  @IsArray({ message: 'Строки бюджета должны быть массивом' })
  @ArrayMaxSize(500, { message: 'Максимальный размер пакета строк бюджета — 500' })
  @ValidateNested({ each: true })
  @Type(() => BudgetLineItemDto)
  lines?: BudgetLineItemDto[];

  @ApiPropertyOptional({ description: 'Алиас для lines' })
  @IsOptional()
  @IsArray({ message: 'Строки бюджета должны быть массивом' })
  @ArrayMaxSize(500, { message: 'Максимальный размер пакета строк бюджета — 500' })
  @ValidateNested({ each: true })
  @Type(() => BudgetLineItemDto)
  items?: BudgetLineItemDto[];
}

export class DeleteBudgetCategoryQueryDto {
  @ApiProperty({ description: 'Год', example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @ApiProperty({ description: 'Категория для удаления из бюджета', example: 'Текущий ремонт' })
  @IsString()
  @IsNotEmpty()
  category: string;
}
