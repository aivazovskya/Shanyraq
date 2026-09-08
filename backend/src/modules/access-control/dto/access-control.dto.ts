import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsDateString,
  Matches,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { AccessPointType } from '@prisma/client';

export class OpenBarrierDto {
  @ApiProperty({ description: 'ID точки доступа (шлагбаума или ворот)' })
  @IsNotEmpty()
  @IsString()
  accessPointId: string;

  @ApiProperty({ example: '8392', description: 'PIN-код доступа (4 или 6 цифр)' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}$|^\d{6}$/, { message: 'PIN-код должен состоять ровно из 4 или 6 цифр' })
  pin: string;

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

export class CreateAccessPointDto {
  @ApiProperty({ example: 'Главный шлагбаум (Въезд)', description: 'Название точки доступа' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ enum: AccessPointType, example: AccessPointType.DOOR_INTERCOM, description: 'Тип точки доступа' })
  @IsNotEmpty()
  @IsEnum(AccessPointType)
  type: AccessPointType;

  @ApiProperty({ example: 'HIKVISION_ISAPI', required: false, description: 'Тип контроллера (PAL_ES, HIKVISION_ISAPI, MQTT_RELAY, RTSP_CAMERA)' })
  @IsOptional()
  @IsString()
  controllerType?: string;

  @ApiProperty({ example: 'http://192.168.1.120', required: false, description: 'URL API контроллера или домофона' })
  @IsOptional()
  @IsString()
  endpointUrl?: string;

  @ApiProperty({ example: 'rtsp://admin:pass@192.168.1.120:554/Streaming/Channels/101', required: false, description: 'Скрытый RTSP поток' })
  @IsOptional()
  @IsString()
  rtspStreamUrl?: string;

  @ApiProperty({ example: 'intercom_entrance_1', required: false, description: 'Имя потока в go2rtc' })
  @IsOptional()
  @IsString()
  streamName?: string;
}

export class UpdateAccessPointDto {
  @ApiProperty({ example: 'Главный шлагбаум (Въезд)', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ enum: AccessPointType, required: false })
  @IsOptional()
  @IsEnum(AccessPointType)
  type?: AccessPointType;

  @ApiProperty({ example: 'HIKVISION_ISAPI', required: false })
  @IsOptional()
  @IsString()
  controllerType?: string;

  @ApiProperty({ example: 'http://192.168.1.120', required: false })
  @IsOptional()
  @IsString()
  endpointUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  rtspStreamUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  streamName?: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

