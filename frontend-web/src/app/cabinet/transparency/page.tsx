'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PieChart,
  Calendar,
  Download,
  Loader2,
  ShieldCheck,
  TrendingUp,
  Receipt,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Building,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import {
  CabinetApi,
  TransparencyReport,
  ResidentProfile,
} from '@/lib/cabinet-api';
import { getBalanceGradation } from '@/lib/balance';

const MONTH_NAMES = [
  'common.months.1',
  'common.months.2',
  'common.months.3',
  'common.months.4',
  'common.months.5',
  'common.months.6',
  'common.months.7',
  'common.months.8',
  'common.months.9',
  'common.months.10',
  'common.months.11',
  'common.months.12',
];

export default function CabinetTransparencyPage() {
  const { t, i18n } = useTranslation();

  const [profile, setProfile] = useState<ResidentProfile | null>(null);
  const [reportMonth, setReportMonth] = useState<number>(new Date().getMonth() + 1);
  const [reportYear, setReportYear] = useState<number>(new Date().getFullYear());
  const [transparency, setTransparency] = useState<TransparencyReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [downloadingCsv, setDownloadingCsv] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load resident profile
  useEffect(() => {
    CabinetApi.getMe()
      .then((me) => setProfile(me))
      .catch((err) => {
        console.warn('Failed to load profile:', err);
      });
  }, []);

  const tenantId =
    profile?.tenantId || profile?.ownerships?.[0]?.unit?.building?.tenantId;

  // Load transparency report
  const loadReport = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const rep = await CabinetApi.getTransparencyReport(tenantId, {
        month: reportMonth,
        year: reportYear,
      });
      setTransparency(rep);
    } catch (err: any) {
      console.warn('Failed to load transparency report:', err);
      setError(err?.message || t('cabinet.noReportForPeriod'));
    } finally {
      setLoading(false);
    }
  }, [tenantId, reportMonth, reportYear, t]);

  useEffect(() => {
    if (tenantId) {
      loadReport();
    }
  }, [tenantId, loadReport]);

  const handleDownloadCsv = async () => {
    if (!tenantId) return;
    setDownloadingCsv(true);
    try {
      await CabinetApi.downloadTransparencyReportCsv(tenantId, {
        month: reportMonth,
        year: reportYear,
      });
    } catch (err) {
      console.warn('Failed to download CSV:', err);
    } finally {
      setDownloadingCsv(false);
    }
  };

  const formatMoney = (val?: number | null) => {
    const num = val ?? 0;
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'KZT',
      maximumFractionDigits: 0,
    })
      .format(num)
      .replace('KZT', '₸');
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      return new Intl.DateTimeFormat(
        i18n.language === 'en' ? 'en-US' : i18n.language === 'kk' ? 'kk-KZ' : 'ru-RU',
        { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Almaty' },
      ).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  };

  const complexName = profile?.tenant?.name || t('dashboard.defaultComplex');

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-600/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <PieChart className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {t('cabinet.transparencyTitle')}
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            {t('cabinet.transparencySubtitle')} · <span className="font-semibold text-slate-700 dark:text-slate-300">{complexName}</span>
          </p>
        </div>

        {/* Controls: Period picker & Download CSV */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 shadow-sm">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={reportMonth}
              onChange={(e) => setReportMonth(parseInt(e.target.value, 10))}
              aria-label={t('cabinet.reportPeriodLabel')}
              className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                <option key={m} value={m} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                  {t(MONTH_NAMES[m - 1], { defaultValue: t('cabinet.monthNum', { num: m }) })}
                </option>
              ))}
            </select>

            <span className="text-slate-300 dark:text-slate-700">/</span>

            <select
              value={reportYear}
              onChange={(e) => setReportYear(parseInt(e.target.value, 10))}
              aria-label={t('cabinet.reportPeriodLabel')}
              className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
            >
              {[2025, 2026, 2027].map((y) => (
                <option key={y} value={y} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                  {t('cabinet.yearNum', { num: y })}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleDownloadCsv}
            disabled={downloadingCsv || !transparency}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors shadow-sm disabled:opacity-50"
          >
            {downloadingCsv ? (
              <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
            ) : (
              <Download className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            )}
            <span>{t('cabinet.downloadCsvReport')}</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-9 h-9 animate-spin text-emerald-600" />
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t('common.loading')}
          </p>
        </div>
      ) : error ? (
        <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{error}</p>
        </div>
      ) : transparency ? (
        <div className="space-y-6">
          {/* Summary KPI Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Collected */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {t('cabinet.collectedFunds')}
                </span>
                <div className="text-2xl font-extrabold text-steppe-600 dark:text-steppe-400 mt-2">
                  {formatMoney(transparency.totalCollected)}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>{t('cabinet.accruedToResidents')}:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {formatMoney(transparency.totalCharged)}
                </span>
              </div>
            </div>

            {/* 2. Total Expenses */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {t('cabinet.totalExpenses')}
                </span>
                <div className="text-2xl font-extrabold text-slate-900 dark:text-white mt-2">
                  {formatMoney(transparency.totalExpenses)}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>{t('cabinet.plannedExpenses')}:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {formatMoney(transparency.totalPlannedExpenses || 0)}
                </span>
              </div>
            </div>

            {/* 3. Collection rate */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {t('cabinet.collectionRate', { percent: transparency.collectionRatePercent })}
                </span>
                <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-2">
                  {transparency.collectionRatePercent}%
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center gap-2">
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-600 dark:bg-emerald-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(transparency.collectionRatePercent, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* 4. Net balance */}
            {(() => {
              const balanceStatus = getBalanceGradation(
                transparency.netBalance,
                transparency.totalExpenses,
              );
              const isBalanced = balanceStatus === 'balanced';
              const isSurplus = balanceStatus === 'surplus';

              return (
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {t('cabinet.netBalance')}
                    </span>
                    <div
                      className={`text-2xl font-extrabold mt-2 ${
                        isBalanced
                          ? 'text-sky-600 dark:text-sky-400'
                          : isSurplus
                          ? 'text-steppe-600 dark:text-steppe-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {transparency.netBalance > 0 ? '+' : ''}
                      {formatMoney(transparency.netBalance)}
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-[11px]">
                    {isBalanced ? (
                      <span className="text-sky-700 dark:text-sky-300 font-medium">
                        {t('cabinet.budgetBalanced')}
                      </span>
                    ) : isSurplus ? (
                      <span className="text-steppe-700 dark:text-steppe-300 font-medium">
                        {t('cabinet.budgetSurplus')}
                      </span>
                    ) : (
                      <span className="text-red-600 dark:text-red-400 font-medium">
                        {t('cabinet.budgetDeficit')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Section: Expenses by Category with horizontal bars & Plan vs Fact */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {t('cabinet.breakdownByCategory')}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('cabinet.expenseCategories')} · {t('cabinet.planVsFact')}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-emerald-600 dark:bg-emerald-500 shrink-0" />
                  <span>{t('cabinet.fact')}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-slate-300 dark:bg-slate-700 shrink-0" />
                  <span>{t('cabinet.plan')}</span>
                </span>
              </div>
            </div>

            {transparency.byExpenseCategory && transparency.byExpenseCategory.length > 0 ? (
              <div className="space-y-5">
                {transparency.byExpenseCategory.map((item, idx) => {
                  const sharePercent =
                    item.percentageOfTotal !== undefined
                      ? item.percentageOfTotal
                      : transparency.totalExpenses > 0
                      ? Math.round((item.amount / transparency.totalExpenses) * 1000) / 10
                      : 0;

                  const planned = item.plannedAmount || 0;
                  const isOverBudget = planned > 0 && item.amount > planned;
                  const delta = item.amount - planned;

                  return (
                    <div
                      key={idx}
                      className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60 space-y-2.5"
                    >
                      {/* Top row: Name & Actual amount */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
                          <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                            {item.category}
                          </span>
                          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                            ({t('cabinet.shareOfExpenses', { percent: sharePercent })})
                          </span>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                            {t('cabinet.fact')}:
                          </span>
                          <span className="text-sm font-extrabold text-slate-900 dark:text-white font-mono">
                            {formatMoney(item.amount)}
                          </span>
                        </div>
                      </div>

                      {/* Horizontal progress bar */}
                      <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                        <div
                          className="bg-emerald-600 dark:bg-emerald-500 h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(Math.max(sharePercent, 1), 100)}%` }}
                        />
                      </div>

                      {/* Bottom row: Plan vs Fact details */}
                      <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 pt-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span>
                            {t('cabinet.plan')}: <span className="font-semibold text-slate-800 dark:text-slate-200">{formatMoney(planned)}</span>
                          </span>
                          {planned > 0 && (
                            <span className="text-slate-400">·</span>
                          )}
                          {planned > 0 && (
                            <span>
                              {t('cabinet.deviation')}:{' '}
                              <span
                                className={`font-semibold ${
                                  isOverBudget
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-steppe-600 dark:text-steppe-400'
                                }`}
                              >
                                {delta > 0 ? `+${formatMoney(delta)}` : formatMoney(delta)}
                              </span>
                            </span>
                          )}
                        </div>

                        {planned > 0 && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isOverBudget
                                ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                : 'bg-steppe-100 dark:bg-steppe-950/40 text-steppe-800 dark:text-steppe-300 border border-steppe-200 dark:border-steppe-800'
                            }`}
                          >
                            {isOverBudget ? t('cabinet.overBudget') : t('cabinet.withinBudget')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                {t('cabinet.noExpenseData')}
              </div>
            )}
          </div>

          {/* Section: Recent Major Expenses Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t('cabinet.recentExpensesTitle')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('cabinet.privacySafeNotice')}
              </p>
            </div>

            {transparency.recentExpenses && transparency.recentExpenses.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="py-3 px-3">{t('cabinet.expenseDate')}</th>
                      <th className="py-3 px-3">{t('cabinet.expenseCategory')}</th>
                      <th className="py-3 px-3">{t('cabinet.expenseRecipient')}</th>
                      <th className="py-3 px-3">{t('cabinet.expenseDescription')}</th>
                      <th className="py-3 px-3 text-right">{t('cabinet.expenseAmount')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                    {transparency.recentExpenses.map((exp) => (
                      <tr
                        key={exp.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {formatDate(exp.date)}
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {exp.category}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-700 dark:text-slate-300 font-medium">
                          {exp.counterparty || '—'}
                        </td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400 max-w-xs truncate">
                          {exp.description || '—'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                          {formatMoney(exp.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                {t('cabinet.noRecentExpenses')}
              </div>
            )}
          </div>

          {/* Privacy & Transparency Notice Card */}
          <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-500/20 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-700 dark:text-slate-300 space-y-1">
              <span className="font-bold text-slate-900 dark:text-white">
                {t('cabinet.transparencyCardBadge')}
              </span>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                {t('cabinet.privacySafeNotice')}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-xs text-slate-500">{t('cabinet.noReportForPeriod')}</p>
        </div>
      )}
    </div>
  );
}
