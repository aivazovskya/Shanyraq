import { ValidationPipe, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GetImportsQueryDto, ApplyImportDto, VoidImportDto } from './imports.dto';
import { ImportKind, ImportStatus } from '@prisma/client';
import { validationExceptionFactory } from '../../../common/pipes/validation-exception.factory';

describe('Imports DTO Validation and Transformation', () => {
  let pipe: ValidationPipe;
  const metadata: ArgumentMetadata = {
    type: 'query',
    metatype: GetImportsQueryDto,
    data: '',
  };

  beforeEach(() => {
    pipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      exceptionFactory: validationExceptionFactory,
    });
  });

  describe('GetImportsQueryDto', () => {
    it('successfully transforms and validates numeric query strings (limit=50, offset=0)', async () => {
      const rawQuery = { limit: '50', offset: '0' };
      const result: GetImportsQueryDto = await pipe.transform(rawQuery, metadata);

      expect(typeof result.limit).toBe('number');
      expect(result.limit).toBe(50);
      expect(typeof result.offset).toBe('number');
      expect(result.offset).toBe(0);
    });

    it('successfully transforms query parameters with valid enum filters', async () => {
      const rawQuery = {
        limit: '25',
        offset: '10',
        kind: ImportKind.EXPENSES,
        status: ImportStatus.APPLIED,
      };
      const result: GetImportsQueryDto = await pipe.transform(rawQuery, metadata);

      expect(result.limit).toBe(25);
      expect(result.offset).toBe(10);
      expect(result.kind).toBe(ImportKind.EXPENSES);
      expect(result.status).toBe(ImportStatus.APPLIED);
    });

    it('rejects limit exceeding maximum (limit=1000 -> 400)', async () => {
      const rawQuery = { limit: '1000' };

      await expect(pipe.transform(rawQuery, metadata)).rejects.toThrow(
        BadRequestException,
      );

      // Verify direct class-transformer + class-validator error
      const instance = plainToInstance(GetImportsQueryDto, rawQuery);
      const errors = await validate(instance);
      expect(errors.length).toBeGreaterThan(0);
      const limitError = errors.find((e) => e.property === 'limit');
      expect(limitError).toBeDefined();
      expect(limitError?.constraints).toHaveProperty('max');
    });

    it('rejects non-numeric string for limit (limit=abc -> 400)', async () => {
      const rawQuery = { limit: 'abc' };

      await expect(pipe.transform(rawQuery, metadata)).rejects.toThrow(
        BadRequestException,
      );

      const instance = plainToInstance(GetImportsQueryDto, rawQuery);
      const errors = await validate(instance);
      expect(errors.length).toBeGreaterThan(0);
      const limitError = errors.find((e) => e.property === 'limit');
      expect(limitError).toBeDefined();
    });

    it('rejects limit less than 1 (limit=0 or limit=-5 -> 400)', async () => {
      await expect(pipe.transform({ limit: '0' }, metadata)).rejects.toThrow(
        BadRequestException,
      );
      await expect(pipe.transform({ limit: '-5' }, metadata)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects negative offset (offset=-1 -> 400)', async () => {
      await expect(pipe.transform({ offset: '-1' }, metadata)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects invalid enum values for status and kind', async () => {
      await expect(
        pipe.transform({ status: 'NON_EXISTENT_STATUS' }, metadata),
      ).rejects.toThrow(BadRequestException);

      await expect(
        pipe.transform({ kind: 'INVALID_KIND' }, metadata),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('ApplyImportDto', () => {
    const applyMeta: ArgumentMetadata = {
      type: 'body',
      metatype: ApplyImportDto,
      data: '',
    };

    it('transforms and validates skip row indexes and confirmNewCategories', async () => {
      const body = {
        rowIndexesToSkip: ['0', '3', '5'],
        confirmNewCategories: true,
      };

      const result: ApplyImportDto = await pipe.transform(body, applyMeta);
      expect(result.confirmNewCategories).toBe(true);
      expect(result.rowIndexesToSkip).toEqual([0, 3, 5]);
      expect(typeof result.rowIndexesToSkip![0]).toBe('number');
    });

    it('correctly transforms string "false" to boolean false (not true)', async () => {
      const body = {
        confirmNewCategories: 'false',
      };

      const result: ApplyImportDto = await pipe.transform(body, applyMeta);
      expect(result.confirmNewCategories).toBe(false);
      expect(typeof result.confirmNewCategories).toBe('boolean');

      // Also verify plainToInstance directly
      const instance = plainToInstance(ApplyImportDto, body);
      expect(instance.confirmNewCategories).toBe(false);
      const errors = await validate(instance);
      expect(errors.length).toBe(0);
    });

    it('correctly transforms string "true", "0", "1", 0, 1 into corresponding booleans', async () => {
      const t1: ApplyImportDto = await pipe.transform({ confirmNewCategories: 'true' }, applyMeta);
      expect(t1.confirmNewCategories).toBe(true);

      const t2: ApplyImportDto = await pipe.transform({ confirmNewCategories: '0' }, applyMeta);
      expect(t2.confirmNewCategories).toBe(false);

      const t3: ApplyImportDto = await pipe.transform({ confirmNewCategories: '1' }, applyMeta);
      expect(t3.confirmNewCategories).toBe(true);

      const t4: ApplyImportDto = await pipe.transform({ confirmNewCategories: 0 }, applyMeta);
      expect(t4.confirmNewCategories).toBe(false);

      const t5: ApplyImportDto = await pipe.transform({ confirmNewCategories: 1 }, applyMeta);
      expect(t5.confirmNewCategories).toBe(true);
    });

    it('rejects invalid boolean strings (e.g. "not-a-bool" -> 400)', async () => {
      await expect(
        pipe.transform({ confirmNewCategories: 'not-a-bool' }, applyMeta),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('VoidImportDto', () => {
    const voidMeta: ArgumentMetadata = {
      type: 'body',
      metatype: VoidImportDto,
      data: '',
    };

    it('validates non-empty void reason', async () => {
      const body = { reason: 'Ошибочный файл' };
      const result: VoidImportDto = await pipe.transform(body, voidMeta);
      expect(result.reason).toBe('Ошибочный файл');
    });

    it('rejects empty void reason', async () => {
      await expect(pipe.transform({ reason: '' }, voidMeta)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
