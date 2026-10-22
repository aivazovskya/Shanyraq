import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { assertUserBelongsToTenant } from '../../common/guards/tenant.guard';
import { UserRole } from '@prisma/client';
import {
  GetBudgetQueryDto,
  BudgetVsActualQueryDto,
  UpdateBudgetDto,
  BudgetLineItemDto,
  DeleteBudgetCategoryQueryDto,
} from './dto/budget.dto';
import * as ExcelJS from 'exceljs';

/**
 * Округление денежных сумм и процентов строго до 2 знаков после запятой на выходе.
 */
export function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Нейтрализация CSV / Excel Formula Injection (CWE-1236) для строковых ячеек.
 * Если строка начинается с =, +, -, @, \t, \r — добавляется защитный апостроф (').
 * Числа, булевы значения и даты не искажаются.
 */
export function escapeFormulaText(field: unknown): string {
  if (field === null || field === undefined) return '';
  if (typeof field === 'number' || typeof field === 'boolean') return String(field);
  if (field instanceof Date) return field.toISOString();

  let str = String(field);
  const DANGEROUS_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];
  if (typeof field === 'string' && str.length > 0 && DANGEROUS_PREFIXES.includes(str[0])) {
    const isPhoneNumber = str[0] === '+' && /^\+\d{7,15}$/.test(str);
    const isFormattedCurrency = str[0] === '-' && /^-\d+(\.\d+)?\s*[₸$€₽]/.test(str);

    if (!isPhoneNumber && !isFormattedCurrency) {
      str = `'${str}`;
    }
  }
  return str;
}

/**
 * Определение года и месяца для расхода:
 * 1. periodYear и periodMonth (период начисления) имеют наивысший приоритет.
 * 2. Если не заданы — дата траты (expenseDate) в часовом поясе Казахстана (Asia/Almaty, UTC+5).
 * Это гарантирует отсутствие потерь на границах месяцев (например 31 янв 23:59 vs 1 фев 00:00).
 */
export function getExpensePeriod(
  expense: {
    periodMonth?: number | null;
    periodYear?: number | null;
    expenseDate: Date | string;
  },
  timeZone: string = 'Asia/Almaty',
): { year: number; month: number } {
  if (
    typeof expense.periodYear === 'number' &&
    expense.periodYear > 0 &&
    typeof expense.periodMonth === 'number' &&
    expense.periodMonth >= 1 &&
    expense.periodMonth <= 12
  ) {
    return { year: expense.periodYear, month: expense.periodMonth };
  }

  const d = typeof expense.expenseDate === 'string' ? new Date(expense.expenseDate) : expense.expenseDate;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
  });
  const parts = formatter.formatToParts(d);
  const month = parseInt(parts.find((p) => p.type === 'month')?.value || '1', 10);
  const year = parseInt(parts.find((p) => p.type === 'year')?.value || '2026', 10);
  return { year, month };
}

export interface MonthSummary {
  month: number;
  planned: number;
  actual: number;
  delta: number;
  deltaPercent: number | null;
  cumulative: {
    planned: number;
    actual: number;
    delta: number;
    deltaPercent: number | null;
  };
  isOverBudget: boolean;
  isOutlier: boolean;
}

export interface QuarterSummary {
  quarter: number;
  planned: number;
  actual: number;
  delta: number;
  deltaPercent: number | null;
  isOverBudget: boolean;
}

export interface CategorySummary {
  category: string;
  months: MonthSummary[];
  quarters: QuarterSummary[];
  year: {
    planned: number;
    actual: number;
    delta: number;
    deltaPercent: number | null;
    isOverBudget: boolean;
  };
  hasBudget: boolean;
  hasActual: boolean;
  outlierMonths: number[];
}

export interface BudgetVsActualResult {
  year: number;
  tenantId: string;
  actualSources: string[];
  categories: CategorySummary[];
  totals: {
    months: MonthSummary[];
    quarters: QuarterSummary[];
    year: {
      planned: number;
      actual: number;
      delta: number;
      deltaPercent: number | null;
      isOverBudget: boolean;
    };
  };
  categoriesWithoutBudget: string[];
  categoriesWithoutActual: string[];
  overBudgetCount: number;
  topOverBudgetByAmount: Array<{
    category: string;
    month?: number;
    periodLabel: string;
    planned: number;
    actual: number;
    delta: number;
    deltaPercent: number | null;
  }>;
  topOverBudgetByPercent: Array<{
    category: string;
    month?: number;
    periodLabel: string;
    planned: number;
    actual: number;
    delta: number;
    deltaPercent: number | null;
  }>;
  outlierCategoriesCount: number;
  summary?: {
    overBudgetCount: number;
    topOverBudgetItems: Array<{
      category: string;
      month?: number;
      period: string;
      planned: number;
      actual: number;
      delta: number;
      deltaPercent: number | null;
    }>;
    categoriesWithoutBudget: string[];
    categoriesWithoutActual: string[];
    outliersCount: number;
  };
}

@Injectable()
export class BudgetService {
  private readonly logger = new Logger(BudgetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * 1. Получение строк бюджета за выбранный год
   * Доступ: HOA_ADMIN, SUPERADMIN, HOA_CHAIRMAN
   */
  async getBudgetLines(
    tenantId: string,
    user: { id?: string; tenantId?: string | null; role: UserRole },
    query?: GetBudgetQueryDto,
  ) {
    assertUserBelongsToTenant(user, tenantId, 'бюджета');

    if (
      user.role !== UserRole.HOA_ADMIN &&
      user.role !== UserRole.SUPERADMIN &&
      user.role !== UserRole.HOA_CHAIRMAN
    ) {
      throw new ForbiddenException({
        code: 'BUDGET.ACCESS_FORBIDDEN',
        message: 'Недостаточно прав для просмотра бюджета',
      });
    }

    const year = query?.year || new Date().getFullYear();

    const lines = await this.prisma.budgetLine.findMany({
      where: {
        tenantId,
        year,
      },
      orderBy: [{ category: 'asc' }, { month: 'asc' }],
    });

    return {
      tenantId,
      year,
      lines,
    };
  }

  /**
   * 2. Сохранение / обновление строк бюджета (Upsert)
   * Доступ: только HOA_ADMIN, SUPERADMIN
   */
  async updateBudgetLines(
    tenantId: string,
    user: { id?: string; tenantId?: string | null; role: UserRole },
    body: UpdateBudgetDto | BudgetLineItemDto[],
  ) {
    assertUserBelongsToTenant(user, tenantId, 'бюджета');

    if (user.role !== UserRole.HOA_ADMIN && user.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException({
        code: 'BUDGET.MODIFY_FORBIDDEN',
        message: 'Недостаточно прав для изменения бюджета (требуется роль УК или суперадмина)',
      });
    }

    const lines = Array.isArray(body) ? body : (body?.lines || (body as any)?.items);
    if (!Array.isArray(lines) || lines.length === 0) {
      throw new BadRequestException({
        code: 'BUDGET.LINES_EMPTY',
        message: 'Список строк бюджета для сохранения не может быть пустым',
      });
    }

    if (lines.length > 500) {
      throw new BadRequestException({
        code: 'BUDGET.BATCH_TOO_LARGE',
        message: 'Максимальный размер пакета строк бюджета — 500 записей',
      });
    }

    // Валидация входных строк
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.category || !line.category.trim()) {
        throw new BadRequestException({
          code: 'BUDGET.INVALID_CATEGORY',
          message: `В строке #${i + 1} категория не может быть пустой`,
        });
      }
      if (typeof line.plannedAmount !== 'number' || line.plannedAmount < 0) {
        throw new BadRequestException({
          code: 'BUDGET.INVALID_PLANNED_AMOUNT',
          message: `В строке #${i + 1} плановая сумма должна быть неотрицательным числом`,
        });
      }
      if (typeof line.month !== 'number' || line.month < 1 || line.month > 12) {
        throw new BadRequestException({
          code: 'BUDGET.INVALID_MONTH',
          message: `В строке #${i + 1} месяц должен быть целым числом от 1 до 12`,
        });
      }
      if (typeof line.year !== 'number' || line.year < 2000 || line.year > 2100) {
        throw new BadRequestException({
          code: 'BUDGET.INVALID_YEAR',
          message: `В строке #${i + 1} год должен быть в диапазоне 2000-2100`,
        });
      }
    }

    // Применяем в транзакции
    const upserted = await this.prisma.$transaction(async (tx) => {
      const results = [];
      for (const line of lines) {
        const cat = line.category.trim();
        const res = await tx.budgetLine.upsert({
          where: {
            tenantId_year_month_category: {
              tenantId,
              year: line.year,
              month: line.month,
              category: cat,
            },
          },
          create: {
            tenantId,
            year: line.year,
            month: line.month,
            category: cat,
            plannedAmount: line.plannedAmount,
            note: line.note?.trim() || null,
            createdById: user.id!,
          },
          update: {
            plannedAmount: line.plannedAmount,
            note: line.note?.trim() || null,
          },
        });
        results.push(res);
      }
      return results;
    });

    const affectedYear = lines[0].year;

    // Логируем в AuditLog
    await this.auditLogService.log({
      tenantId,
      actorId: user.id,
      action: 'BUDGET_UPDATED',
      targetType: 'BudgetLine',
      targetId: tenantId,
      metadata: {
        count: lines.length,
        year: affectedYear,
      },
    });

    return {
      success: true,
      count: upserted.length,
      year: affectedYear,
      lines: upserted,
    };
  }

  /**
   * 3. Удаление категории бюджета за год
   * Доступ: HOA_ADMIN, SUPERADMIN
   */
  async deleteBudgetCategory(
    tenantId: string,
    user: { id?: string; tenantId?: string | null; role: UserRole },
    query: DeleteBudgetCategoryQueryDto,
  ) {
    assertUserBelongsToTenant(user, tenantId, 'бюджета');

    if (user.role !== UserRole.HOA_ADMIN && user.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException({
        code: 'BUDGET.DELETE_FORBIDDEN',
        message: 'Недостаточно прав для удаления строк бюджета',
      });
    }

    const category = query.category.trim();
    const year = Number(query.year);

    const deleted = await this.prisma.budgetLine.deleteMany({
      where: {
        tenantId,
        year,
        category: {
          equals: category,
          mode: 'insensitive',
        },
      },
    });

    await this.auditLogService.log({
      tenantId,
      actorId: user.id,
      action: 'BUDGET_CATEGORY_DELETED',
      targetType: 'BudgetLine',
      targetId: tenantId,
      metadata: {
        category,
        year,
        deletedCount: deleted.count,
      },
    });

    return {
      success: true,
      deletedCount: deleted.count,
      category,
      year,
    };
  }

  /**
   * 4. Расчет сводки План / Факт (Budget vs Actual)
   * Доступ: HOA_ADMIN, SUPERADMIN, HOA_CHAIRMAN
   */
  async getBudgetVsActual(
    tenantId: string,
    user: { id?: string; tenantId?: string | null; role: UserRole },
    query?: BudgetVsActualQueryDto,
  ): Promise<BudgetVsActualResult> {
    assertUserBelongsToTenant(user, tenantId, 'сводки план/факт');

    if (
      user.role !== UserRole.HOA_ADMIN &&
      user.role !== UserRole.SUPERADMIN &&
      user.role !== UserRole.HOA_CHAIRMAN
    ) {
      throw new ForbiddenException({
        code: 'BUDGET.SUMMARY_FORBIDDEN',
        message: 'Недостаточно прав для просмотра сводки план/факт',
      });
    }

    const year = query?.year || new Date().getFullYear();

    // 1. Получаем все строки бюджета за год
    const budgetLines = await this.prisma.budgetLine.findMany({
      where: {
        tenantId,
        year,
      },
    });

    // 2. Получаем все не-аннулированные расходы тенанта
    const expenses = await this.prisma.expense.findMany({
      where: {
        tenantId,
        isVoided: false,
      },
      select: {
        id: true,
        category: true,
        amount: true,
        expenseDate: true,
        periodMonth: true,
        periodYear: true,
      },
    });

    // Фильтруем расходы, относящиеся к целевому году
    const yearExpenses = expenses.filter((exp) => {
      const p = getExpensePeriod(exp);
      return p.year === year;
    });

    // 3. Собираем уникальные категории и определяем каноническое написание
    // Каноническое правило: если категория есть в расходах, берем написание из расходов; иначе из бюджета
    const categoryKeyToCanonical = new Map<string, string>();
    const budgetCategoryKeySet = new Set<string>();
    const expenseCategoryKeySet = new Set<string>();

    for (const exp of yearExpenses) {
      const trimmed = exp.category.trim();
      const key = trimmed.toLowerCase();
      if (!categoryKeyToCanonical.has(key)) {
        categoryKeyToCanonical.set(key, trimmed);
      }
      expenseCategoryKeySet.add(key);
    }

    for (const b of budgetLines) {
      const trimmed = b.category.trim();
      const key = trimmed.toLowerCase();
      if (!categoryKeyToCanonical.has(key)) {
        categoryKeyToCanonical.set(key, trimmed);
      }
      budgetCategoryKeySet.add(key);
    }

    const allKeys = Array.from(categoryKeyToCanonical.keys()).sort((a, b) => {
      const nameA = categoryKeyToCanonical.get(a) || '';
      const nameB = categoryKeyToCanonical.get(b) || '';
      return nameA.localeCompare(nameB, 'ru');
    });

    // Индексируем плановые суммы: key -> month (1-12) -> plannedAmount
    const plannedMap = new Map<string, Map<number, number>>();
    for (const b of budgetLines) {
      const key = b.category.trim().toLowerCase();
      if (!plannedMap.has(key)) {
        plannedMap.set(key, new Map());
      }
      const m = b.month;
      const current = plannedMap.get(key)!.get(m) || 0;
      plannedMap.get(key)!.set(m, current + b.plannedAmount);
    }

    // Индексируем фактические суммы: key -> month (1-12) -> actualAmount
    const actualMap = new Map<string, Map<number, number>>();
    for (const exp of yearExpenses) {
      const key = exp.category.trim().toLowerCase();
      const p = getExpensePeriod(exp);
      if (!actualMap.has(key)) {
        actualMap.set(key, new Map());
      }
      const m = p.month;
      const current = actualMap.get(key)!.get(m) || 0;
      actualMap.get(key)!.set(m, current + exp.amount);
    }

    // 4. Расчет по каждой категории
    const categories: CategorySummary[] = [];
    const categoriesWithoutBudget: string[] = [];
    const categoriesWithoutActual: string[] = [];
    let overBudgetCount = 0;
    let outlierCategoriesCount = 0;

    const topAmountList: Array<{
      category: string;
      month?: number;
      periodLabel: string;
      planned: number;
      actual: number;
      delta: number;
      deltaPercent: number | null;
    }> = [];

    const topPercentList: Array<{
      category: string;
      month?: number;
      periodLabel: string;
      planned: number;
      actual: number;
      delta: number;
      deltaPercent: number | null;
    }> = [];

    // Инициализируем аккумулятор для строки итого
    const totalPlannedMonth = new Array<number>(12).fill(0);
    const totalActualMonth = new Array<number>(12).fill(0);

    for (const key of allKeys) {
      const categoryName = categoryKeyToCanonical.get(key) || key;
      const pMap = plannedMap.get(key) || new Map<number, number>();
      const aMap = actualMap.get(key) || new Map<number, number>();

      const monthlyPlanned: number[] = [];
      const monthlyActual: number[] = [];

      for (let m = 1; m <= 12; m++) {
        const p = pMap.get(m) || 0;
        const a = aMap.get(m) || 0;
        monthlyPlanned.push(p);
        monthlyActual.push(a);

        totalPlannedMonth[m - 1] += p;
        totalActualMonth[m - 1] += a;
      }

      // Определение выбросов для категории:
      // "месяцы-выбросы: actual > среднего по категории × 1.5, считать только при ≥3 ненулевых месяцев"
      const nonZeroActuals = monthlyActual.filter((val) => val > 0);
      let isOutlierArray = new Array<boolean>(12).fill(false);
      const outlierMonthsList: number[] = [];

      if (nonZeroActuals.length >= 3) {
        const sumNonZero = nonZeroActuals.reduce((acc, v) => acc + v, 0);
        const avg = sumNonZero / nonZeroActuals.length;
        const threshold = avg * 1.5;

        for (let m = 1; m <= 12; m++) {
          if (monthlyActual[m - 1] > threshold) {
            isOutlierArray[m - 1] = true;
            outlierMonthsList.push(m);
          }
        }
      }

      if (outlierMonthsList.length > 0) {
        outlierCategoriesCount++;
      }

      // Помесячная сводка с накопительным итогом
      const months: MonthSummary[] = [];
      let cumPlanned = 0;
      let cumActual = 0;

      for (let m = 1; m <= 12; m++) {
        const pl = monthlyPlanned[m - 1];
        const act = monthlyActual[m - 1];
        const delta = act - pl;
        const deltaPercent = pl > 0 ? (delta / pl) * 100 : null;

        cumPlanned += pl;
        cumActual += act;
        const cumDelta = cumActual - cumPlanned;
        const cumDeltaPercent = cumPlanned > 0 ? (cumDelta / cumPlanned) * 100 : null;

        const isOver = act > pl;
        if (isOver) {
          overBudgetCount++;
          topAmountList.push({
            category: categoryName,
            month: m,
            periodLabel: `${m} мес.`,
            planned: round2(pl),
            actual: round2(act),
            delta: round2(delta),
            deltaPercent: deltaPercent !== null ? round2(deltaPercent) : null,
          });

          if (deltaPercent !== null) {
            topPercentList.push({
              category: categoryName,
              month: m,
              periodLabel: `${m} мес.`,
              planned: round2(pl),
              actual: round2(act),
              delta: round2(delta),
              deltaPercent: round2(deltaPercent),
            });
          }
        }

        months.push({
          month: m,
          planned: round2(pl),
          actual: round2(act),
          delta: round2(delta),
          deltaPercent: deltaPercent !== null ? round2(deltaPercent) : null,
          cumulative: {
            planned: round2(cumPlanned),
            actual: round2(cumActual),
            delta: round2(cumDelta),
            deltaPercent: cumDeltaPercent !== null ? round2(cumDeltaPercent) : null,
          },
          isOverBudget: isOver,
          isOutlier: isOutlierArray[m - 1],
        });
      }

      // Квартальные агрегаты (Q1: 1-3, Q2: 4-6, Q3: 7-9, Q4: 10-12)
      const quarters: QuarterSummary[] = [];
      for (let q = 1; q <= 4; q++) {
        const startIdx = (q - 1) * 3;
        const qPlanned = monthlyPlanned.slice(startIdx, startIdx + 3).reduce((sum, v) => sum + v, 0);
        const qActual = monthlyActual.slice(startIdx, startIdx + 3).reduce((sum, v) => sum + v, 0);
        const qDelta = qActual - qPlanned;
        const qDeltaPercent = qPlanned > 0 ? (qDelta / qPlanned) * 100 : null;

        quarters.push({
          quarter: q,
          planned: round2(qPlanned),
          actual: round2(qActual),
          delta: round2(qDelta),
          deltaPercent: qDeltaPercent !== null ? round2(qDeltaPercent) : null,
          isOverBudget: qActual > qPlanned,
        });
      }

      // Годовой агрегат
      const yPlanned = monthlyPlanned.reduce((sum, v) => sum + v, 0);
      const yActual = monthlyActual.reduce((sum, v) => sum + v, 0);
      const yDelta = yActual - yPlanned;
      const yDeltaPercent = yPlanned > 0 ? (yDelta / yPlanned) * 100 : null;

      const hasBudget = yPlanned > 0;
      const hasActual = yActual > 0;

      if (hasActual && !hasBudget) {
        categoriesWithoutBudget.push(categoryName);
      }
      if (hasBudget && !hasActual) {
        categoriesWithoutActual.push(categoryName);
      }

      categories.push({
        category: categoryName,
        months,
        quarters,
        year: {
          planned: round2(yPlanned),
          actual: round2(yActual),
          delta: round2(yDelta),
          deltaPercent: yDeltaPercent !== null ? round2(yDeltaPercent) : null,
          isOverBudget: yActual > yPlanned,
        },
        hasBudget,
        hasActual,
        outlierMonths: outlierMonthsList,
      });
    }

    // 5. Расчет строки ИТОГО (Totals)
    const totalsMonths: MonthSummary[] = [];
    let totCumPlanned = 0;
    let totCumActual = 0;

    for (let m = 1; m <= 12; m++) {
      const pl = totalPlannedMonth[m - 1];
      const act = totalActualMonth[m - 1];
      const delta = act - pl;
      const deltaPercent = pl > 0 ? (delta / pl) * 100 : null;

      totCumPlanned += pl;
      totCumActual += act;
      const cumDelta = totCumActual - totCumPlanned;
      const cumDeltaPercent = totCumPlanned > 0 ? (cumDelta / totCumPlanned) * 100 : null;

      totalsMonths.push({
        month: m,
        planned: round2(pl),
        actual: round2(act),
        delta: round2(delta),
        deltaPercent: deltaPercent !== null ? round2(deltaPercent) : null,
        cumulative: {
          planned: round2(totCumPlanned),
          actual: round2(totCumActual),
          delta: round2(cumDelta),
          deltaPercent: cumDeltaPercent !== null ? round2(cumDeltaPercent) : null,
        },
        isOverBudget: act > pl,
        isOutlier: false,
      });
    }

    const totalsQuarters: QuarterSummary[] = [];
    for (let q = 1; q <= 4; q++) {
      const startIdx = (q - 1) * 3;
      const qPlanned = totalPlannedMonth.slice(startIdx, startIdx + 3).reduce((sum, v) => sum + v, 0);
      const qActual = totalActualMonth.slice(startIdx, startIdx + 3).reduce((sum, v) => sum + v, 0);
      const qDelta = qActual - qPlanned;
      const qDeltaPercent = qPlanned > 0 ? (qDelta / qPlanned) * 100 : null;

      totalsQuarters.push({
        quarter: q,
        planned: round2(qPlanned),
        actual: round2(qActual),
        delta: round2(qDelta),
        deltaPercent: qDeltaPercent !== null ? round2(qDeltaPercent) : null,
        isOverBudget: qActual > qPlanned,
      });
    }

    const grandPlanned = totalPlannedMonth.reduce((sum, v) => sum + v, 0);
    const grandActual = totalActualMonth.reduce((sum, v) => sum + v, 0);
    const grandDelta = grandActual - grandPlanned;
    const grandDeltaPercent = grandPlanned > 0 ? (grandDelta / grandPlanned) * 100 : null;

    // Сортировка топ перерасходов
    topAmountList.sort((a, b) => b.delta - a.delta);
    topPercentList.sort((a, b) => (b.deltaPercent || 0) - (a.deltaPercent || 0));

    return {
      year,
      tenantId,
      actualSources: ['EXPENSES'],
      categories,
      totals: {
        months: totalsMonths,
        quarters: totalsQuarters,
        year: {
          planned: round2(grandPlanned),
          actual: round2(grandActual),
          delta: round2(grandDelta),
          deltaPercent: grandDeltaPercent !== null ? round2(grandDeltaPercent) : null,
          isOverBudget: grandActual > grandPlanned,
        },
      },
      categoriesWithoutBudget,
      categoriesWithoutActual,
      overBudgetCount,
      topOverBudgetByAmount: topAmountList.slice(0, 10),
      topOverBudgetByPercent: topPercentList.slice(0, 10),
      outlierCategoriesCount,
      summary: {
        overBudgetCount,
        topOverBudgetItems: topAmountList.slice(0, 10).map((item) => ({
          category: item.category,
          month: item.month,
          period: item.periodLabel,
          planned: item.planned,
          actual: item.actual,
          delta: item.delta,
          deltaPercent: item.deltaPercent,
        })),
        categoriesWithoutBudget,
        categoriesWithoutActual,
        outliersCount: outlierCategoriesCount,
      },
    };
  }

  /**
   * 5. Экспорт многолистовой книги Excel (xlsx)
   * Листы: «Бюджет», «Факт», «План-факт»
   */
  async exportBudgetVsActualXlsx(
    tenantId: string,
    user: { id?: string; tenantId?: string | null; role: UserRole },
    query?: BudgetVsActualQueryDto,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const summary = await this.getBudgetVsActual(tenantId, user, query);
    const year = summary.year;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Shanyraq Platform';
    workbook.created = new Date();

    const monthNames = [
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
    ];

    const moneyFormat = '#,##0.00';
    const percentFormat = '0.0%';

    // -------------------------------------------------------------
    // Лист 1: «Бюджет» (Категории x 12 месяцев + Итого за год)
    // -------------------------------------------------------------
    const sheetBudget = workbook.addWorksheet('Бюджет', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
    });

    const budgetColumns: Partial<ExcelJS.Column>[] = [
      { header: 'Категория', key: 'category', width: 32 },
    ];
    for (let i = 0; i < 12; i++) {
      budgetColumns.push({
        header: monthNames[i],
        key: `m${i + 1}`,
        width: 15,
        style: { numFmt: moneyFormat },
      });
    }
    budgetColumns.push({
      header: 'Итого за год',
      key: 'yearTotal',
      width: 18,
      style: { numFmt: moneyFormat },
    });
    sheetBudget.columns = budgetColumns;

    // Стилизация шапки листа 1
    const h1 = sheetBudget.getRow(1);
    h1.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    h1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }; // Slate-800
    h1.alignment = { vertical: 'middle', horizontal: 'center' };
    h1.height = 26;

    // Строки категорий
    for (const cat of summary.categories) {
      const rowData: Record<string, any> = {
        category: escapeFormulaText(cat.category),
      };
      for (let i = 0; i < 12; i++) {
        rowData[`m${i + 1}`] = cat.months[i].planned;
      }
      rowData['yearTotal'] = cat.year.planned;

      const r = sheetBudget.addRow(rowData);
      r.height = 20;
      r.alignment = { vertical: 'middle' };
      r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    }

    // Строка ИТОГО
    const totalBudgetRowData: Record<string, any> = {
      category: 'ИТОГО',
    };
    for (let i = 0; i < 12; i++) {
      totalBudgetRowData[`m${i + 1}`] = summary.totals.months[i].planned;
    }
    totalBudgetRowData['yearTotal'] = summary.totals.year.planned;

    const bTotalRow = sheetBudget.addRow(totalBudgetRowData);
    bTotalRow.height = 24;
    bTotalRow.font = { name: 'Arial', size: 10, bold: true };
    bTotalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    bTotalRow.alignment = { vertical: 'middle' };

    // -------------------------------------------------------------
    // Лист 2: «Факт» (Категории x 12 месяцев + Итого за год)
    // -------------------------------------------------------------
    const sheetActual = workbook.addWorksheet('Факт', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
    });

    const actualColumns: Partial<ExcelJS.Column>[] = [
      { header: 'Категория', key: 'category', width: 32 },
    ];
    for (let i = 0; i < 12; i++) {
      actualColumns.push({
        header: monthNames[i],
        key: `m${i + 1}`,
        width: 15,
        style: { numFmt: moneyFormat },
      });
    }
    actualColumns.push({
      header: 'Итого за год',
      key: 'yearTotal',
      width: 18,
      style: { numFmt: moneyFormat },
    });
    sheetActual.columns = actualColumns;

    const h2 = sheetActual.getRow(1);
    h2.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    h2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }; // Teal-700
    h2.alignment = { vertical: 'middle', horizontal: 'center' };
    h2.height = 26;

    for (const cat of summary.categories) {
      const rowData: Record<string, any> = {
        category: escapeFormulaText(cat.category),
      };
      for (let i = 0; i < 12; i++) {
        rowData[`m${i + 1}`] = cat.months[i].actual;
      }
      rowData['yearTotal'] = cat.year.actual;

      const r = sheetActual.addRow(rowData);
      r.height = 20;
      r.alignment = { vertical: 'middle' };
      r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    }

    const totalActualRowData: Record<string, any> = {
      category: 'ИТОГО',
    };
    for (let i = 0; i < 12; i++) {
      totalActualRowData[`m${i + 1}`] = summary.totals.months[i].actual;
    }
    totalActualRowData['yearTotal'] = summary.totals.year.actual;

    const aTotalRow = sheetActual.addRow(totalActualRowData);
    aTotalRow.height = 24;
    aTotalRow.font = { name: 'Arial', size: 10, bold: true };
    aTotalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    aTotalRow.alignment = { vertical: 'middle' };

    // -------------------------------------------------------------
    // Лист 3: «План-факт»
    // По месяцам (План, Факт, Разница, %), кварталам и году
    // -------------------------------------------------------------
    const sheetCompare = workbook.addWorksheet('План-факт', {
      views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }],
    });

    // 2-уровневая шапка таблицы:
    // Строка 1: Категория | Январь (4 колонки) | ... | Q1 (4 колонки) | ... | Итого за год (4 колонки)
    // Строка 2:           | План | Факт | Разница | % | План | Факт | Разница | % | ...
    const row1Values: string[] = ['Категория'];
    const row2Values: string[] = [''];

    // 12 месяцев
    for (let m = 0; m < 12; m++) {
      row1Values.push(monthNames[m], '', '', '');
      row2Values.push('План', 'Факт', 'Разница', '%');
    }

    // 4 квартала
    for (let q = 1; q <= 4; q++) {
      row1Values.push(`Q${q} (${q}-й квартал)`, '', '', '');
      row2Values.push('План', 'Факт', 'Разница', '%');
    }

    // Год
    row1Values.push(`Всего за ${year} год`, '', '', '');
    row2Values.push('План', 'Факт', 'Разница', '%');

    sheetCompare.addRow(row1Values);
    sheetCompare.addRow(row2Values);

    // Объединяем ячейки строки 1
    // Col 1 (A1:A2) — Категория
    sheetCompare.mergeCells(1, 1, 2, 1);

    let curCol = 2;
    // 12 месяцев + 4 квартала + 1 год = 17 блоков по 4 колонки
    for (let b = 0; b < 17; b++) {
      sheetCompare.mergeCells(1, curCol, 1, curCol + 3);
      curCol += 4;
    }

    // Стилизация строк 1 и 2
    const compRow1 = sheetCompare.getRow(1);
    compRow1.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    compRow1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    compRow1.alignment = { vertical: 'middle', horizontal: 'center' };
    compRow1.height = 24;

    const compRow2 = sheetCompare.getRow(2);
    compRow2.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF334155' } };
    compRow2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    compRow2.alignment = { vertical: 'middle', horizontal: 'center' };
    compRow2.height = 20;

    sheetCompare.getColumn(1).width = 30;
    for (let c = 2; c <= curCol - 1; c++) {
      sheetCompare.getColumn(c).width = 13;
    }

    // Заполнение строк категорий на листе План-факт
    for (const cat of summary.categories) {
      const rowValues: any[] = [escapeFormulaText(cat.category)];

      // 12 месяцев
      for (let m = 0; m < 12; m++) {
        const item = cat.months[m];
        rowValues.push(item.planned);
        rowValues.push(item.actual);
        rowValues.push(item.delta);
        rowValues.push(item.deltaPercent !== null ? item.deltaPercent / 100 : null);
      }

      // 4 квартала
      for (let q = 0; q < 4; q++) {
        const item = cat.quarters[q];
        rowValues.push(item.planned);
        rowValues.push(item.actual);
        rowValues.push(item.delta);
        rowValues.push(item.deltaPercent !== null ? item.deltaPercent / 100 : null);
      }

      // Год
      rowValues.push(cat.year.planned);
      rowValues.push(cat.year.actual);
      rowValues.push(cat.year.delta);
      rowValues.push(cat.year.deltaPercent !== null ? cat.year.deltaPercent / 100 : null);

      const added = sheetCompare.addRow(rowValues);
      added.height = 20;
      added.alignment = { vertical: 'middle' };

      // Форматирование чисел в ячейках
      for (let c = 2; c <= curCol - 1; c++) {
        const cell = added.getCell(c);
        const colMod = (c - 2) % 4;
        if (colMod === 3) {
          // Колонка процента
          cell.numFmt = percentFormat;
        } else {
          // Колонки сумм
          cell.numFmt = moneyFormat;
        }
      }
    }

    // Строка ИТОГО на листе План-факт
    const totalCompValues: any[] = ['ИТОГО'];

    for (let m = 0; m < 12; m++) {
      const item = summary.totals.months[m];
      totalCompValues.push(item.planned);
      totalCompValues.push(item.actual);
      totalCompValues.push(item.delta);
      totalCompValues.push(item.deltaPercent !== null ? item.deltaPercent / 100 : null);
    }

    for (let q = 0; q < 4; q++) {
      const item = summary.totals.quarters[q];
      totalCompValues.push(item.planned);
      totalCompValues.push(item.actual);
      totalCompValues.push(item.delta);
      totalCompValues.push(item.deltaPercent !== null ? item.deltaPercent / 100 : null);
    }

    totalCompValues.push(summary.totals.year.planned);
    totalCompValues.push(summary.totals.year.actual);
    totalCompValues.push(summary.totals.year.delta);
    totalCompValues.push(
      summary.totals.year.deltaPercent !== null
        ? summary.totals.year.deltaPercent / 100
        : null,
    );

    const compTotalRow = sheetCompare.addRow(totalCompValues);
    compTotalRow.height = 24;
    compTotalRow.font = { name: 'Arial', size: 10, bold: true };
    compTotalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    compTotalRow.alignment = { vertical: 'middle' };

    for (let c = 2; c <= curCol - 1; c++) {
      const cell = compTotalRow.getCell(c);
      const colMod = (c - 2) % 4;
      if (colMod === 3) {
        cell.numFmt = percentFormat;
      } else {
        cell.numFmt = moneyFormat;
      }
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const filename = `budget_vs_actual_${year}.xlsx`;

    return {
      buffer,
      filename,
    };
  }
}
