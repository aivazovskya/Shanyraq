import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  UseGuards,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody, ApiQuery } from '@nestjs/swagger';
import { UploadsService } from './uploads.service';
import { PresignUploadDto, UploadCategory } from './dto/uploads.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Uploads (Загрузка медиа и документов в S3/MinIO)')
@Controller('uploads')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @ApiOperation({ summary: 'Прямая multipart-загрузка файла (фото к заявке или скан документа)' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'category', enum: UploadCategory, required: false, description: 'Категория: media или document' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 15 * 1024 * 1024, // 15 MB
      },
    }),
  )
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Query('category') category?: UploadCategory,
  ) {
    if (!file) {
      throw new BadRequestException('Файл не передан в поле "file"');
    }
    return this.uploadsService.uploadFile(file, category);
  }

  @Post('presign')
  @ApiOperation({ summary: 'Получить presigned URL для прямой клиентской загрузки в MinIO/S3' })
  async getPresignedUrl(@Body() dto: PresignUploadDto) {
    return this.uploadsService.getPresignedUploadUrl(dto.filename, dto.mimeType, dto.category);
  }
}
