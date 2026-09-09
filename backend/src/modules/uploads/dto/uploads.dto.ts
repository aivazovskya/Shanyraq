import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum UploadCategory {
  MEDIA = 'media',         // Фото к заявкам Service Desk, видео
  DOCUMENT = 'document',   // Сканы документов права собственности, договоры
}

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export class PresignUploadDto {
  @ApiProperty({ example: 'photo_leak.jpg', description: 'Имя исходного файла' })
  @IsString()
  @IsNotEmpty()
  filename: string;

  @ApiProperty({
    example: 'image/jpeg',
    description: 'MIME-тип файла (JPEG, PNG, WebP, PDF)',
    enum: ALLOWED_MIME_TYPES,
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(ALLOWED_MIME_TYPES, {
    message: 'Недопустимый тип файла. Разрешены только JPEG, PNG, WebP и PDF',
  })
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
