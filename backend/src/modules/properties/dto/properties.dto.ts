import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber, IsOptional, IsEnum, Min, Max } from 'class-validator';
import { UnitType, OwnershipType } from '@prisma/client';

export class CreateTenantDto {
  @ApiProperty({ example: 'ЖК «Шаңырақ Премиум»' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 'ул. Достык, д. 15/1' })
  @IsNotEmpty()
  @IsString()
  address: string;

  @ApiProperty({ example: 'Астана' })
  @IsOptional()
  @IsString()
  city?: string;
}

export class CreateUnitDto {
  @ApiProperty({ example: '42' })
  @IsNotEmpty()
  @IsString()
  unitNumber: string;

  @ApiProperty({ example: 4 })
  @IsNumber()
  floor: number;

  @ApiProperty({ example: 1 })
  @IsNumber()
  entrance: number;

  @ApiProperty({ enum: UnitType, example: UnitType.APARTMENT })
  @IsEnum(UnitType)
  type: UnitType;

  @ApiProperty({ example: 75.4, description: 'Полезная площадь помещения в кв.м' })
  @IsNumber()
  @Min(1.0, { message: 'Площадь помещения должна быть не менее 1 кв.м' })
  area: number;

  @ApiProperty({ example: '21:320:135:042', required: false })
  @IsOptional()
  @IsString()
  cadastralNumber?: string;
}

export class ClaimOwnershipDto {
  @ApiProperty({ description: 'ID квартиры/помещения' })
  @IsNotEmpty()
  @IsString()
  unitId: string;

  @ApiProperty({ enum: OwnershipType, default: OwnershipType.OWNER })
  @IsEnum(OwnershipType)
  ownershipType: OwnershipType;

  @ApiProperty({ example: 100.0, description: 'Заявляемая доля владения (от 0.01 до 100%)' })
  @IsOptional()
  @IsNumber()
  @Min(0.01, { message: 'Доля должна быть больше 0' })
  @Max(100.0, { message: 'Доля не может превышать 100%' })
  sharePercent?: number;

  @ApiProperty({ example: 'https://storage.shanyraq.kz/docs/spravka_egov_42.pdf', required: false })
  @IsOptional()
  @IsString()
  verificationDoc?: string;
}

export class VerifyOwnershipDto {
  @ApiProperty({ example: true })
  isVerified: boolean;

  @ApiProperty({ example: 100.0, required: false, description: 'Проверенная сотрудником УК доля (по выписке eGov)' })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(100.0)
  approvedSharePercent?: number;
}
