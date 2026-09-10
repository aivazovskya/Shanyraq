import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, Length, IsOptional, MinLength } from 'class-validator';

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

export class SetPinDto {
  @ApiProperty({ example: '8392', description: 'Новый PIN-код доступа (4 или 6 цифр)' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}$|^\d{6}$/, { message: 'PIN-код должен состоять ровно из 4 или 6 цифр' })
  newPin: string;

  @ApiProperty({ example: '1234', description: 'Текущий PIN-код (обязателен, если PIN уже установлен)', required: false })
  @IsOptional()
  @IsString()
  currentPin?: string;
}

export class ResetPinConfirmDto {
  @ApiProperty({ example: '123456', description: '6-значный код подтверждения из SMS' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'SMS-код должен состоять ровно из 6 цифр' })
  otpCode: string;

  @ApiProperty({ example: '8392', description: 'Новый PIN-код доступа (4 или 6 цифр)' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}$|^\d{6}$/, { message: 'PIN-код должен состоять ровно из 4 или 6 цифр' })
  newPin: string;
}

export class SetInitialPasswordDto {
  @ApiProperty({ description: 'Одноразовый токен смены пароля (type: password_change)' })
  @IsNotEmpty()
  @IsString()
  changePasswordToken: string;

  @ApiProperty({ example: 'NewPassword2026!', description: 'Новый пароль (минимум 8 символов)' })
  @IsNotEmpty()
  @IsString()
  @MinLength(8, { message: 'Пароль должен содержать не менее 8 символов' })
  newPassword: string;
}

