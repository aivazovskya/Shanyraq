import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEnum, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { RequestCategory, RequestPriority, RequestStatus } from '@prisma/client';

export class CreateServiceRequestDto {
  @ApiProperty({ description: 'ID квартиры/помещения' })
  @IsNotEmpty()
  @IsString()
  unitId: string;

  @ApiProperty({ example: 'Протечка трубы под раковиной' })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiProperty({ example: 'Капает соединение под раковиной на кухне, требуется замена прокладки.' })
  @IsNotEmpty()
  @IsString()
  description: string;

  @ApiProperty({ enum: RequestCategory, default: RequestCategory.PLUMBING })
  @IsEnum(RequestCategory)
  category: RequestCategory;

  @ApiProperty({ enum: RequestPriority, default: RequestPriority.MEDIUM })
  @IsEnum(RequestPriority)
  priority: RequestPriority;

  @ApiProperty({ example: ['https://storage.shanyraq.kz/uploads/photo1.jpg'], required: false })
  @IsOptional()
  attachmentUrls?: string[];
}

export class UpdateRequestStatusDto {
  @ApiProperty({ enum: RequestStatus })
  @IsEnum(RequestStatus)
  status: RequestStatus;

  @ApiProperty({ description: 'ID назначенного мастера/исполнителя', required: false })
  @IsOptional()
  @IsString()
  assigneeId?: string;
}

export class AddCommentDto {
  @ApiProperty({ example: 'Мастер прибудет через 20 минут.' })
  @IsNotEmpty()
  @IsString()
  text: string;

  @ApiProperty({ default: false, description: 'Служебная заметка (видна только диспетчерам и мастерам)' })
  @IsOptional()
  isInternal?: boolean;
}

export class RateRequestDto {
  @ApiProperty({ example: 5, description: 'Оценка качества работы (1-5 звезд)' })
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({ example: 'Работа выполнена быстро и аккуратно, спасибо!', required: false })
  @IsOptional()
  @IsString()
  feedback?: string;
}
