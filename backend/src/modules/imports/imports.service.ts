import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { assertUserBelongsToTenant } from '../../common/guards/tenant.guard';
import {
  UserRole,
  ImportKind,
  ImportStatus,
  ExpenseSource,
} from '@prisma/client';
import {
  PreviewExpensesDto,
  PreviewBudgetDto,
  ApplyImportDto,
  VoidImportDto,
  GetImportsQueryDto,
  ParsedExpenseRow,
  ParsedBudgetCategoryRow,
  ImportPreviewResult,
  BudgetImportPreviewResult,
} from './dto/imports.dto';
import {
  readWorkbookFromBuffer,
  autoDetectColumns,
  detectBudgetColumns,
  parseCellDate,
  parseCellAmount,
  cellToString,
  createExpensesTemplateBuffer,
  createBudgetTemplateBuffer,
  STANDARD_EXPENSE_CATEGORIES,
} from './helpers/import-parser.helper';

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  private get defaultStorageDir(): string {
    // Stable path rooted at backend directory regardless of process.cwd()
    const backendRoot = path.resolve(__dirname, '../../..');
    return path.join(backendRoot, 'uploads', 'imports');
  }

  private get storageDir(): string {
    const customDir = process.env.IMPORTS_STORAGE_DIR;
    return customDir ? path.resolve(customDir) : this.defaultStorageDir;
  }

  private ensureStorageDir(): void {
    const dir = this.storageDir;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {
    try {
      this.ensureStorageDir();
      this.logger.log(`Imports storage directory initialized: ${this.storageDir}`);
    } catch (err: any) {
      this.logger.warn(`Could not ensure storage directory on startup: ${err.message}`);
    }
  }

  private generateDuplicateKey(
    date: Date,
    amount: number,
    counterparty?: string | null,
    documentNumber?: string | null,
  ): string {
    const dStr = date.toISOString().slice(0, 10);
    const aStr = amount.toFixed(2);
    const cpStr = (counterparty || '').trim().toLowerCase();
    const docStr = (documentNumber || '').trim().toLowerCase();
    return `${dStr}|${aStr}|${cpStr}|${docStr}`;
  }

  /**
   * 1. Предпросмотр партии расходов (Preview)
   * Ничего не создает в таблице Expense!
   */
  async previewExpenses(
    tenantId: string,
    user: { id?: string; tenantId?: string | null; role: UserRole },
    file: Express.Multer.File,
    dto?: PreviewExpensesDto,
  ): Promise<ImportPreviewResult> {
    assertUserBelongsToTenant(user, tenantId, 'импорта расходов');

    if (user.role !== UserRole.HOA_ADMIN && user.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException({
        code: 'IMPORTS.PREVIEW_FORBIDDEN',
        message: 'Недостаточно прав для импорта расходов',
      });
    }

    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException({
        code: 'IMPORTS.FILE_REQUIRED',
        message: 'Файл обязателен для загрузки',
      });
    }

    const lowerName = file.originalname.toLowerCase();
    if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.csv')) {
      throw new BadRequestException({
        code: 'IMPORTS.INVALID_FILE_TYPE',
        message: 'Разрешены только файлы Excel (.xlsx) и CSV (.csv)',
      });
    }

    // Чтение строк из буфера
    let parsedWorkbook: { headers: string[]; rows: { rowIndex: number; values: any[] }[] };
    try {
      parsedWorkbook = await readWorkbookFromBuffer(file.buffer, file.originalname);
    } catch (err: any) {
      throw new BadRequestException({
        code: 'IMPORTS.FILE_PARSE_FAILED',
        message: `Не удалось прочитать файл: ${err?.message || 'ошибка формата'}`,
      });
    }

    const { headers, rows: rawRows } = parsedWorkbook;
    if (rawRows.length === 0) {
      throw new BadRequestException({
        code: 'IMPORTS.EMPTY_FILE',
        message: 'Файл не содержит строк с данными',
      });
    }

    // Разбор маппинга
    let manualMapping: Record<string, string | number> | undefined;
    if (dto?.mapping) {
      if (typeof dto.mapping === 'string') {
        try {
          manualMapping = JSON.parse(dto.mapping);
        } catch {
          manualMapping = undefined;
        }
      } else {
        manualMapping = dto.mapping as any;
      }
    }

    const detected = autoDetectColumns(headers, manualMapping);

    // Обязательные колонки: дата, сумма, статья
    if (detected.date === -1 || detected.amount === -1 || detected.category === -1) {
      const missing: string[] = [];
      if (detected.date === -1) missing.push('Дата');
      if (detected.amount === -1) missing.push('Сумма');
      if (detected.category === -1) missing.push('Статья/Категория');

      throw new BadRequestException({
        code: 'IMPORTS.MAPPING_INCOMPLETE',
        message: `Не удалось определить обязательные колонки: ${missing.join(', ')}. Проверьте заголовки или укажите маппинг.`,
        params: { missing, detected, headers },
      });
    }

    // Загрузка существующих категорий и расходов для проверки дублей
    const [existingExpenses, existingDistinctCategories] = await Promise.all([
      this.prisma.expense.findMany({
        where: { tenantId, isVoided: false },
        select: {
          expenseDate: true,
          amount: true,
          counterparty: true,
          documentNumber: true,
        },
      }),
      this.prisma.expense.findMany({
        where: { tenantId },
        select: { category: true },
        distinct: ['category'],
      }),
    ]);

    const existingCategorySet = new Set([
      ...STANDARD_EXPENSE_CATEGORIES.map((c) => c.trim().toLowerCase()),
      ...existingDistinctCategories
        .map((c) => c.category?.trim().toLowerCase())
        .filter(Boolean),
    ]);

    const dbDuplicateKeys = new Set<string>();
    for (const exp of existingExpenses) {
      dbDuplicateKeys.add(
        this.generateDuplicateKey(
          exp.expenseDate,
          exp.amount,
          exp.counterparty,
          exp.documentNumber,
        ),
      );
    }

    const batchDuplicateKeys = new Set<string>();
    const newCategoriesFound = new Set<string>();

    let validCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;

    const parsedRows: ParsedExpenseRow[] = [];

    for (const r of rawRows) {
      const rowErrors: string[] = [];
      const dateCell = detected.date !== -1 ? r.values[detected.date] : null;
      const amountCell = detected.amount !== -1 ? r.values[detected.amount] : null;
      const categoryCell = detected.category !== -1 ? r.values[detected.category] : null;
      const counterpartyCell = detected.counterparty !== -1 ? r.values[detected.counterparty] : null;
      const docCell = detected.documentNumber !== -1 ? r.values[detected.documentNumber] : null;
      const descCell = detected.description !== -1 ? r.values[detected.description] : null;

      const dateRaw = cellToString(dateCell);
      const parsedDate = parseCellDate(dateCell);
      if (!parsedDate) {
        rowErrors.push('Некорректная дата');
      }

      const parsedAmountResult = parseCellAmount(amountCell);
      let amount = 0;
      let amountRaw = cellToString(amountCell);
      if (!parsedAmountResult || parsedAmountResult.amount <= 0) {
        rowErrors.push('Некорректная сумма расхода (должна быть больше нуля)');
      } else {
        amount = parsedAmountResult.amount;
        amountRaw = parsedAmountResult.raw;
      }

      const category = cellToString(categoryCell);
      if (!category) {
        rowErrors.push('Статья расхода не заполнена');
      }

      const counterparty = cellToString(counterpartyCell) || null;
      const documentNumber = cellToString(docCell) || null;
      const description = cellToString(descCell) || null;

      let isDuplicate = false;
      let duplicateReason: string | undefined;

      if (parsedDate && amount > 0) {
        const key = this.generateDuplicateKey(
          parsedDate,
          amount,
          counterparty,
          documentNumber,
        );

        if (dbDuplicateKeys.has(key)) {
          isDuplicate = true;
          duplicateReason =
            'Расход с такой датой, суммой, контрагентом и номером документа уже есть в журнале';
        } else if (batchDuplicateKeys.has(key)) {
          isDuplicate = true;
          duplicateReason =
            'Дубликат строки внутри загружаемого файла';
        } else {
          batchDuplicateKeys.add(key);
        }
      }

      let isNewCategory = false;
      if (category) {
        const lowerCat = category.toLowerCase().trim();
        if (!existingCategorySet.has(lowerCat)) {
          isNewCategory = true;
          newCategoriesFound.add(category.trim());
        }
      }

      const isValid = rowErrors.length === 0;
      if (!isValid) {
        errorCount++;
      } else if (isDuplicate) {
        duplicateCount++;
      } else {
        validCount++;
      }

      parsedRows.push({
        rowIndex: r.rowIndex,
        dateRaw,
        expenseDate: parsedDate,
        amount,
        amountRaw,
        category,
        counterparty,
        documentNumber,
        description,
        isValid,
        errors: rowErrors,
        isDuplicate,
        duplicateReason,
        isNewCategory,
        skip: !isValid || isDuplicate,
      });
    }

    // Сохраняем партию со статусом PREVIEW в БД
    const batch = await this.prisma.importBatch.create({
      data: {
        tenantId,
        kind: ImportKind.EXPENSES,
        fileName: file.originalname,
        status: ImportStatus.PREVIEW,
        rowsTotal: parsedRows.length,
        rowsApplied: 0,
        rowsSkipped: 0,
        createdById: user.id!,
      },
    });

    // Сохраняем исходный файл и спарсенный превью на диск
    try {
      this.ensureStorageDir();
      const payloadFile = path.join(this.storageDir, `${batch.id}.json`);
      fs.writeFileSync(payloadFile, JSON.stringify(parsedRows), 'utf8');

      const originalFileExt = path.extname(file.originalname) || '.xlsx';
      const storedFileName = `${batch.id}_original${originalFileExt}`;
      const originalFilePath = path.join(this.storageDir, storedFileName);
      fs.writeFileSync(originalFilePath, file.buffer);

      await this.prisma.importBatch.update({
        where: { id: batch.id },
        data: {
          fileUrl: `/uploads/imports/${storedFileName}`,
        },
      });
    } catch (saveErr: any) {
      this.logger.error(`Could not save import preview to disk: ${saveErr.message}`, saveErr.stack);
      await this.prisma.importBatch.delete({ where: { id: batch.id } }).catch(() => {});
      throw new InternalServerErrorException({
        code: 'IMPORTS.STORAGE_SAVE_FAILED',
        message: 'Не удалось сохранить файлы предпросмотра партии импорта на диск',
      });
    }

    return {
      batchId: batch.id,
      tenantId,
      fileName: file.originalname,
      kind: ImportKind.EXPENSES,
      rowsTotal: parsedRows.length,
      validCount,
      duplicateCount,
      errorCount,
      newCategories: Array.from(newCategoriesFound),
      detectedColumns: {
        date: detected.date !== -1 ? headers[detected.date] : null,
        amount: detected.amount !== -1 ? headers[detected.amount] : null,
        category: detected.category !== -1 ? headers[detected.category] : null,
        counterparty: detected.counterparty !== -1 ? headers[detected.counterparty] : null,
        documentNumber: detected.documentNumber !== -1 ? headers[detected.documentNumber] : null,
        description: detected.description !== -1 ? headers[detected.description] : null,
      },
      rows: parsedRows,
    };
  }

  /**
   * 1b. Предпросмотр партии бюджета (Preview)
   * Формат файла: категории в строках, 12 месяцев в колонках
   * Ничего не создает в таблице BudgetLine!
   */
  async previewBudget(
    tenantId: string,
    user: { id?: string; tenantId?: string | null; role: UserRole },
    file: Express.Multer.File,
    dto?: PreviewBudgetDto,
  ): Promise<BudgetImportPreviewResult> {
    assertUserBelongsToTenant(user, tenantId, 'импорта бюджета');

    if (user.role !== UserRole.HOA_ADMIN && user.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException({
        code: 'IMPORTS.PREVIEW_FORBIDDEN',
        message: 'Недостаточно прав для импорта бюджета',
      });
    }

    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException({
        code: 'IMPORTS.FILE_REQUIRED',
        message: 'Файл обязателен для загрузки',
      });
    }

    const lowerName = file.originalname.toLowerCase();
    if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.csv')) {
      throw new BadRequestException({
        code: 'IMPORTS.INVALID_FILE_TYPE',
        message: 'Разрешены только файлы Excel (.xlsx) и CSV (.csv)',
      });
    }

    let parsedWorkbook: { headers: string[]; rows: { rowIndex: number; values: any[] }[] };
    try {
      parsedWorkbook = await readWorkbookFromBuffer(file.buffer, file.originalname);
    } catch (err: any) {
      throw new BadRequestException({
        code: 'IMPORTS.FILE_PARSE_FAILED',
        message: `Не удалось прочитать файл: ${err?.message || 'ошибка формата'}`,
      });
    }

    const { headers, rows: rawRows } = parsedWorkbook;
    if (rawRows.length === 0) {
      throw new BadRequestException({
        code: 'IMPORTS.EMPTY_FILE',
        message: 'Файл не содержит строк с данными',
      });
    }

    const detected = detectBudgetColumns(headers);
    const year = Number(dto?.year) || new Date().getFullYear();

    // Загружаем существующие строки бюджета тенанта за этот год
    const existingLines = await this.prisma.budgetLine.findMany({
      where: {
        tenantId,
        year,
      },
      select: {
        month: true,
        category: true,
        plannedAmount: true,
      },
    });

    const existingMap = new Set<string>();
    for (const el of existingLines) {
      existingMap.add(`${el.month}|${el.category.trim().toLowerCase()}`);
    }

    let validCount = 0;
    let willUpdateCount = 0;
    let newCount = 0;
    let errorCount = 0;

    const parsedCategoryRows: ParsedBudgetCategoryRow[] = [];

    for (const r of rawRows) {
      const rowErrors: string[] = [];
      const catCell = detected.category !== -1 ? r.values[detected.category] : null;
      const category = cellToString(catCell).trim();

      if (!category) {
        rowErrors.push('Категория не заполнена');
      }

      const months: any[] = [];
      let rowTotal = 0;
      let rowWillUpdate = 0;
      let rowNew = 0;

      for (let m = 1; m <= 12; m++) {
        const colIdx = detected.months.get(m);
        const mCell = colIdx !== undefined ? r.values[colIdx] : null;
        const parsedAmount = parseCellAmount(mCell);
        const mErrors: string[] = [];

        let plannedAmount = 0;
        let amountRaw = cellToString(mCell);

        if (parsedAmount) {
          if (parsedAmount.amount < 0) {
            mErrors.push('Сумма не может быть отрицательной');
          } else {
            plannedAmount = parsedAmount.amount;
            amountRaw = parsedAmount.raw;
          }
        } else {
          // Пустая ячейка трактуется как 0
          plannedAmount = 0;
        }

        rowTotal += plannedAmount;

        const key = `${m}|${category.toLowerCase()}`;
        const willUpdate = existingMap.has(key);
        if (willUpdate) {
          rowWillUpdate++;
        } else {
          rowNew++;
        }

        const isValid = mErrors.length === 0;
        months.push({
          month: m,
          plannedAmount,
          amountRaw,
          willUpdate,
          isValid,
          errors: mErrors,
        });
      }

      const isValid = rowErrors.length === 0;
      if (!isValid) {
        errorCount++;
      } else {
        validCount++;
        willUpdateCount += rowWillUpdate;
        newCount += rowNew;
      }

      parsedCategoryRows.push({
        rowIndex: r.rowIndex,
        category,
        categoryRaw: cellToString(catCell),
        year,
        months,
        rowTotal: Math.round(rowTotal * 100) / 100,
        isValid,
        errors: rowErrors,
        willUpdateCount: rowWillUpdate,
        newCount: rowNew,
        skip: !isValid,
      });
    }

    // Создаем партию со статусом PREVIEW в БД (ничего не создает в BudgetLine!)
    const batch = await this.prisma.importBatch.create({
      data: {
        tenantId,
        kind: ImportKind.BUDGET,
        fileName: file.originalname,
        status: ImportStatus.PREVIEW,
        rowsTotal: parsedCategoryRows.length,
        rowsApplied: 0,
        rowsSkipped: 0,
        createdById: user.id!,
      },
    });

    // Сохраняем исходный файл и спарсенный превью на диск
    try {
      this.ensureStorageDir();
      const payloadFile = path.join(this.storageDir, `${batch.id}.json`);
      fs.writeFileSync(
        payloadFile,
        JSON.stringify({ kind: 'BUDGET', year, rows: parsedCategoryRows }),
        'utf8',
      );

      const originalFileExt = path.extname(file.originalname) || '.xlsx';
      const storedFileName = `${batch.id}_original${originalFileExt}`;
      const originalFilePath = path.join(this.storageDir, storedFileName);
      fs.writeFileSync(originalFilePath, file.buffer);

      await this.prisma.importBatch.update({
        where: { id: batch.id },
        data: {
          fileUrl: `/uploads/imports/${storedFileName}`,
        },
      });
    } catch (saveErr: any) {
      this.logger.error(`Could not save import preview to disk: ${saveErr.message}`, saveErr.stack);
      await this.prisma.importBatch.delete({ where: { id: batch.id } }).catch(() => {});
      throw new InternalServerErrorException({
        code: 'IMPORTS.STORAGE_SAVE_FAILED',
        message: 'Не удалось сохранить файлы предпросмотра партии импорта на диск',
      });
    }

    const monthsMappedRecord: Record<number, string | number> = {};
    detected.months.forEach((colIdx, m) => {
      monthsMappedRecord[m] = headers[colIdx] || colIdx;
    });

    return {
      batchId: batch.id,
      tenantId,
      year,
      fileName: file.originalname,
      kind: ImportKind.BUDGET,
      rowsTotal: parsedCategoryRows.length,
      validCount,
      willUpdateCount,
      newCount,
      errorCount,
      categoriesCount: parsedCategoryRows.length,
      detectedColumns: {
        categoryColumn: detected.category !== -1 ? headers[detected.category] : null,
        monthsMapped: monthsMappedRecord,
      },
      rows: parsedCategoryRows,
    };
  }

  /**
   * 2. Применение партии (Apply)
   */
  async applyImport(
    batchId: string,
    user: { id?: string; tenantId?: string | null; role: UserRole },
    dto?: ApplyImportDto,
  ) {
    if (user.role !== UserRole.HOA_ADMIN && user.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException({
        code: 'IMPORTS.APPLY_FORBIDDEN',
        message: 'Недостаточно прав для применения партии импорта',
      });
    }

    const batch = await this.prisma.importBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      throw new NotFoundException({
        code: 'IMPORTS.BATCH_NOT_FOUND',
        message: 'Партия импорта не найдена',
      });
    }

    assertUserBelongsToTenant(user, batch.tenantId, 'партии импорта');

    if (batch.status === ImportStatus.APPLIED) {
      throw new BadRequestException({
        code: 'IMPORTS.BATCH_ALREADY_APPLIED',
        message: 'Данная партия импорта уже была применена',
      });
    }

    if (batch.status === ImportStatus.VOIDED) {
      throw new BadRequestException({
        code: 'IMPORTS.BATCH_VOIDED',
        message: 'Данная партия импорта аннулирована и не может быть применена',
      });
    }

    // Загружаем сохраненный payload
    const payloadFile = path.join(this.storageDir, `${batch.id}.json`);
    if (!fs.existsSync(payloadFile)) {
      throw new BadRequestException({
        code: 'IMPORTS.PAYLOAD_NOT_FOUND',
        message: 'Данные предпросмотра партии не найдены или устарели',
      });
    }

    const skipSet = new Set<number>(dto?.rowIndexesToSkip || []);

    // Применение партии импорта бюджета
    if (batch.kind === ImportKind.BUDGET) {
      let payloadData: { kind: string; year: number; rows: ParsedBudgetCategoryRow[] };
      try {
        payloadData = JSON.parse(fs.readFileSync(payloadFile, 'utf8'));
      } catch {
        throw new BadRequestException({
          code: 'IMPORTS.PAYLOAD_CORRUPT',
          message: 'Ошибка чтения данных предпросмотра бюджета',
        });
      }

      const rows = payloadData.rows || [];
      const year = payloadData.year || new Date().getFullYear();
      let appliedCount = 0;
      let skippedCount = 0;

      await this.prisma.$transaction(async (tx) => {
        for (const row of rows) {
          if (!row.isValid || skipSet.has(row.rowIndex)) {
            skippedCount++;
            continue;
          }

          appliedCount++;
          for (const m of row.months) {
            if (m.isValid && typeof m.plannedAmount === 'number' && m.plannedAmount >= 0) {
              await tx.budgetLine.upsert({
                where: {
                  tenantId_year_month_category: {
                    tenantId: batch.tenantId,
                    year,
                    month: m.month,
                    category: row.category.trim(),
                  },
                },
                create: {
                  tenantId: batch.tenantId,
                  year,
                  month: m.month,
                  category: row.category.trim(),
                  plannedAmount: m.plannedAmount,
                  importBatchId: batch.id,
                  createdById: user.id!,
                },
                update: {
                  plannedAmount: m.plannedAmount,
                  importBatchId: batch.id,
                },
              });
            }
          }
        }

        await tx.importBatch.update({
          where: { id: batch.id },
          data: {
            status: ImportStatus.APPLIED,
            rowsApplied: appliedCount,
            rowsSkipped: skippedCount,
          },
        });
      });

      await this.auditLogService.log({
        tenantId: batch.tenantId,
        actorId: user.id,
        action: 'IMPORT_BATCH_APPLIED',
        targetType: 'ImportBatch',
        targetId: batch.id,
        metadata: {
          kind: batch.kind,
          fileName: batch.fileName,
          rowsApplied: appliedCount,
          rowsSkipped: skippedCount,
          rowsTotal: batch.rowsTotal,
        },
      });

      return {
        batchId: batch.id,
        status: ImportStatus.APPLIED,
        rowsTotal: batch.rowsTotal,
        rowsApplied: appliedCount,
        rowsSkipped: skippedCount,
      };
    }

    let parsedRows: ParsedExpenseRow[];
    try {
      parsedRows = JSON.parse(fs.readFileSync(payloadFile, 'utf8'));
    } catch {
      throw new BadRequestException({
        code: 'IMPORTS.PAYLOAD_CORRUPT',
        message: 'Ошибка чтения данных предпросмотра',
      });
    }

    const confirmNew = Boolean(dto?.confirmNewCategories);

    // Фильтруем строки для создания
    const toApply: ParsedExpenseRow[] = [];
    let skippedCount = 0;

    for (const r of parsedRows) {
      // Строки с ошибками никогда не применяются
      if (!r.isValid || !r.expenseDate || r.amount <= 0 || !r.category) {
        skippedCount++;
        continue;
      }

      // Дубликаты не создаются
      if (r.isDuplicate) {
        skippedCount++;
        continue;
      }

      // Пропуск по запросу пользователя (чекбокс)
      if (skipSet.has(r.rowIndex)) {
        skippedCount++;
        continue;
      }

      // Неподтвержденные новые категории
      if (r.isNewCategory && !confirmNew) {
        skippedCount++;
        continue;
      }

      toApply.push(r);
    }

    // Применяем в транзакции
    const appliedCount = toApply.length;

    await this.prisma.$transaction(async (tx) => {
      // Создаем расходы пачкой
      for (const row of toApply) {
        const d = new Date(row.expenseDate!);
        await tx.expense.create({
          data: {
            tenantId: batch.tenantId,
            category: row.category.trim(),
            description: row.description?.trim() || null,
            amount: row.amount,
            expenseDate: d,
            counterparty: row.counterparty?.trim() || null,
            documentNumber: row.documentNumber?.trim() || null,
            source: ExpenseSource.IMPORT_EXCEL,
            importBatchId: batch.id,
            periodMonth: d.getUTCMonth() + 1,
            periodYear: d.getUTCFullYear(),
            recordedById: user.id!,
          },
        });
      }

      await tx.importBatch.update({
        where: { id: batch.id },
        data: {
          status: ImportStatus.APPLIED,
          rowsApplied: appliedCount,
          rowsSkipped: skippedCount,
        },
      });
    });

    // Аудит-лог
    await this.auditLogService.log({
      tenantId: batch.tenantId,
      actorId: user.id,
      action: 'IMPORT_BATCH_APPLIED',
      targetType: 'ImportBatch',
      targetId: batch.id,
      metadata: {
        kind: batch.kind,
        fileName: batch.fileName,
        rowsApplied: appliedCount,
        rowsSkipped: skippedCount,
        rowsTotal: batch.rowsTotal,
      },
    });

    return {
      batchId: batch.id,
      status: ImportStatus.APPLIED,
      rowsTotal: batch.rowsTotal,
      rowsApplied: appliedCount,
      rowsSkipped: skippedCount,
    };
  }

  /**
   * 3. Откат партии (Void)
   * Каскадно аннулирует расходы партии и саму партию с обязательной причиной
   */
  async voidImport(
    batchId: string,
    user: { id?: string; tenantId?: string | null; role: UserRole },
    dto: VoidImportDto,
  ) {
    if (user.role !== UserRole.HOA_ADMIN && user.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException({
        code: 'IMPORTS.VOID_FORBIDDEN',
        message: 'Недостаточно прав для аннулирования партии импорта',
      });
    }

    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException({
        code: 'IMPORTS.VOID_REASON_REQUIRED',
        message: 'Причина отката обязательна для заполнения',
      });
    }

    const batch = await this.prisma.importBatch.findUnique({
      where: { id: batchId },
      include: {
        expenses: {
          where: { isVoided: false },
          select: { id: true },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException({
        code: 'IMPORTS.BATCH_NOT_FOUND',
        message: 'Партия импорта не найдена',
      });
    }

    assertUserBelongsToTenant(user, batch.tenantId, 'партии импорта');

    if (batch.status === ImportStatus.VOIDED) {
      throw new BadRequestException({
        code: 'IMPORTS.BATCH_ALREADY_VOIDED',
        message: 'Партия уже аннулирована',
      });
    }

    if (batch.status === ImportStatus.PREVIEW) {
      throw new BadRequestException({
        code: 'IMPORTS.CANNOT_VOID_PREVIEW',
        message: 'Нельзя откатить партию в статусе предпросмотра (она еще не была применена)',
      });
    }

    const now = new Date();

    if (batch.kind === ImportKind.BUDGET) {
      const [updatedBatch, deletedCount] = await this.prisma.$transaction([
        this.prisma.importBatch.update({
          where: { id: batch.id },
          data: {
            status: ImportStatus.VOIDED,
            voidedAt: now,
            voidedById: user.id!,
            voidedReason: reason,
          },
          include: {
            createdBy: {
              select: { id: true, firstName: true, lastName: true, role: true },
            },
            voidedBy: {
              select: { id: true, firstName: true, lastName: true, role: true },
            },
          },
        }),
        this.prisma.budgetLine.deleteMany({
          where: {
            importBatchId: batch.id,
          },
        }),
      ]);

      await this.auditLogService.log({
        tenantId: batch.tenantId,
        actorId: user.id,
        action: 'IMPORT_BATCH_VOIDED',
        targetType: 'ImportBatch',
        targetId: batch.id,
        metadata: {
          kind: batch.kind,
          voidedReason: reason,
          linesDeleted: deletedCount.count,
          fileName: batch.fileName,
        },
      });

      return updatedBatch;
    }

    const expensesToVoidCount = batch.expenses.length;

    const [updatedBatch] = await this.prisma.$transaction([
      this.prisma.importBatch.update({
        where: { id: batch.id },
        data: {
          status: ImportStatus.VOIDED,
          voidedAt: now,
          voidedById: user.id!,
          voidedReason: reason,
        },
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true, role: true },
          },
          voidedBy: {
            select: { id: true, firstName: true, lastName: true, role: true },
          },
        },
      }),
      this.prisma.expense.updateMany({
        where: {
          importBatchId: batch.id,
          isVoided: false,
        },
        data: {
          isVoided: true,
          voidedAt: now,
          voidedById: user.id!,
          voidedReason: `Откат партии импорта: ${reason}`,
        },
      }),
    ]);

    await this.auditLogService.log({
      tenantId: batch.tenantId,
      actorId: user.id,
      action: 'IMPORT_BATCH_VOIDED',
      targetType: 'ImportBatch',
      targetId: batch.id,
      metadata: {
        voidedReason: reason,
        expensesVoidedCount: expensesToVoidCount,
        fileName: batch.fileName,
      },
    });

    return updatedBatch;
  }

  /**
   * 4. История партий импорта ЖК
   */
  async getImportHistory(
    tenantId: string,
    user: { id?: string; tenantId?: string | null; role: UserRole },
    query?: GetImportsQueryDto,
  ) {
    const allowedRoles: UserRole[] = [
      UserRole.HOA_ADMIN,
      UserRole.HOA_CHAIRMAN,
      UserRole.SUPERADMIN,
    ];

    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException({
        code: 'IMPORTS.VIEW_FORBIDDEN',
        message: 'Недостаточно прав для просмотра истории импорта',
      });
    }

    assertUserBelongsToTenant(user, tenantId, 'истории импорта');

    const where: any = { tenantId };
    if (query?.kind) {
      where.kind = query.kind;
    }
    if (query?.status) {
      where.status = query.status;
    }

    const limit = query?.limit ? Number(query.limit) : 50;
    const offset = query?.offset ? Number(query.offset) : 0;

    const [items, total] = await Promise.all([
      this.prisma.importBatch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true, role: true },
          },
          voidedBy: {
            select: { id: true, firstName: true, lastName: true, role: true },
          },
          _count: {
            select: { expenses: true },
          },
        },
      }),
      this.prisma.importBatch.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  /**
   * 5. Генерация шаблона expenses.xlsx
   */
  async getExpensesTemplate(): Promise<{ buffer: Buffer; filename: string }> {
    const buffer = await createExpensesTemplateBuffer();
    return {
      buffer,
      filename: 'expenses_template.xlsx',
    };
  }

  /**
   * 6. Генерация шаблона budget.xlsx
   */
  async getBudgetTemplate(): Promise<{ buffer: Buffer; filename: string }> {
    const buffer = await createBudgetTemplateBuffer();
    return {
      buffer,
      filename: 'budget_template.xlsx',
    };
  }
}
