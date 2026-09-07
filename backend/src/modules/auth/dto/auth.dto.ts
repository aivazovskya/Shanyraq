import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, Length } from 'class-validator';

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
  @Matches(/^\+7\d{10}$/, { message: 'Номер телефона должен быть в формате +7XXXXXXXXXX' })
  phone: string;

  @ApiProperty({ example: '849201', description: '6-значный одноразовый SMS код' })
  @IsNotEmpty()
  @IsString()
  @Length(6, 6, { message: 'SMS-код должен состоять ровно из 6 цифр' })
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

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh токен для обновления сессии' })
  @IsNotEmpty()
  @IsString()
  refreshToken: string;
}
