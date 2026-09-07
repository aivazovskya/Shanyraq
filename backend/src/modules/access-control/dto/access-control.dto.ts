import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsDateString } from 'class-validator';

export class OpenBarrierDto {
  @ApiProperty({ description: 'ID точки доступа (шлагбаума или ворот)' })
  @IsNotEmpty()
  @IsString()
  accessPointId: string;

  @ApiProperty({ description: 'ID квартиры жителя', required: false })
  @IsOptional()
  @IsString()
  unitId?: string;
}

export class CreateGuestPassDto {
  @ApiProperty({ description: 'ID квартиры жителя' })
  @IsNotEmpty()
  @IsString()
  unitId: string;

  @ApiProperty({ example: 'Руслан Сериков' })
  @IsNotEmpty()
  @IsString()
  guestName: string;

  @ApiProperty({ example: '777KZ01', required: false, description: 'Госномер автомобиля' })
  @IsOptional()
  @IsString()
  guestPlateNumber?: string;

  @ApiProperty({ example: '2026-10-10T10:00:00.000Z', description: 'Начало действия пропуска' })
  @IsDateString()
  validFrom: string;

  @ApiProperty({ example: '2026-10-10T22:00:00.000Z', description: 'Окончание действия пропуска' })
  @IsDateString()
  validTo: string;
}
