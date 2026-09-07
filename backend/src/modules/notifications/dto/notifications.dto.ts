import { IsString, IsNotEmpty, IsIn } from 'class-validator';
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
