import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum UploadCategory {
  MEDIA = 'media',         // Фото к заявкам Service Desk, видео
  DOCUMENT = 'document',   // Сканы документов права собственности, договоры
}

export class PresignUploadDto {
  @ApiProperty({ example: 'photo_leak.jpg', description: 'Имя исходного файла' })
  @IsString()
  @IsNotEmpty()
  filename: string;

  @ApiProperty({ example: 'image/jpeg', description: 'MIME-тип файла' })
  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @ApiPropertyOptional({ enum: UploadCategory, default: UploadCategory.MEDIA, description: 'Категория загрузки' })
  @IsOptional()
  @IsIn([UploadCategory.MEDIA, UploadCategory.DOCUMENT])
  category?: UploadCategory;
}

export class UploadResponseDto {
  @ApiProperty({ example: 'http://localhost:9000/shanyraq-media/1725729100-photo_leak.jpg', description: 'Публичный URL файла' })
  url: string;

  @ApiProperty({ example: '1725729100-photo_leak.jpg', description: 'Ключ объекта в S3/MinIO' })
  key: string;

  @ApiProperty({ example: 1048576, description: 'Размер файла в байтах' })
  size: number;

  @ApiProperty({ example: 'image/jpeg', description: 'MIME-тип файла' })
  mimeType: string;
}
