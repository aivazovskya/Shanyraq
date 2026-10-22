export interface BudgetLineItem {
  id?: string;
  tenantId?: string;
  year: number;
  month: number;
  category: string;
  plannedAmount: number;
  note?: string | null;
  importBatchId?: string | null;
  createdById?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BudgetApiResponse {
  tenantId: string;
  year: number;
  lines: BudgetLineItem[];
}

/**
 * Безопасный парсинг ответа GET /finance/tenants/:tenantId/budget?year=...
 * Поддерживает как канонический объект { tenantId, year, lines: [...] },
 * так и массив BudgetLineItem[] для обратной совместимости.
 */
export function parseBudgetResponse(data: unknown): {
  lines: BudgetLineItem[];
  categories: string[];
  cellValues: Record<string, number>;
} {
  const lines: BudgetLineItem[] = Array.isArray(data)
    ? data
    : Array.isArray((data as any)?.lines)
    ? (data as any).lines
    : [];

  const catSet = new Set<string>();
  const cellValues: Record<string, number> = {};

  for (const line of lines) {
    if (line && typeof line.category === 'string') {
      const cat = line.category.trim();
      if (cat) {
        catSet.add(cat);
        if (typeof line.month === 'number' && line.month >= 1 && line.month <= 12) {
          cellValues[`${cat}__${line.month}`] =
            typeof line.plannedAmount === 'number' && !isNaN(line.plannedAmount)
              ? line.plannedAmount
              : 0;
        }
      }
    }
  }

  const categories = Array.from(catSet).sort((a, b) => a.localeCompare(b));
  return { lines, categories, cellValues };
}

/**
 * Проверка, наступил ли месяц в выбранном году.
 * Текущий месяц считается наступившим.
 */
export function isFutureMonth(year: number, month: number, referenceDate: Date = new Date()): boolean {
  const currentYear = referenceDate.getFullYear();
  const currentMonth = referenceDate.getMonth() + 1; // 1-12
  if (year > currentYear) return true;
  if (year < currentYear) return false;
  return month > currentMonth;
}

/**
 * Проверка, наступил ли квартал в выбранном году.
 * Текущий квартал считается наступившим.
 */
export function isFutureQuarter(year: number, quarter: number, referenceDate: Date = new Date()): boolean {
  const currentYear = referenceDate.getFullYear();
  const currentQuarter = Math.floor(referenceDate.getMonth() / 3) + 1; // 1-4
  if (year > currentYear) return true;
  if (year < currentYear) return false;
  return quarter > currentQuarter;
}

/**
 * Форматирование процента отклонения для UI.
 * Для периодов, которые еще не наступили, либо категорий без фактических трат
 * вместо депрессивного "-100%" отображается нейтральный прочерк "—".
 */
export function formatDeltaPercentDisplay(
  deltaPercent: number | null,
  actual: number,
  isFuture: boolean,
  hasNoActual: boolean = false,
): string {
  if (deltaPercent === null) return '—';
  if ((isFuture || hasNoActual) && actual === 0) return '—';
  return `${deltaPercent > 0 ? '+' : ''}${deltaPercent}%`;
}

/**
 * Извлечение номера месяца (1-12) из объекта или строки периода.
 */
export function resolvePeriodMonth(item: { month?: number; period?: string }): number | null {
  if (typeof item.month === 'number' && item.month >= 1 && item.month <= 12) {
    return item.month;
  }
  if (typeof item.period === 'string') {
    const match = item.period.match(/\b([1-9]|1[0-2])\b/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  return null;
}
