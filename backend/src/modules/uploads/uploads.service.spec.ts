import { Test, TestingModule } from '@nestjs/testing';
import { UploadsService } from './uploads.service';
import { ConfigService } from '@nestjs/config';
import { UploadCategory } from './dto/uploads.dto';
import { BadRequestException } from '@nestjs/common';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';

jest.mock('@aws-sdk/s3-presigned-post', () => ({
  createPresignedPost: jest.fn().mockResolvedValue({
    url: 'http://localhost:9000/shanyraq-media',
    fields: {
      key: 'test-key.jpg',
      'Content-Type': 'image/jpeg',
      policy: 'mock-policy',
    },
  }),
}));

describe('UploadsService (MinIO / S3 Хранилище)', () => {
  let service: UploadsService;
  let configServiceMock: any;

  beforeEach(async () => {
    configServiceMock = {
      get: jest.fn().mockImplementation((key: string, defaultVal: any) => {
        const map: Record<string, any> = {
          S3_ENDPOINT: 'localhost',
          S3_PORT: '9000',
          S3_USE_SSL: 'false',
          S3_ACCESS_KEY: 'test_access_key',
          S3_SECRET_KEY: 'test_secret_key',
          S3_BUCKET_MEDIA: 'shanyraq-media',
          S3_BUCKET_DOCS: 'shanyraq-documents',
        };
        return map[key] !== undefined ? map[key] : defaultVal;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadsService,
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    service = module.get<UploadsService>(UploadsService);
  });

  describe('generateFileKey', () => {
    it('должен генерировать уникальный ключ с оригинальным расширением файла', () => {
      const key1 = service.generateFileKey('damage_report.png');
      const key2 = service.generateFileKey('egov_extract.pdf');

      expect(key1).toMatch(/^\d+_[a-f0-9]+\.png$/);
      expect(key2).toMatch(/^\d+_[a-f0-9]+\.pdf$/);
      expect(key1).not.toBe(key2);
    });
  });

  describe('S3 Configuration (Subtask B2)', () => {
    it('должен выбрасывать критическую ошибку при отсутствии S3_ACCESS_KEY или S3_SECRET_KEY', () => {
      const invalidConfigMock: any = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'S3_ACCESS_KEY') return null;
          if (key === 'S3_SECRET_KEY') return null;
          return 'mock';
        }),
      };

      expect(() => new UploadsService(invalidConfigMock)).toThrow(
        /КРИТИЧЕСКАЯ ОШИБКА БЕЗОПАСНОСТИ/,
      );
    });
  });

  describe('uploadFile', () => {
    it('должен выбрасывать BadRequestException при пустом файле', async () => {
      const promise = service.uploadFile(null as any);
      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'UPLOADS.FILE_EMPTY' },
      });
    });

    it('должен отклонять неподдерживаемый MIME-тип (Subtask B4)', async () => {
      const mockDangerousFile = {
        originalname: 'exploit.svg',
        buffer: Buffer.from('<svg onload="alert(1)"></svg>'),
        size: 512,
        mimetype: 'image/svg+xml',
      } as Express.Multer.File;

      const promise = service.uploadFile(mockDangerousFile, UploadCategory.MEDIA);
      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toMatchObject({
        response: {
          code: 'UPLOADS.INVALID_MIME_TYPE',
        },
      });
    });

    it('должен отклонять файл с поддельным MIME-типом (mimetype=image/jpeg, но байты HTML/SVG) (Subtask B4)', async () => {
      const spoofedFile = {
        originalname: 'avatar.jpg',
        buffer: Buffer.from('<html><body><script>alert("xss")</script></body></html>'),
        size: 512,
        mimetype: 'image/jpeg',
      } as Express.Multer.File;

      const promise = service.uploadFile(spoofedFile, UploadCategory.MEDIA);
      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toMatchObject({
        response: {
          code: 'UPLOADS.INVALID_MIME_TYPE',
        },
      });
    });

    it('должен выбрасывать BadRequestException с code и без утечки внутренних деталей ошибки (Subtask D1)', async () => {
      (service as any).s3Client.send = jest.fn().mockRejectedValue(new Error('S3 connection failed: minio.internal.lan:9000 refused'));

      const mockFile = {
        originalname: 'pipe_leak.jpg',
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]),
        size: 1024,
        mimetype: 'image/jpeg',
      } as Express.Multer.File;

      const promise = service.uploadFile(mockFile, UploadCategory.MEDIA);
      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toMatchObject({
        response: {
          code: 'UPLOADS.STORAGE_ERROR',
          message: 'Ошибка при сохранении файла в хранилище',
        },
      });
      // Проверка отсутствия утечки внутренней топологии/хоста в params или message
      try {
        await promise;
      } catch (err: any) {
        expect(err.message).not.toContain('minio.internal.lan');
        expect(err.getResponse().params?.error).toBeUndefined();
      }
    });

    it('должен успешно загружать файл и возвращать публичную ссылку', async () => {
      // Mock s3Client.send
      (service as any).s3Client.send = jest.fn().mockResolvedValue({});

      const mockFile = {
        originalname: 'pipe_leak.jpg',
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]),
        size: 1024,
        mimetype: 'image/jpeg',
      } as Express.Multer.File;

      const res = await service.uploadFile(mockFile, UploadCategory.MEDIA);

      expect(res.size).toBe(1024);
      expect(res.mimeType).toBe('image/jpeg');
      expect(res.url).toContain('http://localhost:9000/shanyraq-media/');
      expect(res.key).toMatch(/\.jpg$/);
    });

    it('должен направлять документ в бакет документов shanyraq-documents', async () => {
      (service as any).s3Client.send = jest.fn().mockResolvedValue({});

      const mockDoc = {
        originalname: 'contract.pdf',
        buffer: Buffer.from('%PDF-1.4\n%test pdf content\n%%EOF'),
        size: 2048,
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      const res = await service.uploadFile(mockDoc, UploadCategory.DOCUMENT);
      expect(res.url).toContain('http://localhost:9000/shanyraq-documents/');
    });
  });

  describe('getPresignedUploadUrl (Subtask B4)', () => {
    it('должен отклонять недопустимый MIME-тип при запросе presigned URL', async () => {
      await expect(
        service.getPresignedUploadUrl('script.sh', 'application/x-sh'),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.getPresignedUploadUrl('script.sh', 'application/x-sh');
      } catch (err: any) {
        expect(err.getResponse().code).toBe('UPLOADS.INVALID_MIME_TYPE');
      }
    });

    it('должен формировать presigned POST с ограничением 15 МБ для разрешенного MIME-типа', async () => {
      const res = await service.getPresignedUploadUrl('scan.pdf', 'application/pdf', UploadCategory.DOCUMENT);

      expect(res.uploadUrl).toBe('http://localhost:9000/shanyraq-media');
      expect(res.fields).toBeDefined();
      expect(res.fileUrl).toContain('/shanyraq-documents/');
      expect(createPresignedPost).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          Bucket: 'shanyraq-documents',
          Conditions: expect.arrayContaining([
            ['content-length-range', 1, 15 * 1024 * 1024],
            ['eq', '$Content-Type', 'application/pdf'],
          ]),
        }),
      );
    });
  });
});
