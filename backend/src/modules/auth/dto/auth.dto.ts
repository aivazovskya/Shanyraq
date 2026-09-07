import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class RequestOtpDto {
  @ApiProperty({ example: '+77015550101', description: 'Номер телефона в международном формате (+7XXXXXXXXXX)' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\+7\d{10}$/, { message: 'Номер телефона должен быть в формате +7XXXXXXXXXX' })
  phone: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '+77015550101' })
  @IsNotEmpty()
  @IsString()
  phone: string;

  @ApiProperty({ example: '1234', description: '4-значный одноразовый SMS код' })
  @IsNotEmpty()
  @IsString()
  code: string;
}

export class LoginPasswordDto {
  @ApiProperty({ example: '+77001000001', description: 'Телефон или Email' })
  @IsNotEmpty()
  @IsString()
  login: string;

  @ApiProperty({ example: 'Shanyraq2026!' })
  @IsNotEmpty()
  @IsString()
  password: string;
}
