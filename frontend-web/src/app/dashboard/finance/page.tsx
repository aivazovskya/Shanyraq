'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  CreditCard,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Loader2,
  X,
  Building,
  Home,
  SlidersHorizontal,
  Calendar,
  Coins,
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  FileText,
  Download,
} from 'lucide-react';
import { apiRequest, apiDownload, getStoredSession } from '@/lib/api';

interface TariffItem {
  id: string;
  name: string;
  calculationMethod: 'FLAT' | 'PER_AREA';
  rate: number;
  isActive: boolean;
}

interface ChargeItem {
  id: string;
  periodMonth: number;
  periodYear: number;
  amount: number;
  createdAt: string;
  tariffItem: TariffItem;
}

interface PaymentItem {
  id: string;
  amount: number;
  method: string;
  note: string | null;
  paidAt: string;
  recordedBy: {
    firstName: string;
    lastName: string;
  };
}

interface AccountItem {
  id: string;
  accountNumber: string;
  balance: number;
  unit: {
    id: string;
    unitNumber: string;
    area: number;
    floor: number;
    entrance: number;
    building: {
      id: string;
      blockName: string;
    };
    ownerships?: Array<{
      id: string;
      isVerified: boolean;
      user: {
        id: string;
        firstName: string;
        lastName: string;
        phone: string;
      };
    }>;
  };
}

interface AccountDetail extends AccountItem {
  charges: ChargeItem[];
  payments: PaymentItem[];
}

function SearchParamsReader({ onQuery }: { onQuery: (q: string) => void }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      onQuery(q);
    }
  }, [searchParams, onQuery]);
  return null;
}

export default function FinancePage() {
  const { t, i18n } = useTranslation();
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [tenantName, setTenantName] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('');
  const [tenantId, setTenantId] = useState<string>('');

  // Modals state
  const [selectedAccount, setSelectedAccount] = useState<AccountDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [downloadingStatement, setDownloadingStatement] = useState<'pdf' | 'csv' | null>(null);

  // Generate charges modal
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [generateMonth, setGenerateMonth] = useState<number>(new Date().getMonth() + 1);
  const [generateYear, setGenerateYear] = useState<number>(new Date().getFullYear());
  const [isGenerating, setIsGenerating] = useState(false);

  // Record payment modal
  const [paymentTargetAccount, setPaymentTargetAccount] = useState<AccountItem | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentNote, setPaymentNote] = useState<string>('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  const canWrite = userRole === 'SUPERADMIN' || userRole === 'HOA_ADMIN';

  const loadAccounts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const session = getStoredSession();
      if (!session || !session.user || !session.user.tenantId) {
        throw new Error(t('common.userNotAuthorizedOrLinked'));
      }
      setTenantId(session.user.tenantId);
      setUserRole(session.user.role || '');
      if (session.user.tenantName) {
        setTenantName(session.user.tenantName);
      }

      const data = await apiRequest<AccountItem[]>(
        `/finance/tenants/${session.user.tenantId}/accounts`,
      );
      setAccounts(data);
    } catch (err: any) {
      setError(err.message || t('finance.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const openAccountDetail = async (account: AccountItem) => {
    try {
      setLoadingDetail(true);
      const detail = await apiRequest<AccountDetail>(`/finance/accounts/${account.id}`);
      setSelectedAccount(detail);
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || t('finance.loadError'),
      });
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleDownloadStatement = async (format: 'pdf' | 'csv') => {
    if (!selectedAccount) return;
    try {
      setDownloadingStatement(format);
      const ext = format === 'pdf' ? 'pdf' : 'csv';
      const endpoint =
        format === 'pdf'
          ? `/finance/accounts/${selectedAccount.id}/statement`
          : `/finance/accounts/${selectedAccount.id}/statement/export`;
      await apiDownload(
        endpoint,
        `statement_${selectedAccount.accountNumber}_all.${ext}`,
      );
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err?.message || t('common.error'),
      });
    } finally {
      setDownloadingStatement(null);
    }
  };

  const handleGenerateCharges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;

    try {
      setIsGenerating(true);
      const res = await apiRequest<{ createdCount: number; skippedCount: number }>(
        `/finance/tenants/${tenantId}/generate-charges`,
        {
          method: 'POST',
          body: JSON.stringify({
            month: Number(generateMonth),
            year: Number(generateYear),
          }),
        },
      );

      setActionMessage({
        type: 'success',
        text: t('finance.generateSuccess', {
          created: res.createdCount,
          skipped: res.skippedCount,
        }),
      });

      setIsGenerateModalOpen(false);
      await loadAccounts();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || t('common.error'),
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentTargetAccount) return;

    const parsedAmount = parseFloat(paymentAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return;
    }

    try {
      setIsSubmittingPayment(true);
      const res = await apiRequest<{ payment: PaymentItem; balance: number }>(
        `/finance/accounts/${paymentTargetAccount.id}/payments`,
        {
          method: 'POST',
          body: JSON.stringify({
            amount: parsedAmount,
            note: paymentNote.trim() || undefined,
          }),
        },
      );

      setActionMessage({
        type: 'success',
        text: t('finance.paymentSuccess', {
          amount: parsedAmount.toLocaleString(),
          balance: res.balance.toLocaleString(),
        }),
      });

      setPaymentTargetAccount(null);
      setPaymentAmount('');
      setPaymentNote('');
      await loadAccounts();

      if (selectedAccount && selectedAccount.id === paymentTargetAccount.id) {
        await openAccountDetail(paymentTargetAccount);
      }
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || t('common.error'),
      });
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const filteredAccounts = accounts.filter((acc) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const unitNum = acc.unit.unitNumber.toLowerCase();
    const block = acc.unit.building.blockName.toLowerCase();
    const accountNum = acc.accountNumber.toLowerCase();
    const ownerName = acc.unit.ownerships?.[0]?.user
      ? `${acc.unit.ownerships[0].user.firstName} ${acc.unit.ownerships[0].user.lastName}`.toLowerCase()
      : '';
    return (
      unitNum.includes(q) ||
      block.includes(q) ||
      accountNum.includes(q) ||
      ownerName.includes(q)
    );
  });

  const inDebtCount = accounts.filter((a) => a.balance < 0).length;
  const inCreditCount = accounts.filter((a) => a.balance > 0).length;
  const totalDebtSum = accounts
    .filter((a) => a.balance < 0)
    .reduce((sum, a) => sum + Math.abs(a.balance), 0);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <Suspense fallback={null}>
        <SearchParamsReader onQuery={setSearchQuery} />
      </Suspense>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 shadow-sm">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                {t('finance.title')}
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">{t('finance.subtitle')}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {canWrite && (
            <>
              <Link
                href="/dashboard/finance/tariffs"
                className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-xl border border-slate-200 shadow-sm transition-all"
              >
                <SlidersHorizontal className="w-4 h-4 text-slate-500" />
                <span>{t('finance.tariffsBtn')}</span>
              </Link>

              <button
                onClick={() => setIsGenerateModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-all"
              >
                <Calendar className="w-4 h-4" />
                <span>{t('finance.generateChargesBtn')}</span>
              </button>
            </>
          )}

          <button
            onClick={loadAccounts}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t('finance.totalAccounts')}
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{accounts.length}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center">
            <Building className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t('finance.accountsInDebt')}
            </p>
            <p className="text-2xl font-bold text-rose-600 mt-1">{inDebtCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <ArrowDownLeft className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t('finance.accountsInCredit')}
            </p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{inCreditCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <ArrowUpRight className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t('finance.totalDebt')}
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {totalDebtSum.toLocaleString()} ₸
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Coins className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Action Notification */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between gap-3 text-sm font-medium transition-all ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border border-emerald-200 shadow-sm'
              : 'bg-rose-50 text-rose-900 border border-rose-200 shadow-sm'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Container Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {/* Filters Toolbar */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={t('finance.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
            />
          </div>
          <div className="text-xs font-semibold text-slate-500">
            {t('finance.recordsFound', { count: filteredAccounts.length })}
          </div>
        </div>

        {/* Content Table */}
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
            <p className="text-sm font-medium">{t('common.loading')}</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-1">{t('common.error')}</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto mb-4">{error}</p>
            <button
              onClick={loadAccounts}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-xl shadow-sm transition-all"
            >
              {t('common.refresh')}
            </button>
          </div>
        ) : filteredAccounts.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <CreditCard className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-1">
              {t('finance.emptyAccountsTitle')}
            </h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">
              {t('finance.emptyAccountsSub')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-6">{t('finance.thUnit')}</th>
                  <th className="py-3.5 px-4">{t('finance.thAccount')}</th>
                  <th className="py-3.5 px-4">{t('finance.thOwner')}</th>
                  <th className="py-3.5 px-4">{t('finance.thBalance')}</th>
                  <th className="py-3.5 px-6 text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredAccounts.map((account) => {
                  const owner = account.unit.ownerships?.[0]?.user;
                  const isDebt = account.balance < 0;
                  const isCredit = account.balance > 0;

                  return (
                    <tr
                      key={account.id}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      onClick={() => openAccountDetail(account)}
                    >
                      {/* Unit & Block */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2 font-semibold text-slate-900 group-hover:text-sky-600 transition-colors">
                          <Home className="w-4 h-4 text-sky-600" />
                          <span>
                            {t('common.unitShort')} {account.unit.unitNumber}
                          </span>
                          <span className="text-xs font-normal text-slate-400">
                            ({account.unit.building.blockName})
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {account.unit.area} {t('common.sqm')}
                        </div>
                      </td>

                      {/* Account Number */}
                      <td className="py-4 px-4 font-mono text-xs text-slate-700">
                        {account.accountNumber}
                      </td>

                      {/* Owner */}
                      <td className="py-4 px-4">
                        {owner ? (
                          <div>
                            <div className="font-medium text-slate-800">
                              {owner.firstName} {owner.lastName}
                            </div>
                            <div className="text-xs text-slate-400 font-mono">{owner.phone}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">
                            {t('finance.noOwner')}
                          </span>
                        )}
                      </td>

                      {/* Balance Badge */}
                      <td className="py-4 px-4">
                        {isDebt ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200/70">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            {t('finance.balanceDebt', {
                              amount: Math.abs(account.balance).toLocaleString(),
                            })}
                          </span>
                        ) : isCredit ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            {t('finance.balanceCredit', {
                              amount: account.balance.toLocaleString(),
                            })}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                            {t('finance.balanceZero')}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td
                        className="py-4 px-6 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openAccountDetail(account)}
                            className="px-3 py-1.5 text-xs font-semibold text-sky-600 hover:text-sky-700 hover:bg-sky-50 rounded-lg border border-transparent hover:border-sky-200 transition-all"
                          >
                            {t('finance.detailsBtn')}
                          </button>

                          {canWrite && (
                            <button
                              onClick={() => {
                                setPaymentTargetAccount(account);
                                setPaymentAmount('');
                                setPaymentNote('');
                              }}
                              className="px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 border border-emerald-200 rounded-lg transition-all"
                            >
                              {t('finance.recordPaymentBtn')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ACCOUNT DETAIL MODAL / DRAWER */}
      {selectedAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-sky-600 text-white flex items-center justify-center font-bold text-base shadow-sm">
                  <CreditCard className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {t('finance.modalAccountTitle', {
                      accountNumber: selectedAccount.accountNumber,
                    })}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t('common.unitShort')} {selectedAccount.unit.unitNumber} (
                    {selectedAccount.unit.building.blockName}), {selectedAccount.unit.area}{' '}
                    {t('common.sqm')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase">
                    {t('finance.thBalance')}
                  </div>
                  <div
                    className={`text-base font-bold ${
                      selectedAccount.balance < 0
                        ? 'text-rose-600'
                        : selectedAccount.balance > 0
                        ? 'text-emerald-600'
                        : 'text-slate-700'
                    }`}
                  >
                    {selectedAccount.balance < 0
                      ? t('finance.balanceDebt', {
                          amount: Math.abs(selectedAccount.balance).toLocaleString(),
                        })
                      : selectedAccount.balance > 0
                      ? t('finance.balanceCredit', {
                          amount: selectedAccount.balance.toLocaleString(),
                        })
                      : t('finance.balanceZero')}
                  </div>
                </div>

                <button
                  onClick={() => setSelectedAccount(null)}
                  className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 border border-slate-200 transition-colors ml-2"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* History of Charges */}
              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-sky-600" />
                  <span>{t('finance.chargesHistory')}</span>
                  <span className="text-xs font-normal text-slate-400">
                    ({selectedAccount.charges?.length || 0})
                  </span>
                </h4>

                {!selectedAccount.charges || selectedAccount.charges.length === 0 ? (
                  <p className="text-xs text-slate-400 italic p-4 bg-slate-50 rounded-xl text-center">
                    {t('finance.noCharges')}
                  </p>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-[11px] font-semibold text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-4">{t('finance.thTariff')}</th>
                          <th className="py-2.5 px-4">{t('finance.thPeriod')}</th>
                          <th className="py-2.5 px-4">{t('finance.thDate')}</th>
                          <th className="py-2.5 px-4 text-right">{t('finance.thAmount')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedAccount.charges.map((charge) => (
                          <tr key={charge.id} className="hover:bg-slate-50/60">
                            <td className="py-2.5 px-4 font-medium text-slate-800">
                              {charge.tariffItem?.name || '—'}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-slate-600">
                              {String(charge.periodMonth).padStart(2, '0')}.{charge.periodYear}
                            </td>
                            <td className="py-2.5 px-4 text-slate-500">
                              {new Date(charge.createdAt).toLocaleDateString(
                                i18n.language === 'kk'
                                  ? 'kk-KZ'
                                  : i18n.language === 'en'
                                  ? 'en-US'
                                  : 'ru-RU',
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-right font-bold text-slate-900">
                              {charge.amount.toLocaleString()} ₸
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* History of Payments */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Coins className="w-4 h-4 text-emerald-600" />
                    <span>{t('finance.paymentsHistory')}</span>
                    <span className="text-xs font-normal text-slate-400">
                      ({selectedAccount.payments?.length || 0})
                    </span>
                  </h4>

                  {canWrite && (
                    <button
                      onClick={() => {
                        setPaymentTargetAccount(selectedAccount);
                        setPaymentAmount('');
                        setPaymentNote('');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{t('finance.recordPaymentBtn')}</span>
                    </button>
                  )}
                </div>

                {!selectedAccount.payments || selectedAccount.payments.length === 0 ? (
                  <p className="text-xs text-slate-400 italic p-4 bg-slate-50 rounded-xl text-center">
                    {t('finance.noPayments')}
                  </p>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-[11px] font-semibold text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-4">{t('finance.thDate')}</th>
                          <th className="py-2.5 px-4">{t('finance.thRecordedBy')}</th>
                          <th className="py-2.5 px-4">{t('finance.thNote')}</th>
                          <th className="py-2.5 px-4 text-right">{t('finance.thAmount')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedAccount.payments.map((payment) => (
                          <tr key={payment.id} className="hover:bg-slate-50/60">
                            <td className="py-2.5 px-4 text-slate-600">
                              {new Date(payment.paidAt).toLocaleDateString(
                                i18n.language === 'kk'
                                  ? 'kk-KZ'
                                  : i18n.language === 'en'
                                  ? 'en-US'
                                  : 'ru-RU',
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-slate-600">
                              {payment.recordedBy
                                ? `${payment.recordedBy.firstName} ${payment.recordedBy.lastName}`
                                : '—'}
                            </td>
                            <td className="py-2.5 px-4 text-slate-500 italic">
                              {payment.note || '—'}
                            </td>
                            <td className="py-2.5 px-4 text-right font-bold text-emerald-700">
                              +{payment.amount.toLocaleString()} ₸
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 px-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadStatement('pdf')}
                  disabled={!!downloadingStatement}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition-colors shadow-sm disabled:opacity-50"
                >
                  {downloadingStatement === 'pdf' ? (
                    <Loader2 className="w-3.5 h-3.5 text-rose-600 animate-spin" />
                  ) : (
                    <FileText className="w-3.5 h-3.5 text-rose-600" />
                  )}
                  <span>{t('finance.downloadPdf')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadStatement('csv')}
                  disabled={!!downloadingStatement}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition-colors shadow-sm disabled:opacity-50"
                >
                  {downloadingStatement === 'csv' ? (
                    <Loader2 className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5 text-emerald-600" />
                  )}
                  <span>{t('finance.downloadCsv')}</span>
                </button>
              </div>
              <button
                onClick={() => setSelectedAccount(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
              >
                {t('finance.closeBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GENERATE CHARGES MODAL */}
      {isGenerateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-900">
                {t('finance.generateModalTitle')}
              </h3>
              <p className="text-xs text-slate-500 mt-1">{t('finance.generateModalDesc')}</p>
            </div>

            <form onSubmit={handleGenerateCharges} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    {t('finance.monthLabel')}
                  </label>
                  <select
                    value={generateMonth}
                    onChange={(e) => setGenerateMonth(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        {new Date(2026, m - 1, 1).toLocaleString(
                          i18n.language === 'kk'
                            ? 'kk-KZ'
                            : i18n.language === 'en'
                            ? 'en-US'
                            : 'ru-RU',
                          { month: 'long' },
                        )}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    {t('finance.yearLabel')}
                  </label>
                  <select
                    value={generateYear}
                    onChange={(e) => setGenerateYear(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {[2025, 2026, 2027].map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsGenerateModalOpen(false)}
                  disabled={isGenerating}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  {t('finance.cancelBtn')}
                </button>
                <button
                  type="submit"
                  disabled={isGenerating}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {isGenerating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{t('finance.confirmGenerateBtn')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECORD PAYMENT MODAL */}
      {paymentTargetAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-900">
                {t('finance.paymentModalTitle', {
                  accountNumber: paymentTargetAccount.accountNumber,
                })}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {t('common.unitShort')} {paymentTargetAccount.unit.unitNumber} (
                {paymentTargetAccount.unit.building.blockName})
              </p>
            </div>

            <form onSubmit={handleRecordPayment} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  {t('finance.paymentAmountLabel')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  placeholder="5000"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  {t('finance.paymentNoteLabel')}
                </label>
                <input
                  type="text"
                  placeholder="Касса ОСИ, наличные"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPaymentTargetAccount(null)}
                  disabled={isSubmittingPayment}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  {t('finance.cancelBtn')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPayment}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {isSubmittingPayment && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{t('finance.confirmPaymentBtn')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
