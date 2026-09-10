import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber, IsOptional, IsEnum, IsBoolean, Min, Max, Matches, IsEmail, IsIn } from 'class-validator';
import { UnitType, OwnershipType, UserRole } from '@prisma/client';

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

export class UpdateResidentStatusDto {
  @ApiProperty({ example: false, description: 'Активен ли аккаунт жильца (при false доступ в приложение блокируется)' })
  @IsBoolean()
  isActive: boolean;
}

export class CreateStaffDto {
  @ApiProperty({ example: 'Иван' })
  @IsNotEmpty({ message: 'Имя обязательно' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Иванов' })
  @IsNotEmpty({ message: 'Фамилия обязательна' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: '+77015550101', description: 'Номер телефона в формате +7XXXXXXXXXX' })
  @IsNotEmpty({ message: 'Номер телефона обязателен' })
  @IsString()
  @Matches(/^\+7\d{10}$/, { message: 'Номер телефона должен быть в формате +7XXXXXXXXXX' })
  phone: string;

  @ApiProperty({ example: 'staff@shanyraq.kz', required: false })
  @IsOptional()
  @IsEmail({}, { message: 'Некорректный формат email' })
  email?: string;

  @ApiProperty({
    enum: [UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.DISPATCHER, UserRole.SECURITY],
    example: UserRole.HOA_ADMIN,
    description: 'Роль сотрудника ЖК: HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER или SECURITY',
  })
  @IsNotEmpty({ message: 'Роль обязательна' })
  @IsIn([UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN, UserRole.DISPATCHER, UserRole.SECURITY], {
    message: 'Недопустимая роль сотрудника. Допустимые роли: HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER, SECURITY',
  })
  role: UserRole;
}

