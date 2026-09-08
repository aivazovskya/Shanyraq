import {
  IsNumber,
  IsOptional,
  IsEnum,
  IsString,
} from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { SosAlertStatus } from '@prisma/client';

export class TriggerSosDto {
  @ApiPropertyOptional({ description: 'Широта GPS-координаты', example: 51.1284 })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Долгота GPS-координаты', example: 71.4305 })
  @IsOptional()
  @IsNumber()
  longitude?: number;
}

export class ResolveSosDto {
  @ApiProperty({
    enum: [SosAlertStatus.RESOLVED, SosAlertStatus.FALSE_ALARM],
    description: 'Статус завершения тревоги',
    example: SosAlertStatus.RESOLVED,
  })
  @IsEnum(SosAlertStatus, {
    message: 'status must be either RESOLVED or FALSE_ALARM',
  })
  status: SosAlertStatus;

  @ApiPropertyOptional({ description: 'Заметка персонала по инциденту', example: 'Охрана прибыла на место, помощь оказана' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class GetTenantAlertsQueryDto {
  @ApiPropertyOptional({ enum: SosAlertStatus, description: 'Фильтр по статусу тревоги' })
  @IsOptional()
  @IsEnum(SosAlertStatus)
  status?: SosAlertStatus;
}
