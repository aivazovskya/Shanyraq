import { IsString, IsNotEmpty, IsIn, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDeviceDto {
  @ApiProperty({
    example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
    description: 'Device push token (Expo Push Token или FCM/APNs token)',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    example: 'expo',
    enum: ['ios', 'android', 'expo'],
    description: 'Платформа устройства',
  })
  @IsString()
  @IsIn(['ios', 'android', 'expo'])
  platform: string;
}

export class UnregisterDeviceDto {
  @ApiProperty({
    example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
    description: 'Токен устройства для удаления при логауте',
  })
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class GetNotificationsQueryDto {
  @ApiProperty({
    required: false,
    default: 20,
    description: 'Количество записей (по умолчанию 20, макс 100)',
  })
  @IsOptional()
  take?: number;

  @ApiProperty({
    required: false,
    default: 0,
    description: 'Смещение выборки',
  })
  @IsOptional()
  skip?: number;
}

export class UpdateNotificationPreferencesDto {
  @ApiProperty({ required: false, description: 'Уведомления чата (сообщения от жителей/диспетчеров)' })
  @IsOptional()
  @IsBoolean()
  CHAT?: boolean;

  @ApiProperty({ required: false, description: 'Уведомления по заявкам (статусы, комментарии)' })
  @IsOptional()
  @IsBoolean()
  SERVICE_REQUEST?: boolean;

  @ApiProperty({ required: false, description: 'Объявления от управляющей компании' })
  @IsOptional()
  @IsBoolean()
  ANNOUNCEMENT?: boolean;

  @ApiProperty({ required: false, description: 'Финансовые напоминания и счета' })
  @IsOptional()
  @IsBoolean()
  FINANCE?: boolean;
}

