'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  ArrowLeft,
  ArrowRight,
  Download,
  Receipt,
  FileSpreadsheet,
  RefreshCw,
  Loader2,
  AlertCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { apiRequest, apiDownload, getStoredSession, getApiErrorMessage } from '@/lib/api';
import {
  resolvePeriodMonth,
  isFutureMonth,
  isFutureQuarter,
  formatDeltaPercentDisplay,
} from '@/lib/budget-parser';

interface MonthData {
  month: number;
  planned: number;
  actual: number;
  delta: number;
  deltaPercent: number | null;
  isOverBudget: boolean;
  isOutlier: boolean;
}

interface QuarterData {
  quarter: number;
  planned: number;
  actual: number;
  delta: number;
  deltaPercent: number | null;
  isOverBudget: boolean;
}

interface CategoryRow {
  category: string;
  months: MonthData[];
  quarters: QuarterData[];
  year: {
    planned: number;
    actual: number;
    delta: number;
    deltaPercent: number | null;
    isOverBudget: boolean;
  };
}

interface BudgetVsActualData {
  year: number;
  tenantId: string;
  actualSources: string[];
  categories: CategoryRow[];
  totals: {
    months: MonthData[];
    quarters: QuarterData[];
    year: {
      planned: number;
      actual: number;
      delta: number;
      deltaPercent: number | null;
      isOverBudget: boolean;
    };
  };
  summary: {
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

type ViewScale = 'MONTHS' | 'QUARTERS' | 'YEAR';

export default function AuditPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [scale, setScale] = useState<ViewScale>('MONTHS');
  const [tenantId, setTenantId] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [data, setData] = useState<BudgetVsActualData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(
    async (year = selectedYear) => {
      try {
        setLoading(true);
        setError(null);
        const session = getStoredSession();
        if (!session?.user?.tenantId) {
          throw new Error(t('common.userNotAuthorizedOrLinked'));
        }
        setTenantId(session.user.tenantId);

        const res = await apiRequest<BudgetVsActualData>(
          `/finance/tenants/${session.user.tenantId}/budget-vs-actual?year=${year}`,
        );
        setData(res);
      } catch (err: any) {
        setError(getApiErrorMessage(err, t));
      } finally {
        setLoading(false);
      }
    },
    [selectedYear, t],
  );

  useEffect(() => {
    loadReport(selectedYear);
  }, [loadReport, selectedYear]);

  const handleDownloadExcel = async () => {
    if (!tenantId) return;
    try {
      setIsDownloading(true);
      await apiDownload(
        `/finance/tenants/${tenantId}/budget-vs-actual/export.xlsx?year=${selectedYear}`,
        `budget_vs_actual_${selectedYear}.xlsx`,
      );
    } catch (err: any) {
      setError(getApiErrorMessage(err, t));
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDrillDownMonth = (category: string, month: number) => {
    const from = `${selectedYear}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(selectedYear, month, 0).getDate();
    const to = `${selectedYear}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    router.push(
      `/dashboard/finance/expenses?category=${encodeURIComponent(category)}&from=${from}&to=${to}`,
    );
  };

  const handleDrillDownQuarter = (category: string, quarter: number) => {
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = quarter * 3;
    const from = `${selectedYear}-${String(startMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(selectedYear, endMonth, 0).getDate();
    const to = `${selectedYear}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    router.push(
      `/dashboard/finance/expenses?category=${encodeURIComponent(category)}&from=${from}&to=${to}`,
    );
  };

  const handleDrillDownYear = (category: string) => {
    const from = `${selectedYear}-01-01`;
    const to = `${selectedYear}-12-31`;
    router.push(
      `/dashboard/finance/expenses?category=${encodeURIComponent(category)}&from=${from}&to=${to}`,
    );
  };

  const monthShortHeaders = [
    t('audit.months.short.1'),
    t('audit.months.short.2'),
    t('audit.months.short.3'),
    t('audit.months.short.4'),
    t('audit.months.short.5'),
    t('audit.months.short.6'),
    t('audit.months.short.7'),
    t('audit.months.short.8'),
    t('audit.months.short.9'),
    t('audit.months.short.10'),
    t('audit.months.short.11'),
    t('audit.months.short.12'),
  ];

  const quarterShortHeaders = [
    t('audit.quarters.short.1'),
    t('audit.quarters.short.2'),
    t('audit.quarters.short.3'),
    t('audit.quarters.short.4'),
  ];

  return (
    <div className="p-8 max-w-[1700px] mx-auto space-y-6">
      {/* Header and Breadcrumbs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link
              href="/dashboard/finance"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{t('audit.backToFinance')}</span>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100 shadow-sm">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                {t('audit.title')}
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">{t('audit.subtitle')}</p>
            </div>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Year selector */}
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('audit.yearLabel')}:
            </span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              disabled={loading}
              className="bg-transparent text-sm font-bold text-slate-800 focus:outline-none cursor-pointer"
            >
              {[2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* Scale Switcher */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setScale('MONTHS')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                scale === 'MONTHS'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('audit.viewMonths')}
            </button>
            <button
              onClick={() => setScale('QUARTERS')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                scale === 'QUARTERS'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('audit.viewQuarters')}
            </button>
            <button
              onClick={() => setScale('YEAR')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                scale === 'YEAR'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('audit.viewYear')}
            </button>
          </div>

          {/* Link to Budget */}
          <Link
            href="/dashboard/finance/budget"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-xl border border-slate-200 shadow-sm transition-all"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>{t('audit.goToBudget')}</span>
          </Link>

          {/* Link to Expenses */}
          <Link
            href="/dashboard/finance/expenses"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-xl border border-slate-200 shadow-sm transition-all"
          >
            <Receipt className="w-4 h-4 text-rose-600" />
            <span>{t('audit.goToExpenses')}</span>
          </Link>

          {/* Download Excel */}
          <button
            onClick={handleDownloadExcel}
            disabled={isDownloading || loading}
            className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl shadow-sm transition-all"
          >
            {isDownloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>{isDownloading ? t('audit.downloading') : t('audit.downloadExcel')}</span>
          </button>

          {/* Refresh button */}
          <button
            onClick={() => loadReport(selectedYear)}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-all disabled:opacity-50"
            title={t('common.refresh')}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Sources badge & hint */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-700">{t('audit.actualSourcesLabel')}</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-medium">
            {t('audit.sourcesExpenseLedger')}
          </span>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
            <span>{t('audit.legendOver')}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
            <span>{t('audit.legendUnder')}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block"></span>
            <span>{t('audit.legendNoBudget')}</span>
          </span>
          <span className="flex items-center gap-1 text-amber-700 font-semibold">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span>{t('audit.outlierBadge')}</span>
          </span>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl border bg-rose-50 border-rose-200 text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* KPI Cards */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Planned */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
              <span>{t('audit.totalPlanned')}</span>
              <FileSpreadsheet className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-2xl font-extrabold text-slate-900 font-mono">
              {data.totals.year.planned.toLocaleString()} ₸
            </div>
            <p className="text-[11px] text-slate-400">{data.categories.length} {t('audit.thCategory')}</p>
          </div>

          {/* Total Actual */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
              <span>{t('audit.totalActual')}</span>
              <Receipt className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-2xl font-extrabold text-slate-900 font-mono">
              {data.totals.year.actual.toLocaleString()} ₸
            </div>
            <p className="text-[11px] text-slate-400">{selectedYear} {t('audit.yearLabel')}</p>
          </div>

          {/* Total Delta */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
              <span>{t('audit.totalDelta')}</span>
              {data.totals.year.delta > 0 ? (
                <TrendingUp className="w-4 h-4 text-rose-500" />
              ) : (
                <TrendingDown className="w-4 h-4 text-emerald-500" />
              )}
            </div>
            <div
              className={`text-2xl font-extrabold font-mono ${
                data.totals.year.actual === 0
                  ? 'text-slate-400'
                  : data.totals.year.delta > 0
                  ? 'text-rose-600'
                  : 'text-emerald-600'
              }`}
            >
              {data.totals.year.actual === 0
                ? '—'
                : `${data.totals.year.delta > 0 ? '+' : ''}${data.totals.year.delta.toLocaleString()} ₸`}
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              {data.totals.year.actual === 0
                ? '—'
                : data.totals.year.deltaPercent !== null
                ? `${data.totals.year.deltaPercent > 0 ? '+' : ''}${data.totals.year.deltaPercent}%`
                : '—'}
            </p>
          </div>

          {/* Over-budget count */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
              <span>{t('audit.overBudgetCount')}</span>
              <AlertCircle className="w-4 h-4 text-rose-500" />
            </div>
            <div
              className={`text-2xl font-extrabold font-mono ${
                data.summary.overBudgetCount > 0 ? 'text-rose-600' : 'text-emerald-600'
              }`}
            >
              {data.summary.overBudgetCount}
            </div>
            <p className="text-[11px] text-slate-400">
              {data.summary.outliersCount > 0
                ? `${data.summary.outliersCount} ${t('audit.outlierBadge')}`
                : t('audit.noOverBudget')}
            </p>
          </div>
        </div>
      )}

      {/* Main Plan/Fact Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            <p className="text-sm">{t('common.loading')}</p>
          </div>
        ) : !data || data.categories.length === 0 ? (
          <div className="p-16 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
            <BarChart3 className="w-12 h-12 text-slate-300" />
            <p className="text-sm">{t('audit.emptyData')}</p>
            <Link
              href="/dashboard/finance/budget"
              className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl shadow-sm"
            >
              {t('audit.goToBudget')}
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4 min-w-[200px] sticky left-0 bg-slate-50 z-10 border-r border-slate-200">
                    {t('audit.thCategory')}
                  </th>

                  {scale === 'MONTHS' &&
                    monthShortHeaders.map((mHeader, idx) => (
                      <th
                        key={idx}
                        className="py-3 px-2 min-w-[125px] text-center border-r border-slate-200"
                      >
                        {mHeader}
                      </th>
                    ))}

                  {scale === 'QUARTERS' &&
                    quarterShortHeaders.map((qHeader, idx) => (
                      <th
                        key={idx}
                        className="py-3 px-3 min-w-[160px] text-center border-r border-slate-200"
                      >
                        {qHeader}
                      </th>
                    ))}

                  <th className="py-3 px-4 min-w-[160px] text-center bg-slate-100 font-bold text-slate-800 border-l border-slate-200">
                    {t('audit.viewYear')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.categories.map((row) => (
                  <tr key={row.category} className="hover:bg-slate-50/60 transition-colors">
                    {/* Category Title with drill-down to all expenses of this category */}
                    <td className="py-2.5 px-4 font-semibold text-slate-800 sticky left-0 bg-white z-10 border-r border-slate-200 max-w-[220px]">
                      <button
                        onClick={() => handleDrillDownYear(row.category)}
                        className="text-left hover:text-indigo-600 hover:underline transition-colors truncate block w-full"
                        title={t('audit.drillDownHint')}
                      >
                        {row.category}
                      </button>
                    </td>

                    {/* Scale: Months */}
                    {scale === 'MONTHS' &&
                      row.months.map((m) => {
                        const cellColorClass =
                          m.actual > 0 && m.planned > 0
                            ? m.isOverBudget
                              ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                              : 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                            : m.actual > 0 && m.planned === 0
                            ? 'bg-slate-50 border-slate-200 text-slate-700'
                            : 'bg-white border-transparent text-slate-500';

                        return (
                          <td
                            key={m.month}
                            onClick={() => handleDrillDownMonth(row.category, m.month)}
                            className="py-2 px-2 border-r border-slate-100 cursor-pointer hover:ring-2 hover:ring-indigo-300 transition-all"
                            title={t('audit.drillDownHint')}
                          >
                            <div className={`p-1.5 rounded-lg border text-[11px] ${cellColorClass}`}>
                              <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span>{t('audit.thPlanned')}: {m.planned ? m.planned.toLocaleString() : '0'}</span>
                                {m.isOutlier && (
                                  <span
                                    className="text-amber-600 font-bold flex items-center"
                                    title={t('audit.outliersHelp')}
                                  >
                                    <AlertTriangle className="w-3 h-3" />
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center justify-between font-bold text-xs mt-0.5 font-mono">
                                <span>{m.actual ? `${m.actual.toLocaleString()} ₸` : '—'}</span>
                                {m.actual > 0 && m.deltaPercent !== null && (
                                  <span
                                    className={`text-[10px] ${
                                      m.isOverBudget ? 'text-rose-600' : 'text-emerald-600'
                                    }`}
                                  >
                                    {m.deltaPercent > 0 ? `+${m.deltaPercent}%` : `${m.deltaPercent}%`}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                        );
                      })}

                    {/* Scale: Quarters */}
                    {scale === 'QUARTERS' &&
                      row.quarters.map((q) => {
                        const cellColorClass =
                          q.actual > 0 && q.planned > 0
                            ? q.isOverBudget
                              ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                              : 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                            : q.actual > 0 && q.planned === 0
                            ? 'bg-slate-50 border-slate-200 text-slate-700'
                            : 'bg-white border-transparent text-slate-500';

                        return (
                          <td
                            key={q.quarter}
                            onClick={() => handleDrillDownQuarter(row.category, q.quarter)}
                            className="py-2 px-2.5 border-r border-slate-100 cursor-pointer hover:ring-2 hover:ring-indigo-300 transition-all"
                            title={t('audit.drillDownHint')}
                          >
                            <div className={`p-2 rounded-lg border text-xs ${cellColorClass}`}>
                              <div className="flex items-center justify-between text-[11px] text-slate-400">
                                <span>{t('audit.thPlanned')}: {q.planned ? q.planned.toLocaleString() : '0'}</span>
                                {q.actual > 0 && q.deltaPercent !== null && (
                                  <span
                                    className={`font-semibold ${
                                      q.isOverBudget ? 'text-rose-600' : 'text-emerald-600'
                                    }`}
                                  >
                                    {q.deltaPercent > 0 ? `+${q.deltaPercent}%` : `${q.deltaPercent}%`}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center justify-between font-bold text-xs mt-1 font-mono">
                                <span>{q.actual ? `${q.actual.toLocaleString()} ₸` : '—'}</span>
                                <span className="text-[10px] text-slate-500">
                                  {q.actual === 0 && (isFutureQuarter(selectedYear, q.quarter) || row.year.actual === 0)
                                    ? '—'
                                    : `Δ ${q.delta > 0 ? `+${q.delta.toLocaleString()}` : q.delta.toLocaleString()}`}
                                </span>
                              </div>
                            </div>
                          </td>
                        );
                      })}

                    {/* Year Total Column */}
                    <td
                      onClick={() => handleDrillDownYear(row.category)}
                      className="py-2 px-3 border-l border-slate-200 bg-slate-50/60 cursor-pointer hover:ring-2 hover:ring-indigo-300 transition-all"
                      title={t('audit.drillDownHint')}
                    >
                      <div className="text-xs space-y-0.5">
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span>{t('audit.thPlanned')}:</span>
                          <span className="font-mono">{row.year.planned.toLocaleString()} ₸</span>
                        </div>
                        <div className="flex items-center justify-between font-bold text-slate-900 font-mono">
                          <span>{t('audit.thActual')}:</span>
                          <span className={row.year.isOverBudget ? 'text-rose-600' : 'text-slate-900'}>
                            {row.year.actual ? `${row.year.actual.toLocaleString()} ₸` : '—'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] pt-0.5 border-t border-slate-200 font-mono">
                          <span>{t('audit.thDelta')}:</span>
                          <span
                            className={
                              row.year.actual === 0
                                ? 'text-slate-400 font-semibold'
                                : row.year.delta > 0
                                ? 'text-rose-600 font-semibold'
                                : 'text-emerald-600 font-semibold'
                            }
                          >
                            {row.year.actual === 0
                              ? '—'
                              : `${row.year.delta > 0 ? `+${row.year.delta.toLocaleString()}` : row.year.delta.toLocaleString()} ₸${row.year.deltaPercent !== null ? ` (${row.year.deltaPercent > 0 ? '+' : ''}${row.year.deltaPercent}%)` : ''}`}
                          </span>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* Totals Footer Row */}
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-900 text-xs">
                  <td className="py-3 px-4 sticky left-0 bg-slate-100 z-10 border-r border-slate-300">
                    {t('audit.totalsRow')}
                  </td>

                  {scale === 'MONTHS' &&
                    data.totals.months.map((m) => {
                      const isFuture = isFutureMonth(selectedYear, m.month);
                      const isNoFact = m.actual === 0;
                      return (
                        <td key={m.month} className="py-2.5 px-2 text-right border-r border-slate-200 font-mono">
                          <div className="text-[10px] text-slate-500">
                            {m.planned.toLocaleString()}
                          </div>
                          <div className="font-bold text-xs text-slate-900">
                            {isNoFact && isFuture ? '—' : `${m.actual.toLocaleString()} ₸`}
                          </div>
                          <div
                            className={`text-[10px] ${
                              m.isOverBudget ? 'text-rose-600' : 'text-emerald-600'
                            }`}
                          >
                            {formatDeltaPercentDisplay(m.deltaPercent, m.actual, isFuture)}
                          </div>
                        </td>
                      );
                    })}

                  {scale === 'QUARTERS' &&
                    data.totals.quarters.map((q) => {
                      const isFuture = isFutureQuarter(selectedYear, q.quarter);
                      const isNoFact = q.actual === 0;
                      return (
                        <td key={q.quarter} className="py-2.5 px-3 text-right border-r border-slate-200 font-mono">
                          <div className="text-[11px] text-slate-500">
                            {t('audit.thPlanned')}: {q.planned.toLocaleString()}
                          </div>
                          <div className="font-bold text-xs text-slate-900">
                            {t('audit.thActual')}: {isNoFact && isFuture ? '—' : `${q.actual.toLocaleString()} ₸`}
                          </div>
                          <div
                            className={`text-[11px] font-semibold ${
                              q.isOverBudget ? 'text-rose-600' : 'text-emerald-600'
                            }`}
                          >
                            {isNoFact && isFuture
                              ? '—'
                              : `Δ ${q.delta > 0 ? `+${q.delta.toLocaleString()}` : q.delta.toLocaleString()}`}
                          </div>
                        </td>
                      );
                    })}

                  {/* Year grand total */}
                  <td className="py-3 px-3 bg-emerald-50/70 border-l border-slate-300 font-mono">
                    <div className="text-[11px] text-slate-500">
                      {t('audit.thPlanned')}: {data.totals.year.planned.toLocaleString()} ₸
                    </div>
                    <div className="text-sm font-extrabold text-slate-900">
                      {t('audit.thActual')}: {data.totals.year.actual ? `${data.totals.year.actual.toLocaleString()} ₸` : '—'}
                    </div>
                    <div
                      className={`text-xs font-bold ${
                        data.totals.year.actual === 0
                          ? 'text-slate-400'
                          : data.totals.year.delta > 0
                          ? 'text-rose-600'
                          : 'text-emerald-700'
                      }`}
                    >
                      {data.totals.year.actual === 0
                        ? '—'
                        : `Δ ${data.totals.year.delta > 0 ? '+' : ''}${data.totals.year.delta.toLocaleString()} ₸${data.totals.year.deltaPercent !== null ? ` (${data.totals.year.deltaPercent > 0 ? '+' : ''}${data.totals.year.deltaPercent}%)` : ''}`}
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Analytical Cards Section */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Top Over-budget items */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-rose-600 font-bold text-sm">
              <TrendingUp className="w-4 h-4 shrink-0" />
              <span>{t('audit.topOverBudgetTitle')}</span>
            </div>

            {data.summary.topOverBudgetItems.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">{t('audit.noOverBudget')}</p>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {data.summary.topOverBudgetItems.map((item, idx) => {
                  const monthNum = resolvePeriodMonth(item);
                  const periodLabel = monthNum
                    ? t(`audit.months.${monthNum}`)
                    : item.period;

                  return (
                    <div key={idx} className="py-2 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-800">{item.category}</p>
                        <p className="text-[11px] text-slate-400">
                          {periodLabel} • {t('audit.thPlanned')}: {item.planned.toLocaleString()} ₸
                        </p>
                      </div>
                      <div className="text-right font-mono">
                        <span className="font-bold text-rose-600 block">
                          +{item.delta.toLocaleString()} ₸
                        </span>
                        {item.deltaPercent !== null && (
                          <span className="text-[10px] text-rose-500">
                            +{item.deltaPercent}%
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Actual without Budget */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-amber-600 font-bold text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{t('audit.withoutBudgetTitle')}</span>
            </div>

            {data.summary.categoriesWithoutBudget.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">{t('audit.noWithoutBudget')}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 py-1">
                {data.summary.categoriesWithoutBudget.map((cat, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleDrillDownYear(cat)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition-colors"
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Budget without Actual */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-indigo-600 font-bold text-sm">
              <Info className="w-4 h-4 shrink-0" />
              <span>{t('audit.withoutActualTitle')}</span>
            </div>

            {data.summary.categoriesWithoutActual.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">{t('audit.noWithoutActual')}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 py-1">
                {data.summary.categoriesWithoutActual.map((cat, idx) => (
                  <span
                    key={idx}
                    className="text-xs px-2.5 py-1 rounded-lg bg-slate-50 text-slate-700 border border-slate-200"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
