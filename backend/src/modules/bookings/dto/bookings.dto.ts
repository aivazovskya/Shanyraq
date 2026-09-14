import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsInt,
  Min,
  IsBoolean,
  IsISO8601,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { BookableResourceType, BookingStatus } from '@prisma/client';

export class CreateBookableResourceDto {
  @ApiProperty({ description: 'Название пространства', example: 'Барбекю-зона №1' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: BookableResourceType, description: 'Тип пространства' })
  @IsEnum(BookableResourceType)
  type: BookableResourceType;

  @ApiPropertyOptional({ description: 'Описание правил или удобств' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Время открытия в формате HH:mm', example: '08:00' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'operatingHoursStart must be in HH:mm format' })
  operatingHoursStart?: string;

  @ApiPropertyOptional({ description: 'Время закрытия в формате HH:mm', example: '22:00' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'operatingHoursEnd must be in HH:mm format' })
  operatingHoursEnd?: string;

  @ApiPropertyOptional({ description: 'Максимальная длительность одного бронирования в минутах', example: 120 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxDurationMinutes?: number;

  @ApiPropertyOptional({ description: 'Активен ли ресурс для бронирования', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateBookableResourceDto extends PartialType(CreateBookableResourceDto) {}

export class CreateBookingDto {
  @ApiProperty({ description: 'Время начала (ISO-8601 UTC)', example: '2026-09-10T14:00:00.000Z' })
  @IsISO8601()
  startTime: string;

  @ApiProperty({ description: 'Время окончания (ISO-8601 UTC)', example: '2026-09-10T16:00:00.000Z' })
  @IsISO8601()
  endTime: string;

  @ApiPropertyOptional({ description: 'Примечание к бронированию', example: 'Семейное мероприятие' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class JoinWaitlistDto {
  @ApiProperty({ description: 'Время начала (ISO-8601 UTC)', example: '2026-09-10T14:00:00.000Z' })
  @IsISO8601()
  startTime: string;

  @ApiProperty({ description: 'Время окончания (ISO-8601 UTC)', example: '2026-09-10T16:00:00.000Z' })
  @IsISO8601()
  endTime: string;
}

export class GetAvailabilityQueryDto {
  @ApiProperty({ description: 'Начало интервала выборки (ISO-8601)' })
  @IsISO8601()
  from: string;

  @ApiProperty({ description: 'Конец интервала выборки (ISO-8601)' })
  @IsISO8601()
  to: string;
}

export class GetBookingsQueryDto {
  @ApiPropertyOptional({ description: 'Фильтр по ресурсу' })
  @IsOptional()
  @IsString()
  resourceId?: string;

  @ApiPropertyOptional({ description: 'С даты (ISO-8601)' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'По дату (ISO-8601)' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
