import { Test, TestingModule } from '@nestjs/testing';
import { UploadsService } from './uploads.service';
import { ConfigService } from '@nestjs/config';
import { UploadCategory } from './dto/uploads.dto';
import { BadRequestException } from '@nestjs/common';

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

  describe('uploadFile', () => {
    it('должен выбрасывать BadRequestException при пустом файле', async () => {
      await expect(service.uploadFile(null as any)).rejects.toThrow(BadRequestException);
    });

    it('должен успешно загружать файл и возвращать публичную ссылку', async () => {
      // Mock s3Client.send
      (service as any).s3Client.send = jest.fn().mockResolvedValue({});

      const mockFile = {
        originalname: 'pipe_leak.jpg',
        buffer: Buffer.from('fake-image-bytes'),
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
        buffer: Buffer.from('fake-pdf-bytes'),
        size: 2048,
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      const res = await service.uploadFile(mockDoc, UploadCategory.DOCUMENT);
      expect(res.url).toContain('http://localhost:9000/shanyraq-documents/');
    });
  });
});
