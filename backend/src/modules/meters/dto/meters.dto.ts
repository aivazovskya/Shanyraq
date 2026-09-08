import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MeterType, ReadingStatus } from '@prisma/client';

export class CreateMeterDto {
  @ApiProperty({ enum: MeterType, description: 'Тип счётчика' })
  @IsEnum(MeterType)
  @IsNotEmpty()
  type: MeterType;

  @ApiPropertyOptional({ description: 'Серийный / заводской номер' })
  @IsString()
  @IsOptional()
  serialNumber?: string;

  @ApiPropertyOptional({ description: 'Базовое (начальное) показание', default: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  initialValue?: number;
}

export class UpdateMeterDto {
  @ApiPropertyOptional({ description: 'Серийный номер' })
  @IsString()
  @IsOptional()
  serialNumber?: string;

  @ApiPropertyOptional({ description: 'Флаг активности' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class SubmitReadingDto {
  @ApiProperty({ description: 'Текущее накопительное показание счётчика' })
  @IsNumber()
  @Min(0)
  value: number;

  @ApiProperty({ description: 'Ссылка на фото подтверждения' })
  @IsString()
  @IsNotEmpty()
  photoUrl: string;

  @ApiProperty({ description: 'Месяц периода (1-12)', minimum: 1, maximum: 12 })
  @IsNumber()
  @Min(1)
  @Max(12)
  month: number;

  @ApiProperty({ description: 'Год периода (например 2026)', minimum: 2020 })
  @IsNumber()
  @Min(2020)
  year: number;
}

export class ReviewReadingDto {
  @ApiProperty({ enum: ReadingStatus, description: 'Статус проверки (VERIFIED или REJECTED)' })
  @IsEnum(ReadingStatus)
  @IsNotEmpty()
  status: ReadingStatus;

  @ApiPropertyOptional({ description: 'Примечание проверяющего (причина отклонения)' })
  @IsString()
  @IsOptional()
  note?: string;
}
