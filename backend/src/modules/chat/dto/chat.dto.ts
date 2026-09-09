import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateChatMessageDto {
  @ApiPropertyOptional({ description: 'Текст сообщения', example: 'Здравствуйте, когда включат горячую воду?' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  text?: string;

  @ApiPropertyOptional({
    description: 'URL прикрепленной фотографии',
    example: 'https://storage.shanyraq.kz/uploads/photo.jpg',
  })
  @IsOptional()
  @IsString()
  photoUrl?: string;
}
