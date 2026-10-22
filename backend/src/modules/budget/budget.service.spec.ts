import { Test, TestingModule } from '@nestjs/testing';
import { BudgetService, round2, getExpensePeriod, escapeFormulaText } from './budget.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { UserRole } from '@prisma/client';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

describe('BudgetService', () => {
  let service: BudgetService;
  let prisma: any;
  let auditLog: any;

  const mockTenantId = 'tenant-1111-2222';
  const otherTenantId = 'tenant-other-9999';

  const adminUser = {
    id: 'user-admin-1',
    tenantId: mockTenantId,
    role: UserRole.HOA_ADMIN,
  };

  const chairmanUser = {
    id: 'user-chairman-1',
    tenantId: mockTenantId,
    role: UserRole.HOA_CHAIRMAN,
  };

  const residentUser = {
    id: 'user-resident-1',
    tenantId: mockTenantId,
    role: UserRole.RESIDENT_OWNER,
  };

  beforeEach(async () => {
    prisma = {
      budgetLine: {
        findMany: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      expense: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn((cbOrArray) => {
        if (typeof cbOrArray === 'function') {
          return cbOrArray(prisma);
        }
        return Promise.all(cbOrArray);
      }),
    };

    auditLog = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BudgetService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();

    service = module.get<BudgetService>(BudgetService);
  });

  describe('Date & Timezone Handling (Asia/Almaty UTC+5)', () => {
    it('prioritizes periodMonth and periodYear over expenseDate', () => {
      const exp = {
        periodMonth: 3,
        periodYear: 2026,
        expenseDate: new Date('2026-05-15T12:00:00Z'),
      };
      const p = getExpensePeriod(exp);
      expect(p).toEqual({ year: 2026, month: 3 });
    });

    it('correctly maps boundary date Jan 31 23:59:00 in Asia/Almaty (month 1)', () => {
      // 2026-01-31 23:59:00 Asia/Almaty (UTC+5) = 2026-01-31 18:59:00 UTC
      const exp = {
        expenseDate: new Date('2026-01-31T18:59:00.000Z'),
      };
      const p = getExpensePeriod(exp, 'Asia/Almaty');
      expect(p).toEqual({ year: 2026, month: 1 });
    });

    it('correctly maps boundary date Feb 01 00:00:01 in Asia/Almaty (month 2)', () => {
      // 2026-02-01 00:00:01 Asia/Almaty (UTC+5) = 2026-01-31 19:00:01 UTC
      const exp = {
        expenseDate: new Date('2026-01-31T19:00:01.000Z'),
      };
      const p = getExpensePeriod(exp, 'Asia/Almaty');
      expect(p).toEqual({ year: 2026, month: 2 });
    });

    it('correctly maps boundary date Dec 31 23:59:59 to year 2026 in Asia/Almaty', () => {
      // 2026-12-31 23:59:59 Asia/Almaty = 2026-12-31 18:59:59 UTC
      const exp = {
        expenseDate: new Date('2026-12-31T18:59:59.000Z'),
      };
      const p = getExpensePeriod(exp, 'Asia/Almaty');
      expect(p).toEqual({ year: 2026, month: 12 });
    });
  });

  describe('Budget vs Actual Calculation (12-month fixture)', () => {
    it('calculates months, quarters, year totals, cumulative amounts and handles planned=0 and case-insensitivity', async () => {
      // 12 months planned for "Текущий ремонт" (each month 100,000)
      const mockBudgetLines: any[] = [];
      for (let m = 1; m <= 12; m++) {
        mockBudgetLines.push({
          id: `bl-${m}`,
          tenantId: mockTenantId,
          year: 2026,
          month: m,
          category: 'текущий ремонт', // lowercase
          plannedAmount: 100000,
        });
      }

      // Budget for "Зарплата персонала" (planned=50,000 in months 1-12)
      for (let m = 1; m <= 12; m++) {
        mockBudgetLines.push({
          id: `bl-z-${m}`,
          tenantId: mockTenantId,
          year: 2026,
          month: m,
          category: 'Зарплата персонала',
          plannedAmount: 50000,
        });
      }

      prisma.budgetLine.findMany.mockResolvedValue(mockBudgetLines);

      // Actual expenses:
      // 1. "Текущий Ремонт" (different case)
      // Jan: 120,000 (overbudget by 20,000, delta% = +20%)
      // Feb: 80,000 (underbudget by 20,000, delta% = -20%)
      // Mar: 100,000
      // Apr: 100,000
      // May: 100,000
      // Jun: 100,000
      // Jul: 100,000
      // Aug: 100,000
      // Sep: 100,000
      // Oct: 100,000
      // Nov: 100,000
      // Dec: 100,000
      // 2. "Непредвиденные расходы" (no budget, actual=30,000 in Jan)
      // 3. Voided expense (amount=500,000 in Jan) -> MUST NOT be in actual!
      const mockExpenses: any[] = [
        {
          id: 'exp-1',
          category: 'Текущий Ремонт', // Canonical should prefer this
          amount: 120000,
          expenseDate: new Date('2026-01-10T10:00:00Z'),
          periodMonth: 1,
          periodYear: 2026,
        },
        {
          id: 'exp-2',
          category: 'текущий ремонт',
          amount: 80000,
          expenseDate: new Date('2026-02-10T10:00:00Z'),
          periodMonth: 2,
          periodYear: 2026,
        },
        ...Array.from({ length: 10 }, (_, i) => ({
          id: `exp-${i + 3}`,
          category: 'Текущий Ремонт',
          amount: 100000,
          expenseDate: new Date(`2026-${String(i + 3).padStart(2, '0')}-15T10:00:00Z`),
          periodMonth: i + 3,
          periodYear: 2026,
        })),
        {
          id: 'exp-nobudget',
          category: 'Непредвиденные расходы',
          amount: 30000,
          expenseDate: new Date('2026-01-20T10:00:00Z'),
          periodMonth: 1,
          periodYear: 2026,
        },
      ];

      prisma.expense.findMany.mockResolvedValue(mockExpenses);

      const result = await service.getBudgetVsActual(mockTenantId, adminUser, { year: 2026 });

      expect(result.year).toBe(2026);
      expect(result.tenantId).toBe(mockTenantId);
      expect(result.actualSources).toEqual(['EXPENSES']);

      // Check category canonical name
      const repairCat = result.categories.find(
        (c) => c.category.toLowerCase() === 'текущий ремонт',
      );
      expect(repairCat).toBeDefined();
      expect(repairCat!.category).toBe('Текущий Ремонт'); // Preferred from expense

      // Check Jan for repairCat:
      // planned = 100,000, actual = 120,000, delta = 20,000, deltaPercent = 20%
      const m1 = repairCat!.months[0];
      expect(m1.month).toBe(1);
      expect(m1.planned).toBe(100000);
      expect(m1.actual).toBe(120000);
      expect(m1.delta).toBe(20000);
      expect(m1.deltaPercent).toBe(20);
      expect(m1.isOverBudget).toBe(true);

      // Cumulative for Jan:
      expect(m1.cumulative.planned).toBe(100000);
      expect(m1.cumulative.actual).toBe(120000);
      expect(m1.cumulative.delta).toBe(20000);
      expect(m1.cumulative.deltaPercent).toBe(20);

      // Check Feb for repairCat:
      // planned = 100,000, actual = 80,000, delta = -20,000, deltaPercent = -20%
      const m2 = repairCat!.months[1];
      expect(m2.month).toBe(2);
      expect(m2.planned).toBe(100000);
      expect(m2.actual).toBe(80000);
      expect(m2.delta).toBe(-20000);
      expect(m2.deltaPercent).toBe(-20);
      expect(m2.isOverBudget).toBe(false);

      // Cumulative for Feb:
      // planned = 200,000, actual = 200,000, delta = 0, deltaPercent = 0%
      expect(m2.cumulative.planned).toBe(200000);
      expect(m2.cumulative.actual).toBe(200000);
      expect(m2.cumulative.delta).toBe(0);
      expect(m2.cumulative.deltaPercent).toBe(0);

      // Check Q1 aggregate (months 1-3):
      // planned = 300,000, actual = 120,000 + 80,000 + 100,000 = 300,000
      const q1 = repairCat!.quarters[0];
      expect(q1.quarter).toBe(1);
      expect(q1.planned).toBe(300000);
      expect(q1.actual).toBe(300000);
      expect(q1.delta).toBe(0);
      expect(q1.deltaPercent).toBe(0);

      // Check year total for repairCat:
      // planned = 1,200,000, actual = 1,200,000
      expect(repairCat!.year.planned).toBe(1200000);
      expect(repairCat!.year.actual).toBe(1200000);
      expect(repairCat!.year.delta).toBe(0);
      expect(repairCat!.year.deltaPercent).toBe(0);

      // Check category with actual but planned=0 ("Непредвиденные расходы")
      const noBudgetCat = result.categories.find(
        (c) => c.category === 'Непредвиденные расходы',
      );
      expect(noBudgetCat).toBeDefined();
      expect(noBudgetCat!.months[0].planned).toBe(0);
      expect(noBudgetCat!.months[0].actual).toBe(30000);
      expect(noBudgetCat!.months[0].delta).toBe(30000);
      expect(noBudgetCat!.months[0].deltaPercent).toBeNull(); // Must be null when planned=0!

      // Check flags:
      expect(result.categoriesWithoutBudget).toContain('Непредвиденные расходы');
      expect(result.categoriesWithoutActual).toContain('Зарплата персонала');
    });

    it('correctly detects outlier months when >=3 non-zero months and actual > average * 1.5', async () => {
      // 4 months with expenses:
      // Month 1: 100,000
      // Month 2: 100,000
      // Month 3: 100,000
      // Month 4: 500,000 -> average = 200,000, threshold = 300,000 -> Month 4 is outlier!
      prisma.budgetLine.findMany.mockResolvedValue([]);
      prisma.expense.findMany.mockResolvedValue([
        { id: '1', category: 'Охрана', amount: 100000, expenseDate: new Date('2026-01-01'), periodMonth: 1, periodYear: 2026 },
        { id: '2', category: 'Охрана', amount: 100000, expenseDate: new Date('2026-02-01'), periodMonth: 2, periodYear: 2026 },
        { id: '3', category: 'Охрана', amount: 100000, expenseDate: new Date('2026-03-01'), periodMonth: 3, periodYear: 2026 },
        { id: '4', category: 'Охрана', amount: 500000, expenseDate: new Date('2026-04-01'), periodMonth: 4, periodYear: 2026 },
      ]);

      const result = await service.getBudgetVsActual(mockTenantId, adminUser, { year: 2026 });
      const cat = result.categories.find((c) => c.category === 'Охрана');
      expect(cat).toBeDefined();
      expect(cat!.outlierMonths).toEqual([4]);
      expect(cat!.months[3].isOutlier).toBe(true);
      expect(cat!.months[0].isOutlier).toBe(false);
    });

    it('does not calculate outliers if fewer than 3 non-zero months', async () => {
      // Only 2 non-zero months -> no outliers computed
      prisma.budgetLine.findMany.mockResolvedValue([]);
      prisma.expense.findMany.mockResolvedValue([
        { id: '1', category: 'Охрана', amount: 100000, expenseDate: new Date('2026-01-01'), periodMonth: 1, periodYear: 2026 },
        { id: '2', category: 'Охрана', amount: 1000000, expenseDate: new Date('2026-02-01'), periodMonth: 2, periodYear: 2026 },
      ]);

      const result = await service.getBudgetVsActual(mockTenantId, adminUser, { year: 2026 });
      const cat = result.categories.find((c) => c.category === 'Охрана');
      expect(cat!.outlierMonths).toEqual([]);
      expect(cat!.months[1].isOutlier).toBe(false);
    });
  });

  describe('Budget Upsert & Modification', () => {
    it('saves budget lines and records in audit log for HOA_ADMIN', async () => {
      prisma.budgetLine.upsert.mockResolvedValue({
        id: 'bl-saved-1',
        tenantId: mockTenantId,
        year: 2026,
        month: 1,
        category: 'Текущий ремонт',
        plannedAmount: 150000,
      });

      const res = await service.updateBudgetLines(mockTenantId, adminUser, {
        lines: [
          {
            year: 2026,
            month: 1,
            category: '  Текущий ремонт  ',
            plannedAmount: 150000,
            note: 'План на январь',
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.count).toBe(1);
      expect(prisma.budgetLine.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId_year_month_category: {
              tenantId: mockTenantId,
              year: 2026,
              month: 1,
              category: 'Текущий ремонт',
            },
          },
          create: expect.objectContaining({
            tenantId: mockTenantId,
            year: 2026,
            month: 1,
            category: 'Текущий ремонт',
            plannedAmount: 150000,
            note: 'План на январь',
            createdById: adminUser.id,
          }),
        }),
      );

      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: mockTenantId,
          action: 'BUDGET_UPDATED',
        }),
      );
    });

    it('rejects batch larger than 500 items', async () => {
      const largeBatch = Array.from({ length: 501 }, (_, i) => ({
        year: 2026,
        month: 1,
        category: `Категория ${i}`,
        plannedAmount: 1000,
      }));

      await expect(
        service.updateBudgetLines(mockTenantId, adminUser, { lines: largeBatch as any }),
      ).rejects.toThrow(BadRequestException);
    });

    it('deletes category for year and records in audit log', async () => {
      prisma.budgetLine.deleteMany.mockResolvedValue({ count: 12 });

      const res = await service.deleteBudgetCategory(mockTenantId, adminUser, {
        year: 2026,
        category: 'Текущий ремонт',
      });

      expect(res.success).toBe(true);
      expect(res.deletedCount).toBe(12);
      expect(prisma.budgetLine.deleteMany).toHaveBeenCalledWith({
        where: {
          tenantId: mockTenantId,
          year: 2026,
          category: {
            equals: 'Текущий ремонт',
            mode: 'insensitive',
          },
        },
      });
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'BUDGET_CATEGORY_DELETED',
        }),
      );
    });
  });

  describe('Role-based Access & Multi-tenant Isolation', () => {
    it('allows HOA_CHAIRMAN to read budget lines and summary (200)', async () => {
      prisma.budgetLine.findMany.mockResolvedValue([]);
      prisma.expense.findMany.mockResolvedValue([]);

      const getRes = await service.getBudgetLines(mockTenantId, chairmanUser, { year: 2026 });
      expect(getRes.lines).toEqual([]);

      const summaryRes = await service.getBudgetVsActual(mockTenantId, chairmanUser, { year: 2026 });
      expect(summaryRes.year).toBe(2026);
    });

    it('forbids HOA_CHAIRMAN from modifying budget (403)', async () => {
      await expect(
        service.updateBudgetLines(mockTenantId, chairmanUser, {
          lines: [{ year: 2026, month: 1, category: 'Ремонт', plannedAmount: 100 }],
        }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.deleteBudgetCategory(mockTenantId, chairmanUser, {
          year: 2026,
          category: 'Ремонт',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids residents from accessing budget or summary (403)', async () => {
      await expect(
        service.getBudgetLines(mockTenantId, residentUser, { year: 2026 }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.getBudgetVsActual(mockTenantId, residentUser, { year: 2026 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks cross-tenant access to budget (403)', async () => {
      await expect(
        service.getBudgetLines(otherTenantId, adminUser, { year: 2026 }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.updateBudgetLines(otherTenantId, adminUser, {
          lines: [{ year: 2026, month: 1, category: 'Ремонт', plannedAmount: 100 }],
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Excel Export (Multi-sheet XLSX & Security)', () => {
    it('creates multi-sheet workbook, neutralizes formula injection, preserves numbers as numeric types and cyrillic text', async () => {
      prisma.budgetLine.findMany.mockResolvedValue([
        {
          id: 'b1',
          tenantId: mockTenantId,
          year: 2026,
          month: 1,
          category: '=cmd|"/C calc"!A0', // Dangerous formula prefix!
          plannedAmount: 125000.5,
        },
      ]);

      prisma.expense.findMany.mockResolvedValue([
        {
          id: 'e1',
          tenantId: mockTenantId,
          category: '=cmd|"/C calc"!A0',
          amount: 130000.75,
          expenseDate: new Date('2026-01-15'),
          periodMonth: 1,
          periodYear: 2026,
        },
      ]);

      const { buffer, filename } = await service.exportBudgetVsActualXlsx(
        mockTenantId,
        adminUser,
        { year: 2026 },
      );

      expect(filename).toBe('budget_vs_actual_2026.xlsx');
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);

      // Re-read with ExcelJS to verify structure
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as any);

      const sheetNames = wb.worksheets.map((s) => s.name);
      expect(sheetNames).toEqual(['Бюджет', 'Факт', 'План-факт']);

      // Sheet 1: «Бюджет»
      const sheetBudget = wb.getWorksheet('Бюджет')!;
      const rowBudget = sheetBudget.getRow(2);
      const catVal = String(rowBudget.getCell(1).value);
      // Formula string MUST have leading apostrophe
      expect(catVal.startsWith("'=")).toBe(true);

      // Numeric cell must be number type, NOT string!
      const numCell = rowBudget.getCell(2).value;
      expect(typeof numCell).toBe('number');
      expect(numCell).toBe(125000.5);

      // Sheet 3: «План-факт»
      const sheetCompare = wb.getWorksheet('План-факт')!;
      expect(sheetCompare.rowCount).toBeGreaterThanOrEqual(3);
      const compRow = sheetCompare.getRow(3);
      expect(String(compRow.getCell(1).value).startsWith("'=")).toBe(true);

      // Numeric planned & actual in comparison sheet
      expect(typeof compRow.getCell(2).value).toBe('number');
      expect(typeof compRow.getCell(3).value).toBe('number');
    });
  });
});
