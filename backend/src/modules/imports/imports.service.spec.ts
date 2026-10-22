import { Test, TestingModule } from '@nestjs/testing';
import { ImportsService } from './imports.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  UserRole,
  ImportKind,
  ImportStatus,
  ExpenseSource,
} from '@prisma/client';
import * as ExcelJS from 'exceljs';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

describe('ImportsService', () => {
  let service: ImportsService;
  let prismaMock: any;
  let auditLogServiceMock: any;
  let testStorageDir: string;

  beforeAll(() => {
    testStorageDir = path.join(
      os.tmpdir(),
      `shanyraq-imports-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    process.env.IMPORTS_STORAGE_DIR = testStorageDir;
    if (!fs.existsSync(testStorageDir)) {
      fs.mkdirSync(testStorageDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (testStorageDir && fs.existsSync(testStorageDir)) {
      const files = fs.readdirSync(testStorageDir);
      for (const f of files) {
        try {
          fs.unlinkSync(path.join(testStorageDir, f));
        } catch {}
      }
    }
  });

  afterAll(() => {
    if (testStorageDir && fs.existsSync(testStorageDir)) {
      try {
        fs.rmSync(testStorageDir, { recursive: true, force: true });
      } catch {}
    }
    delete process.env.IMPORTS_STORAGE_DIR;
  });

  const tenantA = 'tenant-aaa-111';
  const tenantB = 'tenant-bbb-222';

  const adminUserTenantA = {
    id: 'user-admin-a',
    tenantId: tenantA,
    role: UserRole.HOA_ADMIN,
  };

  const chairmanUserTenantA = {
    id: 'user-chairman-a',
    tenantId: tenantA,
    role: UserRole.HOA_CHAIRMAN,
  };

  const adminUserTenantB = {
    id: 'user-admin-b',
    tenantId: tenantB,
    role: UserRole.HOA_ADMIN,
  };

  beforeEach(async () => {
    auditLogServiceMock = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    prismaMock = {
      tenant: {
        findUnique: jest.fn(),
      },
      expense: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      importBatch: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        delete: jest.fn(),
      },
      budgetLine: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({ id: 'bl-1' }),
        deleteMany: jest.fn().mockResolvedValue({ count: 12 }),
      },
      $transaction: jest.fn(async (cbOrArr: any) => {
        if (typeof cbOrArr === 'function') {
          return cbOrArr(prismaMock);
        }
        return Promise.all(cbOrArr);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditLogService, useValue: auditLogServiceMock },
      ],
    }).compile();

    service = module.get<ImportsService>(ImportsService);
  });

  const createTestExcelBuffer = async (rows: any[][]): Promise<Buffer> => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Расходы');
    rows.forEach((r) => sheet.addRow(r));
    const arrayBuf = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuf as any);
  };

  describe('1. Preview (Предпросмотр)', () => {
    it('does NOT write anything to Expense table in DB during preview', async () => {
      const buffer = await createTestExcelBuffer([
        ['Дата', 'Сумма', 'Статья', 'Контрагент', 'Номер документа', 'Описание'],
        ['01.03.2026', 150000, 'Текущий ремонт', 'ТОО СтройСервис', 'АВР-1', 'Ремонт'],
        ['02.03.2026', 45000, 'Уборка', 'ИП Чистота', 'Чек 2', 'Клининг'],
      ]);

      const mockFile: Express.Multer.File = {
        buffer,
        originalname: 'expenses_march.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
        fieldname: 'file',
        encoding: '7bit',
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      prismaMock.importBatch.create.mockResolvedValue({
        id: 'batch-test-1',
        tenantId: tenantA,
        kind: ImportKind.EXPENSES,
        status: ImportStatus.PREVIEW,
        rowsTotal: 2,
      });

      const result = await service.previewExpenses(tenantA, adminUserTenantA, mockFile);

      expect(result.rowsTotal).toBe(2);
      expect(result.validCount).toBe(2);
      expect(result.errorCount).toBe(0);

      // CRITICAL INVARIANT: preview MUST NOT write to Expense table!
      expect(prismaMock.expense.create).not.toHaveBeenCalled();
      // ImportBatch is created with status PREVIEW
      expect(prismaMock.importBatch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ImportStatus.PREVIEW,
            tenantId: tenantA,
          }),
        }),
      );
    });

    it('flags duplicates against existing DB expenses and within the file itself', async () => {
      // Existing DB expense: 2026-03-01, 150000, ТОО СтройСервис, АВР-1
      prismaMock.expense.findMany
        .mockResolvedValueOnce([
          {
            expenseDate: new Date('2026-03-01T00:00:00.000Z'),
            amount: 150000,
            counterparty: 'ТОО СтройСервис',
            documentNumber: 'АВР-1',
          },
        ])
        .mockResolvedValueOnce([
          { category: 'Текущий ремонт' },
        ]);

      const buffer = await createTestExcelBuffer([
        ['Дата', 'Сумма', 'Статья', 'Контрагент', 'Номер документа', 'Описание'],
        ['01.03.2026', 150000, 'Текущий ремонт', 'ТОО СтройСервис', 'АВР-1', 'Дубль из БД'],
        ['05.03.2026', 80000, 'Текущий ремонт', 'ТОО Монтаж', 'Чек 10', 'Уникальная строка 1'],
        ['05.03.2026', 80000, 'Текущий ремонт', 'ТОО Монтаж', 'Чек 10', 'Дубль внутри файла!'],
      ]);

      const mockFile: Express.Multer.File = {
        buffer,
        originalname: 'duplicates.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
        fieldname: 'file',
        encoding: '7bit',
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      prismaMock.importBatch.create.mockResolvedValue({
        id: 'batch-dup',
        tenantId: tenantA,
        kind: ImportKind.EXPENSES,
        status: ImportStatus.PREVIEW,
        rowsTotal: 3,
      });

      const res = await service.previewExpenses(tenantA, adminUserTenantA, mockFile);

      expect(res.rowsTotal).toBe(3);
      expect(res.duplicateCount).toBe(2);
      expect(res.validCount).toBe(1);

      // Row 0 is DB duplicate
      expect(res.rows[0].isDuplicate).toBe(true);
      expect(res.rows[0].duplicateReason).toContain('уже есть в журнале');

      // Row 1 is valid unique
      expect(res.rows[1].isDuplicate).toBe(false);

      // Row 2 is internal batch duplicate
      expect(res.rows[2].isDuplicate).toBe(true);
      expect(res.rows[2].duplicateReason).toContain('внутри загружаемого файла');
    });

    it('detects new categories not yet existing in tenant expenses', async () => {
      prismaMock.expense.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { category: 'Текущий ремонт' },
          { category: 'Коммунальные услуги' },
        ]);

      const buffer = await createTestExcelBuffer([
        ['Дата', 'Сумма', 'Статья'],
        ['01.03.2026', 100000, 'Текущий ремонт'],
        ['02.03.2026', 50000, 'Неизвестная новая статья'],
      ]);

      const mockFile: Express.Multer.File = {
        buffer,
        originalname: 'categories.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
        fieldname: 'file',
        encoding: '7bit',
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      prismaMock.importBatch.create.mockResolvedValue({
        id: 'batch-cat',
        tenantId: tenantA,
      });

      const res = await service.previewExpenses(tenantA, adminUserTenantA, mockFile);

      expect(res.newCategories).toEqual(['Неизвестная новая статья']);
      expect(res.rows[0].isNewCategory).toBe(false);
      expect(res.rows[1].isNewCategory).toBe(true);
    });

    it('identifies rows with errors (invalid date, invalid amount, empty category)', async () => {
      const buffer = await createTestExcelBuffer([
        ['Дата', 'Сумма', 'Статья'],
        ['не дата', 50000, 'Ремонт'],
        ['01.03.2026', 'не сумма', 'Ремонт'],
        ['01.03.2026', -100, 'Ремонт'],
        ['01.03.2026', 20000, ''],
      ]);

      const mockFile: Express.Multer.File = {
        buffer,
        originalname: 'errors.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
        fieldname: 'file',
        encoding: '7bit',
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      prismaMock.importBatch.create.mockResolvedValue({
        id: 'batch-err',
        tenantId: tenantA,
      });

      const res = await service.previewExpenses(tenantA, adminUserTenantA, mockFile);

      expect(res.errorCount).toBe(4);
      expect(res.validCount).toBe(0);
      expect(res.rows[0].errors).toContain('Некорректная дата');
      expect(res.rows[1].errors).toContain('Некорректная сумма расхода (должна быть больше нуля)');
      expect(res.rows[2].errors).toContain('Некорректная сумма расхода (должна быть больше нуля)');
      expect(res.rows[3].errors).toContain('Статья расхода не заполнена');
    });

    it('throws InternalServerErrorException and rolls back preview batch if writing to disk fails', async () => {
      const buffer = await createTestExcelBuffer([
        ['Дата', 'Сумма', 'Статья'],
        ['01.03.2026', 10000, 'Ремонт'],
      ]);

      const mockFile: Express.Multer.File = {
        buffer,
        originalname: 'test.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
        fieldname: 'file',
        encoding: '7bit',
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      prismaMock.importBatch.create.mockResolvedValue({
        id: 'batch-fail-write',
        tenantId: tenantA,
      });
      prismaMock.importBatch.delete = jest.fn().mockResolvedValue({});

      const fs = require('fs');
      const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
        throw new Error('Disk full');
      });

      await expect(
        service.previewExpenses(tenantA, adminUserTenantA, mockFile),
      ).rejects.toThrow(InternalServerErrorException);

      expect(prismaMock.importBatch.delete).toHaveBeenCalledWith({
        where: { id: 'batch-fail-write' },
      });

      writeSpy.mockRestore();
    });
  });

  describe('2. Apply (Применение)', () => {
    it('applies accepted rows into Expense with source IMPORT_EXCEL and updates batch', async () => {
      // Mock preview payload on disk by providing existing preview batch
      const batchId = 'batch-apply-123';
      prismaMock.importBatch.findUnique.mockResolvedValue({
        id: batchId,
        tenantId: tenantA,
        kind: ImportKind.EXPENSES,
        status: ImportStatus.PREVIEW,
        fileName: 'test.xlsx',
        rowsTotal: 2,
      });

      // Write mock json file to disk for this test
      fs.writeFileSync(
        path.join(testStorageDir, `${batchId}.json`),
        JSON.stringify([
          {
            rowIndex: 0,
            dateRaw: '01.03.2026',
            expenseDate: '2026-03-01T00:00:00.000Z',
            amount: 150000,
            category: 'Текущий ремонт',
            counterparty: 'ТОО СтройСервис',
            documentNumber: 'АВР-1',
            description: 'Ремонт кровли',
            isValid: true,
            errors: [],
            isDuplicate: false,
            isNewCategory: false,
          },
          {
            rowIndex: 1,
            dateRaw: '02.03.2026',
            expenseDate: '2026-03-02T00:00:00.000Z',
            amount: 45000,
            category: 'Клининг',
            counterparty: 'ИП Чистота',
            documentNumber: 'Чек 2',
            description: 'Уборка',
            isValid: true,
            errors: [],
            isDuplicate: false,
            isNewCategory: false,
          },
        ]),
      );

      prismaMock.expense.create.mockResolvedValue({ id: 'exp-created-1' });

      const res = await service.applyImport(batchId, adminUserTenantA, {
        rowIndexesToSkip: [1], // Skip row 1
      });

      expect(res.status).toBe(ImportStatus.APPLIED);
      expect(res.rowsApplied).toBe(1);
      expect(res.rowsSkipped).toBe(1);

      // Verify created expense
      expect(prismaMock.expense.create).toHaveBeenCalledTimes(1);
      expect(prismaMock.expense.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: tenantA,
          category: 'Текущий ремонт',
          amount: 150000,
          source: ExpenseSource.IMPORT_EXCEL,
          importBatchId: batchId,
          periodMonth: 3,
          periodYear: 2026,
        }),
      });

      // Verify batch updated to APPLIED
      expect(prismaMock.importBatch.update).toHaveBeenCalledWith({
        where: { id: batchId },
        data: expect.objectContaining({
          status: ImportStatus.APPLIED,
          rowsApplied: 1,
          rowsSkipped: 1,
        }),
      });

      // Verify audit log
      expect(auditLogServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'IMPORT_BATCH_APPLIED',
          targetId: batchId,
        }),
      );

      // Cleanup test file
      try {
        fs.unlinkSync(path.join(testStorageDir, `${batchId}.json`));
      } catch {}
    });

    it('rejects applying an already applied batch', async () => {
      prismaMock.importBatch.findUnique.mockResolvedValue({
        id: 'batch-already-applied',
        tenantId: tenantA,
        status: ImportStatus.APPLIED,
      });

      await expect(
        service.applyImport('batch-already-applied', adminUserTenantA),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException (IMPORTS.PAYLOAD_NOT_FOUND) when preview payload file is missing', async () => {
      const batchId = 'batch-non-existent-payload';
      prismaMock.importBatch.findUnique.mockResolvedValue({
        id: batchId,
        tenantId: tenantA,
        kind: ImportKind.EXPENSES,
        status: ImportStatus.PREVIEW,
        fileName: 'test.xlsx',
        rowsTotal: 1,
      });

      await expect(
        service.applyImport(batchId, adminUserTenantA),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('3. Void (Откат партии)', () => {
    it('voids ONLY the expenses of this batch and records reason', async () => {
      const batchId = 'batch-to-void';
      prismaMock.importBatch.findUnique.mockResolvedValue({
        id: batchId,
        tenantId: tenantA,
        status: ImportStatus.APPLIED,
        fileName: 'imported.xlsx',
        expenses: [{ id: 'exp-1' }, { id: 'exp-2' }],
      });

      prismaMock.importBatch.update.mockResolvedValue({
        id: batchId,
        status: ImportStatus.VOIDED,
        voidedReason: 'Ошибочная загрузка дубликата',
      });

      const res = await service.voidImport(batchId, adminUserTenantA, {
        reason: 'Ошибочная загрузка дубликата',
      });

      expect(res.status).toBe(ImportStatus.VOIDED);

      // Expense updateMany must STRICTLY target importBatchId === batchId
      expect(prismaMock.expense.updateMany).toHaveBeenCalledWith({
        where: {
          importBatchId: batchId,
          isVoided: false,
        },
        data: expect.objectContaining({
          isVoided: true,
          voidedReason: 'Откат партии импорта: Ошибочная загрузка дубликата',
        }),
      });

      // AuditLog recorded
      expect(auditLogServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'IMPORT_BATCH_VOIDED',
          targetId: batchId,
        }),
      );
    });

    it('fails if void reason is missing or empty', async () => {
      await expect(
        service.voidImport('batch-x', adminUserTenantA, { reason: '   ' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('4. Tenant Isolation (Изоляция ЖК)', () => {
    it('forbids admin of tenant B from previewing for tenant A', async () => {
      await expect(
        service.previewExpenses(tenantA, adminUserTenantB, null as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids admin of tenant B from applying batch of tenant A', async () => {
      prismaMock.importBatch.findUnique.mockResolvedValue({
        id: 'batch-tenant-a',
        tenantId: tenantA,
        status: ImportStatus.PREVIEW,
      });

      await expect(
        service.applyImport('batch-tenant-a', adminUserTenantB),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids admin of tenant B from voiding batch of tenant A', async () => {
      prismaMock.importBatch.findUnique.mockResolvedValue({
        id: 'batch-tenant-a',
        tenantId: tenantA,
        status: ImportStatus.APPLIED,
        expenses: [],
      });

      await expect(
        service.voidImport('batch-tenant-a', adminUserTenantB, { reason: 'hack' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids admin of tenant B from viewing history of tenant A', async () => {
      await expect(
        service.getImportHistory(tenantA, adminUserTenantB),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('5. Role-based Access Control', () => {
    it('HOA_CHAIRMAN cannot apply or void import batches', async () => {
      prismaMock.importBatch.findUnique.mockResolvedValue({
        id: 'batch-chairman-test',
        tenantId: tenantA,
        status: ImportStatus.PREVIEW,
      });

      await expect(
        service.applyImport('batch-chairman-test', chairmanUserTenantA),
      ).rejects.toThrow(ForbiddenException);

      prismaMock.importBatch.findUnique.mockResolvedValue({
        id: 'batch-chairman-test',
        tenantId: tenantA,
        status: ImportStatus.APPLIED,
        expenses: [],
      });

      await expect(
        service.voidImport('batch-chairman-test', chairmanUserTenantA, { reason: 'test' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('HOA_CHAIRMAN can view import history', async () => {
      prismaMock.importBatch.findMany.mockResolvedValue([
        { id: 'b1', tenantId: tenantA },
      ]);
      prismaMock.importBatch.count.mockResolvedValue(1);

      const history = await service.getImportHistory(tenantA, chairmanUserTenantA);
      expect(history.items.length).toBe(1);
    });
  });

  describe('6. Budget Import (kind=BUDGET, preview, apply, void, template)', () => {
    async function createBudgetXlsxBuffer(
      rows: Array<{ category: string; amounts: number[] }>,
    ): Promise<Buffer> {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Бюджет');
      ws.addRow([
        'Категория',
        'Январь',
        'Февраль',
        'Март',
        'Апрель',
        'Май',
        'Июнь',
        'Июль',
        'Август',
        'Сентябрь',
        'Октябрь',
        'Ноябрь',
        'Декабрь',
        'Итого',
      ]);
      for (const r of rows) {
        ws.addRow([r.category, ...r.amounts, 1200000]);
      }
      const arr = await wb.xlsx.writeBuffer();
      return Buffer.from(arr);
    }

    it('previewBudget: parses 12 months in columns and detects update vs new without writing to DB', async () => {
      const buffer = await createBudgetXlsxBuffer([
        {
          category: 'Текущий ремонт',
          amounts: [100000, 100000, 100000, 100000, 100000, 100000, 100000, 100000, 100000, 100000, 100000, 100000],
        },
      ]);

      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'budget_test.xlsx',
        encoding: '7bit',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
        buffer,
        stream: null as any,
        destination: '',
        filename: '',
        path: '',
      };

      // Existing line in DB for month 1 (willUpdate=true)
      prismaMock.budgetLine.findMany.mockResolvedValue([
        { month: 1, category: 'текущий ремонт', plannedAmount: 50000 },
      ]);

      prismaMock.importBatch.create.mockResolvedValue({
        id: 'batch-budget-1',
        tenantId: tenantA,
        kind: ImportKind.BUDGET,
        status: ImportStatus.PREVIEW,
        fileName: 'budget_test.xlsx',
        rowsTotal: 1,
      });

      prismaMock.importBatch.update.mockResolvedValue({});

      const preview = await service.previewBudget(tenantA, adminUserTenantA, mockFile, {
        year: 2026,
      });

      expect(preview.batchId).toBe('batch-budget-1');
      expect(preview.kind).toBe(ImportKind.BUDGET);
      expect(preview.year).toBe(2026);
      expect(preview.rowsTotal).toBe(1);
      expect(preview.validCount).toBe(1);
      expect(preview.errorCount).toBe(0);

      const catRow = preview.rows[0];
      expect(catRow.category).toBe('Текущий ремонт');
      expect(catRow.rowTotal).toBe(1200000);
      expect(catRow.months[0].willUpdate).toBe(true); // Month 1 existed in DB
      expect(catRow.months[1].willUpdate).toBe(false); // Month 2 is new

      // Verify NO budget lines were created during preview!
      expect(prismaMock.budgetLine.upsert).not.toHaveBeenCalled();
    });

    it('applyImport: applies budget batch lines via upsert and marks status APPLIED', async () => {
      const batchId = 'batch-budget-apply';

      prismaMock.importBatch.findUnique.mockResolvedValue({
        id: batchId,
        tenantId: tenantA,
        kind: ImportKind.BUDGET,
        fileName: 'budget.xlsx',
        status: ImportStatus.PREVIEW,
        rowsTotal: 1,
      });

      // Write mock payload to testStorageDir
      const payloadFile = path.join(testStorageDir, `${batchId}.json`);
      fs.writeFileSync(
        payloadFile,
        JSON.stringify({
          kind: 'BUDGET',
          year: 2026,
          rows: [
            {
              rowIndex: 0,
              category: 'Текущий ремонт',
              year: 2026,
              isValid: true,
              months: [
                { month: 1, plannedAmount: 150000, isValid: true },
                { month: 2, plannedAmount: 150000, isValid: true },
              ],
            },
          ],
        }),
        'utf8',
      );

      prismaMock.importBatch.update.mockResolvedValue({
        id: batchId,
        status: ImportStatus.APPLIED,
      });

      const result = await service.applyImport(batchId, adminUserTenantA);

      expect(result.status).toBe(ImportStatus.APPLIED);
      expect(result.rowsApplied).toBe(1);
      expect(prismaMock.budgetLine.upsert).toHaveBeenCalledTimes(2);

      expect(auditLogServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: tenantA,
          action: 'IMPORT_BATCH_APPLIED',
          targetType: 'ImportBatch',
        }),
      );
    });

    it('voidImport: removes budget lines attached to the batch and marks batch VOIDED', async () => {
      const batchId = 'batch-budget-void';

      prismaMock.importBatch.findUnique.mockResolvedValue({
        id: batchId,
        tenantId: tenantA,
        kind: ImportKind.BUDGET,
        fileName: 'budget.xlsx',
        status: ImportStatus.APPLIED,
        expenses: [],
      });

      prismaMock.importBatch.update.mockResolvedValue({
        id: batchId,
        status: ImportStatus.VOIDED,
      });

      prismaMock.budgetLine.deleteMany.mockResolvedValue({ count: 12 });

      const result = await service.voidImport(batchId, adminUserTenantA, {
        reason: 'Загружен ошибочный бюджет',
      });

      expect(result.status).toBe(ImportStatus.VOIDED);
      expect(prismaMock.budgetLine.deleteMany).toHaveBeenCalledWith({
        where: {
          importBatchId: batchId,
        },
      });

      expect(auditLogServiceMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: tenantA,
          action: 'IMPORT_BATCH_VOIDED',
          metadata: expect.objectContaining({
            kind: ImportKind.BUDGET,
            linesDeleted: 12,
          }),
        }),
      );
    });

    it('getBudgetTemplate: returns valid multi-sheet Excel file with budget sample', async () => {
      const { buffer, filename } = await service.getBudgetTemplate();
      expect(filename).toBe('budget_template.xlsx');
      expect(buffer).toBeInstanceOf(Buffer);

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as any);
      const sheets = wb.worksheets.map((s) => s.name);
      expect(sheets).toContain('Бюджет');
      expect(sheets).toContain('Инструкция');
    });
  });
});
