'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CreditCard,
  FileText,
  DollarSign,
  PieChart,
  Calendar,
  CheckCircle2,
  Download,
  Printer,
  ChevronRight,
  Loader2,
  X,
  TrendingUp,
  Receipt,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';
import {
  CabinetApi,
  PersonalAccount,
  TransparencyReport,
  ResidentProfile,
} from '@/lib/cabinet-api';
import { getBalanceGradation } from '@/lib/balance';

export default function CabinetFinancePage() {
  const { t, i18n } = useTranslation();

  const [profile, setProfile] = useState<ResidentProfile | null>(null);
  const [account, setAccount] = useState<PersonalAccount | null>(null);
  const [activeTab, setActiveTab] = useState<'charges' | 'payments' | 'transparency'>('charges');
  const [loading, setLoading] = useState(true);

  // Transparency report state
  const [reportYear, setReportYear] = useState<number>(new Date().getFullYear());
  const [reportMonth, setReportMonth] = useState<number>(new Date().getMonth() + 1);
  const [transparency, setTransparency] = useState<TransparencyReport | null>(null);
  const [transparencyLoading, setTransparencyLoading] = useState(false);
  const [downloadingCsv, setDownloadingCsv] = useState(false);

  // Modals
  const [showPayModal, setShowPayModal] = useState(false);
  const [customPayAmount, setCustomPayAmount] = useState('5000');
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [me, accounts] = await Promise.all([
        CabinetApi.getMe(),
        CabinetApi.getMyAccounts(),
      ]);
      setProfile(me);
      if (accounts && accounts.length > 0) {
        setAccount(accounts[0]);
      }
    } catch (e) {
      console.warn('Failed to load finance data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('tab') === 'transparency') {
        setActiveTab('transparency');
      }
    }
  }, [loadData]);

  // Load transparency report when tab is active or period changes
  const loadTransparency = useCallback(async () => {
    const tenantId = profile?.tenantId || profile?.ownerships?.[0]?.unit?.building?.tenantId;
    if (!tenantId) return;

    setTransparencyLoading(true);
    try {
      const rep = await CabinetApi.getTransparencyReport(tenantId, {
        month: reportMonth,
        year: reportYear,
      });
      setTransparency(rep);
    } catch (e) {
      console.warn('Failed to load transparency report:', e);
    } finally {
      setTransparencyLoading(false);
    }
  }, [profile, reportMonth, reportYear]);

  useEffect(() => {
    if (activeTab === 'transparency') {
      loadTransparency();
    }
  }, [activeTab, loadTransparency]);

  const balance = account?.balance ?? 0;
  const unitNumber = profile?.ownerships?.[0]?.unit?.unitNumber;

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'KZT',
      maximumFractionDigits: 0,
    })
      .format(val)
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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {t('navigation.cabinetFinance')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('cabinet.financeSubtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPayModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors"
          >
            <CreditCard className="w-4 h-4" />
            <span>{t('cabinet.pay')}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowReceiptModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors"
          >
            <FileText className="w-4 h-4" />
            <span>{t('cabinet.receipt')}</span>
          </button>
        </div>
      </div>

      {/* Main Account Balance Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t('cabinet.balance')}
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span
                className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${
                  balance < 0
                    ? 'text-red-600 dark:text-red-400'
                    : balance > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-900 dark:text-white'
                }`}
              >
                {formatMoney(balance)}
              </span>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {balance < 0
                  ? t('cabinet.currentDebt')
                  : balance > 0
                  ? t('cabinet.overpayment')
                  : t('cabinet.noDebt')}
              </span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-xs space-y-1 self-start sm:self-auto min-w-[200px]">
            <div className="text-slate-500 dark:text-slate-400">
              {t('cabinet.accountNumber')}:{' '}
              <span className="font-mono font-bold text-slate-900 dark:text-white">
                {account?.accountNumber || '101-001'}
              </span>
            </div>
            <div className="text-slate-500 dark:text-slate-400">
              {t('cabinet.apartmentLabel')}:{' '}
              <span className="font-semibold text-slate-900 dark:text-white">
                {unitNumber ? t('cabinet.apartment', { number: unitNumber }) : '—'}
              </span>
            </div>
            <div className="text-slate-500 dark:text-slate-400">
              {t('cabinet.areaLabel')}:{' '}
              <span className="font-semibold text-slate-900 dark:text-white">
                {profile?.ownerships?.[0]?.unit?.area
                  ? t('cabinet.areaSqm', { area: profile.ownerships[0].unit.area })
                  : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('charges')}
          className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'charges'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          {t('cabinet.chargesHistory')} ({account?.charges?.length || 0})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('payments')}
          className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'payments'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          {t('cabinet.paymentsHistory')} ({account?.payments?.length || 0})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('transparency')}
          className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'transparency'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          {t('cabinet.transparencyReport')}
        </button>
      </div>

      {/* Tab: Charges */}
      {activeTab === 'charges' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          {account?.charges && account.charges.length > 0 ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {account.charges.map((ch) => (
                <div key={ch.id} className="p-4 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      {ch.tariffItem?.name}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {t('cabinet.periodLabel')}: {ch.periodMonth}.{ch.periodYear} • {formatDate(ch.createdAt)}
                    </div>
                  </div>

                  <span className="font-bold text-sm text-slate-900 dark:text-white font-mono">
                    {formatMoney(ch.amount)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
              {t('cabinet.noCharges')}
            </div>
          )}
        </div>
      )}

      {/* Tab: Payments */}
      {activeTab === 'payments' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          {account?.payments && account.payments.length > 0 ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {account.payments.map((p) => (
                <div key={p.id} className="p-4 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center">
                      <ArrowDownLeft className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">
                        {p.method || t('cabinet.onlinePayment')}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {formatDate(p.paidAt)} {p.note && `• ${p.note}`}
                      </div>
                    </div>
                  </div>

                  <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400 font-mono">
                    +{formatMoney(p.amount)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
              {t('cabinet.noPayments')}
            </div>
          )}
        </div>
      )}

      {/* Tab: Transparency Report */}
      {activeTab === 'transparency' && (
        <div className="space-y-6">
          {/* Month & Year Selectors and CSV download */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {t('cabinet.reportPeriodLabel')}:
              </span>

              <select
                value={reportMonth}
                onChange={(e) => setReportMonth(parseInt(e.target.value, 10))}
                className="py-1.5 px-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs font-semibold"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                  <option key={m} value={m}>
                    {t('cabinet.monthNum', { num: m })}
                  </option>
                ))}
              </select>

              <select
                value={reportYear}
                onChange={(e) => setReportYear(parseInt(e.target.value, 10))}
                className="py-1.5 px-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs font-semibold"
              >
                {[2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>
                    {t('cabinet.yearNum', { num: y })}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              disabled={downloadingCsv || !transparency}
              onClick={async () => {
                const tenantId = profile?.tenantId || profile?.ownerships?.[0]?.unit?.building?.tenantId;
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
              }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-50"
            >
              {downloadingCsv ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
              ) : (
                <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              )}
              <span>{t('cabinet.downloadCsvReport')}</span>
            </button>
          </div>

          {transparencyLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            </div>
          ) : transparency ? (
            <div className="space-y-6">
              {/* Summary Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="text-xs text-slate-500 dark:text-slate-400">{t('cabinet.accruedToResidents')}</div>
                  <div className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
                    {formatMoney(transparency.totalCharged)}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="text-xs text-slate-500 dark:text-slate-400">{t('cabinet.collectedFunds')}</div>
                  <div className="text-xl font-extrabold text-steppe-600 dark:text-steppe-400 mt-1">
                    {formatMoney(transparency.totalCollected)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {t('cabinet.collectionRate', { percent: transparency.collectionRatePercent })}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="text-xs text-slate-500 dark:text-slate-400">{t('cabinet.expenses')}</div>
                  <div className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
                    {formatMoney(transparency.totalExpenses)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {t('cabinet.plannedExpenses')}: {formatMoney(transparency.totalPlannedExpenses || 0)}
                  </div>
                </div>

                {(() => {
                  const balanceStatus = getBalanceGradation(
                    transparency.netBalance,
                    transparency.totalExpenses,
                  );
                  const isBalanced = balanceStatus === 'balanced';
                  const isSurplus = balanceStatus === 'surplus';

                  return (
                    <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                      <div className="text-xs text-slate-500 dark:text-slate-400">{t('cabinet.netBalance')}</div>
                      <div
                        className={`text-xl font-extrabold mt-1 ${
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
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {isBalanced
                          ? t('cabinet.budgetBalanced')
                          : isSurplus
                          ? t('cabinet.budgetSurplus')
                          : t('cabinet.budgetDeficit')}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Expenses Breakdown with horizontal bars & Plan vs Fact */}
              <div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t('cabinet.breakdownByCategory')}
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {t('cabinet.planVsFact')}
                  </span>
                </div>

                {transparency.byExpenseCategory && transparency.byExpenseCategory.length > 0 ? (
                  <div className="space-y-4">
                    {transparency.byExpenseCategory.map((cat, idx) => {
                      const sharePercent =
                        cat.percentageOfTotal !== undefined
                          ? cat.percentageOfTotal
                          : transparency.totalExpenses > 0
                          ? Math.round((cat.amount / transparency.totalExpenses) * 1000) / 10
                          : 0;
                      const planned = cat.plannedAmount || 0;
                      const isOver = planned > 0 && cat.amount > planned;

                      return (
                        <div
                          key={idx}
                          className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60 space-y-2"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-900 dark:text-white font-bold">
                              {cat.category}
                              <span className="ml-2 font-normal text-slate-500">
                                ({t('cabinet.shareOfExpenses', { percent: sharePercent })})
                              </span>
                            </span>
                            <span className="font-mono font-extrabold text-slate-900 dark:text-white">
                              {formatMoney(cat.amount)}
                            </span>
                          </div>

                          <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-emerald-600 dark:bg-emerald-500 h-full rounded-full transition-all duration-500"
                              style={{ width: `${Math.min(Math.max(sharePercent, 1), 100)}%` }}
                            />
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                            <span>
                              {t('cabinet.plan')}: {formatMoney(planned)}
                            </span>
                            {planned > 0 && (
                              <span className={isOver ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-steppe-600 dark:text-steppe-400 font-bold'}>
                                {isOver ? t('cabinet.overBudget') : t('cabinet.withinBudget')}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 py-4 text-center">{t('cabinet.noExpenseData')}</div>
                )}
              </div>

              {/* Recent Major Expenses */}
              {transparency.recentExpenses && transparency.recentExpenses.length > 0 && (
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t('cabinet.recentExpensesTitle')}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 uppercase">
                          <th className="py-2.5 px-3">{t('cabinet.expenseDate')}</th>
                          <th className="py-2.5 px-3">{t('cabinet.expenseCategory')}</th>
                          <th className="py-2.5 px-3">{t('cabinet.expenseRecipient')}</th>
                          <th className="py-2.5 px-3">{t('cabinet.expenseDescription')}</th>
                          <th className="py-2.5 px-3 text-right">{t('cabinet.expenseAmount')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {transparency.recentExpenses.map((e) => (
                          <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="py-2.5 px-3 font-mono text-slate-500">{formatDate(e.date)}</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">{e.category}</td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{e.counterparty || '—'}</td>
                            <td className="py-2.5 px-3 text-slate-500 truncate max-w-xs">{e.description || '—'}</td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">{formatMoney(e.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-slate-500">
              {t('cabinet.noReportForPeriod')}
            </div>
          )}
        </div>
      )}

      {/* Pay Modal */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl relative animate-in fade-in duration-200">
            <button
              type="button"
              onClick={() => setShowPayModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label={t('cabinet.close')}
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {t('cabinet.payModalTitle')}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {t('cabinet.payModalDesc')}
            </p>

            {balance > 0 ? (
              <div className="mt-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 space-y-2">
                <p>{t('cabinet.advanceNotice')}</p>
                <div className="flex items-center justify-between font-bold pt-1 border-t border-emerald-200 dark:border-emerald-800">
                  <span>{t('cabinet.overpayment')}:</span>
                  <span>{formatMoney(balance)}</span>
                </div>
                <div className="pt-2">
                  <label className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                    {t('cabinet.enterPayAmount')}
                  </label>
                  <input
                    type="number"
                    value={customPayAmount}
                    onChange={(e) => setCustomPayAmount(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white text-xs font-mono font-bold"
                  />
                </div>
              </div>
            ) : (
              <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  {t('cabinet.totalPayable')}
                </span>
                <span className="text-base font-extrabold text-slate-900 dark:text-white">
                  {formatMoney(Math.abs(balance))}
                </span>
              </div>
            )}

            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => {
                  alert(t('cabinet.paySuccess'));
                  setShowPayModal(false);
                }}
                className="w-full p-3 rounded-xl border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 text-xs font-bold flex items-center justify-between transition-colors"
              >
                <span>{t('cabinet.payKaspi')}</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  alert(t('cabinet.paySuccess'));
                  setShowPayModal(false);
                }}
                className="w-full p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center justify-between transition-colors"
              >
                <span>{t('cabinet.payHalyk')}</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  alert(t('cabinet.paySuccess'));
                  setShowPayModal(false);
                }}
                className="w-full p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center justify-between transition-colors"
              >
                <span>{t('cabinet.payCard')}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {showReceiptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl relative max-h-[90vh] overflow-y-auto animate-in fade-in duration-200">
            <button
              type="button"
              onClick={() => setShowReceiptModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label={t('cabinet.close')}
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-5 h-5 text-emerald-600" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t('cabinet.receiptTitle')}
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('cabinet.receiptDesc')}
            </p>

            {/* Receipt document mockup */}
            <div className="mt-4 p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 font-mono text-xs space-y-2">
              <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-2 font-bold text-slate-900 dark:text-white">
                <span>{profile?.tenant?.name || 'ЖК Шаңырақ'}</span>
                <span>№ {account?.accountNumber || '101-001'}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>{t('cabinet.addressApartment')}:</span>
                <span>{unitNumber ? t('cabinet.apartment', { number: unitNumber }) : '—'}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>{t('cabinet.payer')}:</span>
                <span>{profile?.firstName} {profile?.lastName}</span>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                <div className="font-bold text-slate-900 dark:text-white mb-1">
                  {t('cabinet.chargesByTariffs')}:
                </div>
                {account?.charges && account.charges.length > 0 ? (
                  account.charges.slice(0, 4).map((c) => (
                    <div key={c.id} className="flex justify-between py-0.5 text-slate-700 dark:text-slate-300">
                      <span>{c.tariffItem?.name || t('cabinet.serviceDefault')}</span>
                      <span>{formatMoney(c.amount)}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-400 py-1">{t('cabinet.noCurrentCharges')}</div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between font-bold text-sm text-slate-900 dark:text-white">
                <span>{t('cabinet.totalPayable')}</span>
                <span>{formatMoney(Math.abs(balance))}</span>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5 transition-colors"
              >
                <Printer className="w-4 h-4" />
                <span>{t('cabinet.printReceipt')}</span>
              </button>
              <button
                type="button"
                onClick={() => alert(t('cabinet.receiptPdfGenerated'))}
                className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 flex items-center justify-center gap-1.5 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>{t('cabinet.downloadPdf')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
