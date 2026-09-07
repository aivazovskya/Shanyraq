import { Injectable, Logger, OnModuleInit, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';
import * as path from 'path';
import { UploadCategory } from './dto/uploads.dto';

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
    const accessKey = this.configService.get<string>('S3_ACCESS_KEY', 'shanyraq_minio');
    const secretKey = this.configService.get<string>('S3_SECRET_KEY', 'shanyraq_minio_secret_key');
    this.mediaBucket = this.configService.get<string>('S3_BUCKET_MEDIA', 'shanyraq-media');
    this.docsBucket = this.configService.get<string>('S3_BUCKET_DOCS', 'shanyraq-documents');

    const protocol = this.useSsl ? 'https' : 'http';
    this.publicBaseUrl = `${protocol}://${this.endpoint}:${this.port}`;

    this.s3Client = new S3Client({
      endpoint: this.publicBaseUrl,
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

  generateFileKey(originalName: string): string {
    const ext = path.extname(originalName).toLowerCase() || '.bin';
    const randomHex = crypto.randomBytes(8).toString('hex');
    const timestamp = Date.now();
    return `${timestamp}_${randomHex}${ext}`;
  }

  async uploadFile(file: Express.Multer.File, category?: UploadCategory) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Файл не предоставлен или имеет нулевой размер');
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
        }),
      );
    } catch (error: any) {
      this.logger.error(`Ошибка загрузки файла в S3: ${error.message}`);
      throw new BadRequestException(`Ошибка при сохранении файла в хранилище: ${error.message}`);
    }

    const url = `${this.publicBaseUrl}/${bucket}/${key}`;

    return {
      url,
      key,
      size: file.size,
      mimeType: file.mimetype,
    };
  }

  async getPresignedUploadUrl(filename: string, mimeType: string, category?: UploadCategory) {
    const bucket = this.resolveBucket(category);
    const key = this.generateFileKey(filename);

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: mimeType,
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 900 });
    const fileUrl = `${this.publicBaseUrl}/${bucket}/${key}`;

    return {
      uploadUrl,
      fileUrl,
      key,
      expiresIn: 900,
    };
  }
}
