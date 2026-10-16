import { Injectable, Logger, OnModuleInit, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import * as crypto from 'crypto';
import * as path from 'path';
import * as FileType from 'file-type';
import { Readable } from 'stream';
import { UploadCategory, ALLOWED_MIME_TYPES } from './dto/uploads.dto';

@Injectable()
export class UploadsService implements OnModuleInit {
  private readonly logger = new Logger(UploadsService.name);
  private s3Client: S3Client;
  private readonly endpoint: string;
  private readonly port: number;
  private readonly useSsl: boolean;
  private readonly mediaBucket: string;
  private readonly docsBucket: string;
  private readonly publicBaseUrl: string;

  constructor(private configService: ConfigService) {
    this.endpoint = this.configService.get<string>('S3_ENDPOINT', 'localhost');
    this.port = parseInt(this.configService.get<string>('S3_PORT', '9000'), 10);
    this.useSsl = this.configService.get<string>('S3_USE_SSL', 'false') === 'true';
    const accessKey = this.configService.get<string>('S3_ACCESS_KEY');
    const secretKey = this.configService.get<string>('S3_SECRET_KEY');

    if (!accessKey || !secretKey) {
      throw new Error(
        'КРИТИЧЕСКАЯ ОШИБКА БЕЗОПАСНОСТИ: S3_ACCESS_KEY или S3_SECRET_KEY не заданы в конфигурации!',
      );
    }

    this.mediaBucket = this.configService.get<string>('S3_BUCKET_MEDIA', 'shanyraq-media');
    this.docsBucket = this.configService.get<string>('S3_BUCKET_DOCS', 'shanyraq-documents');

    const protocol = this.useSsl ? 'https' : 'http';
    const storageEndpoint = `${protocol}://${this.endpoint}:${this.port}`;
    this.publicBaseUrl = (this.configService.get<string>('S3_PUBLIC_BASE_URL') || storageEndpoint).replace(/\/+$/, '');

    this.s3Client = new S3Client({
      endpoint: storageEndpoint,
      region: 'us-east-1',
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      forcePathStyle: true,
    });
  }

  async onModuleInit() {
    await this.ensureBucketExists(this.mediaBucket);
    await this.ensureBucketExists(this.docsBucket);
  }

  private async ensureBucketExists(bucket: string) {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch (err: any) {
      if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') {
        try {
          await this.s3Client.send(new CreateBucketCommand({ Bucket: bucket }));
          this.logger.log(`[S3] Бакет "${bucket}" успешно создан в MinIO`);
        } catch (createErr: any) {
          this.logger.warn(`[S3] Не удалось создать бакет "${bucket}": ${createErr?.message}`);
        }
      } else {
        this.logger.warn(`[S3] Предупреждение при проверке бакета "${bucket}": ${err?.message}`);
      }
    }
  }

  private resolveBucket(category?: UploadCategory): string {
    return category === UploadCategory.DOCUMENT ? this.docsBucket : this.mediaBucket;
  }

  /** Read an existing uploaded object, never fetch a client-supplied remote URL. */
  async openStoredFile(fileUrl: string, expectedUploaderId: string): Promise<{ stream: Readable; contentType: string }> {
    let object: { Bucket: string; Key: string } | undefined;
    try {
      const url = new URL(fileUrl);
      if (url.username || url.password) throw new Error('Embedded credentials');
      const internal = `${this.useSsl ? 'https' : 'http'}://${this.endpoint}:${this.port}`;
      for (const base of [this.publicBaseUrl, internal]) {
        const prefix = new URL(base.replace(/\/+$/, '') + '/');
        if (url.origin !== prefix.origin || !url.pathname.startsWith(prefix.pathname)) continue;
        const parts = url.pathname.slice(prefix.pathname.length).split('/').map(decodeURIComponent);
        if (parts.length === 2 && [this.mediaBucket, this.docsBucket].includes(parts[0]) && /^\d+_[a-f0-9]{16}\.[a-z0-9]+$/.test(parts[1])) {
          object = { Bucket: parts[0], Key: parts[1] };
          break;
        }
      }
    } catch { /* Invalid stored reference is not a network destination. */ }
    if (!object) throw new NotFoundException({ code: 'UPLOADS.FILE_NOT_FOUND', message: 'Вложение недоступно' });
    try {
      const result = await this.s3Client.send(new GetObjectCommand(object));
      if (!(result.Body instanceof Readable)) throw new Error('Missing body');
      if (!expectedUploaderId || result.Metadata?.['uploader-id'] !== expectedUploaderId) {
        result.Body.destroy();
        throw new Error('Object uploader does not match request creator');
      }
      return { stream: result.Body, contentType: ALLOWED_MIME_TYPES.includes(result.ContentType as any) ? result.ContentType! : 'application/octet-stream' };
    } catch {
      throw new NotFoundException({ code: 'UPLOADS.FILE_NOT_FOUND', message: 'Вложение недоступно' });
    }
  }

  generateFileKey(originalName: string): string {
    const ext = path.extname(originalName).toLowerCase() || '.bin';
    const randomHex = crypto.randomBytes(8).toString('hex');
    const timestamp = Date.now();
    return `${timestamp}_${randomHex}${ext}`;
  }

  async uploadFile(file: Express.Multer.File, category?: UploadCategory, uploaderId?: string) {
    if (!file || !file.buffer) {
      throw new BadRequestException({
        code: 'UPLOADS.FILE_EMPTY',
        message: 'Файл не предоставлен или имеет нулевой размер',
      });
    }

    if (!file.mimetype || !ALLOWED_MIME_TYPES.includes(file.mimetype as any)) {
      throw new BadRequestException({
        code: 'UPLOADS.INVALID_MIME_TYPE',
        message: 'Недопустимый тип файла. Разрешены только JPEG, PNG, WebP и PDF',
      });
    }

    const detected = await FileType.fromBuffer(file.buffer);
    if (!detected || !ALLOWED_MIME_TYPES.includes(detected.mime as any) || detected.mime !== file.mimetype) {
      throw new BadRequestException({
        code: 'UPLOADS.INVALID_MIME_TYPE',
        message: 'Недопустимый тип файла. Разрешены только JPEG, PNG, WebP и PDF',
      });
    }

    const bucket = this.resolveBucket(category);
    const key = this.generateFileKey(file.originalname);

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
          Metadata: uploaderId ? { 'uploader-id': uploaderId } : undefined,
        }),
      );
    } catch (error: any) {
      this.logger.error(`Ошибка загрузки файла в S3: ${error.message}`, error.stack);
      throw new BadRequestException({
        code: 'UPLOADS.STORAGE_ERROR',
        message: 'Ошибка при сохранении файла в хранилище',
      });
    }

    const url = `${this.publicBaseUrl}/${bucket}/${key}`;

    return {
      url,
      key,
      size: file.size,
      mimeType: file.mimetype,
    };
  }

  async getPresignedUploadUrl(filename: string, mimeType: string, category?: UploadCategory, uploaderId?: string) {
    if (!mimeType || !ALLOWED_MIME_TYPES.includes(mimeType as any)) {
      throw new BadRequestException({
        code: 'UPLOADS.INVALID_MIME_TYPE',
        message: 'Недопустимый тип файла. Разрешены только JPEG, PNG, WebP и PDF',
      });
    }

    const bucket = this.resolveBucket(category);
    const key = this.generateFileKey(filename);

    const post = await createPresignedPost(this.s3Client, {
      Bucket: bucket,
      Key: key,
      Conditions: [
        ['content-length-range', 1, 15 * 1024 * 1024], // 1 byte to 15MB
        ['eq', '$Content-Type', mimeType],
        ...(uploaderId ? [['eq', '$x-amz-meta-uploader-id', uploaderId] as ['eq', string, string]] : []),
      ],
      Fields: {
        'Content-Type': mimeType,
        ...(uploaderId ? { 'x-amz-meta-uploader-id': uploaderId } : {}),
      },
      Expires: 900,
    });

    const fileUrl = `${this.publicBaseUrl}/${bucket}/${key}`;

    return {
      uploadUrl: post.url,
      fields: post.fields,
      fileUrl,
      key,
      expiresIn: 900,
    };
  }
}
