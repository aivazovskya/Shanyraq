'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  Receipt,
  Plus,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Loader2,
  X,
  Download,
  Search,
  Ban,
  TrendingDown,
  Layers,
  Info,
  UploadCloud,
  FileSpreadsheet,
  BarChart3,
} from 'lucide-react';
import { apiRequest, apiDownload, getStoredSession, getApiErrorMessage } from '@/lib/api';

interface ExpenseItem {
  id: string;
  tenantId: string;
  amount: number;
  category: string;
  description?: string | null;
  counterparty?: string | null;
  documentNumber?: string | null;
  source?: 'MANUAL' | 'IMPORT_EXCEL' | 'IMPORT_1C' | 'IMPORT_UK' | string;
  importBatchId?: string | null;
  importBatch?: {
    id: string;
    fileName: string;
    kind: string;
  } | null;
  periodMonth?: number | null;
  periodYear?: number | null;
  attachmentUrl?: string | null;
  expenseDate: string;
  recordedById: string;
  recordedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  };
  isVoided: boolean;
  voidedAt?: string | null;
  voidedById?: string | null;
  voidedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  } | null;
  voidedReason?: string | null;
  createdAt: string;
}

interface ExpenseGroup {
  key: string;
  title: string;
  items: ExpenseItem[];
  totalAmount: number;
  activeCount: number;
}

function ExpensesContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();

  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [tenantId, setTenantId] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('');

  // Filters - initialized synchronously from searchParams on first render
  const [filterFrom, setFilterFrom] = useState(() => searchParams.get('from') || '');
  const [filterTo, setFilterTo] = useState(() => searchParams.get('to') || '');
  const [filterCategory, setFilterCategory] = useState(() => searchParams.get('category') || '');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'VOIDED'>('ALL');
  const [filterSource, setFilterSource] = useState<'ALL' | 'MANUAL' | 'IMPORT_EXCEL' | 'IMPORT_1C' | 'IMPORT_UK'>('ALL');
  const [filterBatch, setFilterBatch] = useState<string>('');
  const [groupBy, setGroupBy] = useState<'NONE' | 'MONTH' | 'QUARTER'>('NONE');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [formAmount, setFormAmount] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formDesc, setFormDesc] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Void modal state
  const [voidTargetExpense, setVoidTargetExpense] = useState<ExpenseItem | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);

  // Export / Download state
  const [isExporting, setIsExporting] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);

  // Sync state on subsequent searchParams changes (e.g. client-side drill-down navigations)
  useEffect(() => {
    const qCat = searchParams.get('category');
    const qFrom = searchParams.get('from');
    const qTo = searchParams.get('to');
    if (qCat !== null || qFrom !== null || qTo !== null) {
      if (qCat !== null) setFilterCategory(qCat);
      if (qFrom !== null) setFilterFrom(qFrom);
      if (qTo !== null) setFilterTo(qTo);
    }
  }, [searchParams]);

  const canWrite = userRole === 'SUPERADMIN' || userRole === 'HOA_ADMIN';
  const canView = canWrite || userRole === 'HOA_CHAIRMAN';

  const loadExpenses = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const session = getStoredSession();
      if (!session || !session.user || !session.user.tenantId) {
        throw new Error(t('common.userNotAuthorizedOrLinked'));
      }
      setTenantId(session.user.tenantId);
      setUserRole(session.user.role || '');

      const params = new URLSearchParams();
      params.set('includeVoided', 'true');
      if (filterFrom) params.set('from', filterFrom);
      if (filterTo) params.set('to', filterTo);
      if (filterCategory.trim()) params.set('category', filterCategory.trim());

      const data = await apiRequest<ExpenseItem[]>(
        `/finance/tenants/${session.user.tenantId}/expenses?${params.toString()}`,
      );
      setExpenses(data);
    } catch (err: any) {
      setError(getApiErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  }, [filterFrom, filterTo, filterCategory, t]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  // Unique batches for filter dropdown
  const uniqueBatches = useMemo(() => {
    const map = new Map<string, string>();
    for (const exp of expenses) {
      if (exp.importBatchId) {
        const label = exp.importBatch?.fileName
          ? `${exp.importBatch.fileName} (${exp.importBatchId.slice(0, 8)})`
          : exp.importBatchId.slice(0, 8);
        map.set(exp.importBatchId, label);
      }
    }
    return Array.from(map.entries());
  }, [expenses]);

  // Client-side filtering (status, source, batch)
  const filteredExpenses = useMemo(() => {
    return expenses.filter((item) => {
      if (filterStatus === 'ACTIVE' && item.isVoided) return false;
      if (filterStatus === 'VOIDED' && !item.isVoided) return false;
      if (filterSource !== 'ALL') {
        const src = item.source || 'MANUAL';
        if (src !== filterSource) return false;
      }
      if (filterBatch && item.importBatchId !== filterBatch) return false;
      return true;
    });
  }, [expenses, filterStatus, filterSource, filterBatch]);

  // Client-side grouping (by Month or Quarter)
  const groupedExpenses = useMemo<ExpenseGroup[] | null>(() => {
    if (groupBy === 'NONE') return null;

    const groupsMap = new Map<string, ExpenseItem[]>();
    for (const item of filteredExpenses) {
      const d = new Date(item.expenseDate);
      let key = '';
      if (groupBy === 'MONTH') {
        const m = String(d.getMonth() + 1).padStart(2, '0');
        key = `${d.getFullYear()}-${m}`;
      } else {
        const q = Math.floor(d.getMonth() / 3) + 1;
        key = `${d.getFullYear()}-Q${q}`;
      }
      const list = groupsMap.get(key) || [];
      list.push(item);
      groupsMap.set(key, list);
    }

    const sortedKeys = Array.from(groupsMap.keys()).sort((a, b) => b.localeCompare(a));
    return sortedKeys.map((key) => {
      const items = groupsMap.get(key)!;
      let title = key;
      if (groupBy === 'MONTH') {
        const [y, m] = key.split('-');
        const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
        const monthName = date.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
        title = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      } else {
        const [y, q] = key.split('-');
        title = `${t('finance.expenses.quarterLabel', { defaultValue: 'Квартал' })} ${q.replace('Q', '')} ${y}`;
      }

      let totalAmount = 0;
      let activeCount = 0;
      for (const it of items) {
        if (!it.isVoided) {
          totalAmount += it.amount;
          activeCount++;
        }
      }

      return { key, title, items, totalAmount, activeCount };
    });
  }, [filteredExpenses, groupBy, t]);

  // Overall statistics
  const stats = useMemo(() => {
    let activeTotal = 0;
    let voidedCount = 0;
    let activeCount = 0;

    for (const exp of filteredExpenses) {
      if (exp.isVoided) {
        voidedCount++;
      } else {
        activeTotal += exp.amount;
        activeCount++;
      }
    }

    return {
      activeTotal,
      voidedCount,
      activeCount,
      totalCount: filteredExpenses.length,
    };
  }, [filteredExpenses]);

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) {
      setActionMessage({
        type: 'error',
        text: t('errors.FINANCE.INVALID_AMOUNT'),
      });
      return;
    }

    if (!formCategory.trim()) {
      setActionMessage({
        type: 'error',
        text: t('errors.FINANCE.INVALID_CATEGORY'),
      });
      return;
    }

    try {
      setIsCreating(true);
      await apiRequest(`/finance/tenants/${tenantId}/expenses`, {
        method: 'POST',
        body: JSON.stringify({
          amount: amt,
          category: formCategory.trim(),
          expenseDate: new Date(formDate).toISOString(),
          description: formDesc.trim() || undefined,
        }),
      });

      setActionMessage({
        type: 'success',
        text: t('finance.expenses.createSuccess', { amount: amt.toLocaleString() }),
      });
      setIsCreateModalOpen(false);
      setFormAmount('');
      setFormCategory('');
      setFormDesc('');
      setFormDate(new Date().toISOString().slice(0, 10));
      await loadExpenses();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: getApiErrorMessage(err, t),
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenVoidModal = (expense: ExpenseItem) => {
    setVoidTargetExpense(expense);
    setVoidReason('');
    setIsVoiding(false);
  };

  const handleConfirmVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidTargetExpense) return;

    if (!voidReason.trim()) {
      setActionMessage({
        type: 'error',
        text: t('errors.FINANCE.VOID_REASON_REQUIRED'),
      });
      return;
    }

    try {
      setIsVoiding(true);
      await apiRequest(`/finance/expenses/${voidTargetExpense.id}/void`, {
        method: 'PATCH',
        body: JSON.stringify({
          reason: voidReason.trim(),
        }),
      });

      setActionMessage({
        type: 'success',
        text: t('finance.expenses.voidSuccess'),
      });
      setVoidTargetExpense(null);
      setVoidReason('');
      await loadExpenses();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: getApiErrorMessage(err, t),
      });
    } finally {
      setIsVoiding(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      setIsExporting(true);
      const params = new URLSearchParams();
      if (filterFrom) params.set('from', filterFrom);
      if (filterTo) params.set('to', filterTo);
      if (filterCategory.trim()) params.set('category', filterCategory.trim());
      if (filterSource !== 'ALL') params.set('source', filterSource);
      if (filterBatch) params.set('importBatchId', filterBatch);

      const queryStr = params.toString() ? `?${params.toString()}` : '';
      await apiDownload(
        `/finance/tenants/${tenantId}/expenses/export${queryStr}`,
        `expenses_${new Date().toISOString().slice(0, 10)}.csv`,
      );
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: getApiErrorMessage(err, t),
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      setIsDownloadingTemplate(true);
      await apiDownload(
        '/imports/templates/expenses.xlsx',
        'expenses_template.xlsx',
      );
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: getApiErrorMessage(err, t),
      });
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const handleResetFilters = () => {
    setFilterFrom('');
    setFilterTo('');
    setFilterCategory('');
    setFilterStatus('ALL');
    setFilterSource('ALL');
    setFilterBatch('');
    setGroupBy('NONE');
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  const renderSourceBadge = (item: ExpenseItem) => {
    const src = item.source || 'MANUAL';
    if (src === 'IMPORT_EXCEL') {
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"
          title={item.importBatchId ? `${t('finance.expenses.importBatchBadge', { defaultValue: 'Партия' })}: ${item.importBatchId}` : undefined}
        >
          <FileSpreadsheet className="w-3 h-3 shrink-0" />
          <span className="truncate max-w-[110px]">{t('finance.expenses.sourceImportExcel')}</span>
        </span>
      );
    }
    if (src === 'IMPORT_1C') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
          {t('finance.expenses.sourceImport1C')}
        </span>
      );
    }
    if (src === 'IMPORT_UK') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
          {t('finance.expenses.sourceImportUK')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
        {t('finance.expenses.sourceManual')}
      </span>
    );
  };

  const renderTableRows = (items: ExpenseItem[]) => {
    return items.map((expense) => {
      const dateObj = new Date(expense.expenseDate);
      const formattedDate = dateObj.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });

      return (
        <tr
          key={expense.id}
          className={`hover:bg-slate-50/50 transition-colors ${
            expense.isVoided ? 'bg-slate-50/40 text-slate-400' : ''
          }`}
        >
          <td className="py-3.5 px-4 font-medium whitespace-nowrap">
            <span className={expense.isVoided ? 'line-through text-slate-400' : 'text-slate-800'}>
              {formattedDate}
            </span>
          </td>

          <td className="py-3.5 px-4">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                expense.isVoided
                  ? 'bg-slate-100 text-slate-500 line-through'
                  : 'bg-rose-50 text-rose-700 border border-rose-100'
              }`}
            >
              {expense.category}
            </span>
          </td>

          <td className="py-3.5 px-4 font-semibold whitespace-nowrap">
            <span className={expense.isVoided ? 'line-through text-slate-400' : 'text-slate-900'}>
              {expense.amount.toLocaleString()} ₸
            </span>
          </td>

          <td className="py-3.5 px-4 max-w-[140px] truncate text-slate-700 text-xs" title={expense.counterparty || ''}>
            {expense.counterparty || '—'}
          </td>

          <td className="py-3.5 px-4 whitespace-nowrap text-slate-600 text-xs font-mono">
            {expense.documentNumber || '—'}
          </td>

          <td className="py-3.5 px-4 whitespace-nowrap">
            {renderSourceBadge(expense)}
          </td>

          <td className="py-3.5 px-4 max-w-[200px] truncate">
            <span className={expense.isVoided ? 'text-slate-400' : 'text-slate-600'}>
              {expense.description || '—'}
            </span>
          </td>

          <td className="py-3.5 px-4 whitespace-nowrap text-slate-600 text-xs">
            {expense.recordedBy ? (
              <span>
                {expense.recordedBy.firstName} {expense.recordedBy.lastName}
              </span>
            ) : (
              '—'
            )}
          </td>

          <td className="py-3.5 px-4 whitespace-nowrap">
            {expense.isVoided ? (
              <div className="flex flex-col gap-0.5">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full w-fit">
                  <Ban className="w-3 h-3" />
                  {t('finance.expenses.statusVoidedBadge')}
                </span>
                {expense.voidedReason && (
                  <span
                    className="text-[11px] text-slate-500 max-w-[160px] truncate"
                    title={expense.voidedReason}
                  >
                    {expense.voidedReason}
                  </span>
                )}
              </div>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3" />
                {t('finance.expenses.statusActiveBadge')}
              </span>
            )}
          </td>

          {canWrite && (
            <td className="py-3.5 px-4 text-right whitespace-nowrap">
              {!expense.isVoided ? (
                <button
                  onClick={() => handleOpenVoidModal(expense)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>{t('finance.expenses.voidBtn')}</span>
                </button>
              ) : (
                <span className="text-xs text-slate-400">—</span>
              )}
            </td>
          )}
        </tr>
      );
    });
  };

  const renderTableHeader = () => (
    <thead>
      <tr className="border-b border-slate-100 bg-slate-50/75 text-xs font-semibold text-slate-500 uppercase tracking-wider">
        <th className="py-3.5 px-4">{t('finance.expenses.thDate')}</th>
        <th className="py-3.5 px-4">{t('finance.expenses.thCategory')}</th>
        <th className="py-3.5 px-4">{t('finance.expenses.thAmount')}</th>
        <th className="py-3.5 px-4">{t('finance.expenses.thCounterparty', { defaultValue: 'Контрагент' })}</th>
        <th className="py-3.5 px-4">{t('finance.expenses.thDocNumber', { defaultValue: 'Документ' })}</th>
        <th className="py-3.5 px-4">{t('finance.expenses.thSource', { defaultValue: 'Источник' })}</th>
        <th className="py-3.5 px-4">{t('finance.expenses.thDescription')}</th>
        <th className="py-3.5 px-4">{t('finance.expenses.thRecordedBy')}</th>
        <th className="py-3.5 px-4">{t('finance.expenses.thStatus')}</th>
        {canWrite && <th className="py-3.5 px-4 text-right">{t('common.actions')}</th>}
      </tr>
    </thead>
  );

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <Link
            href="/dashboard/finance"
            className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t('finance.expenses.backToFinance')}</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 shadow-sm">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                {t('finance.expenses.title')}
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {t('finance.expenses.subtitle')}
              </p>
            </div>
          </div>
        </div>

        {canView && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Link to Imports */}
            <Link
              href="/dashboard/finance/imports"
              className="flex items-center gap-2 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm font-medium rounded-xl border border-indigo-200 shadow-sm transition-all"
            >
              <UploadCloud className="w-4 h-4 text-indigo-600" />
              <span>{t('finance.expenses.importsBtn', { defaultValue: 'Импорт расходов' })}</span>
            </Link>

                        {/* Link to Budget */}
            <Link
              href="/dashboard/finance/budget"
              className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-xl border border-slate-200 shadow-sm transition-all"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>{t('finance.budgetBtn')}</span>
            </Link>

            {/* Link to Audit */}
            <Link
              href="/dashboard/finance/audit"
              className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-xl border border-slate-200 shadow-sm transition-all"
            >
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              <span>{t('finance.auditBtn')}</span>
            </Link>

            {/* Template Download */}
            <button
              onClick={handleDownloadTemplate}
              disabled={isDownloadingTemplate}
              className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-xl border border-slate-200 shadow-sm transition-all disabled:opacity-50"
              title={t('finance.imports.downloadTemplateBtn', { defaultValue: 'Скачать шаблон Excel' })}
            >
              {isDownloadingTemplate ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
              ) : (
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              )}
              <span className="hidden sm:inline">
                {isDownloadingTemplate ? t('common.loading') : t('finance.imports.downloadTemplateBtn', { defaultValue: 'Шаблон Excel' })}
              </span>
            </button>

            {/* Export CSV */}
            <button
              onClick={handleExportCsv}
              disabled={isExporting || loading || filteredExpenses.length === 0}
              className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-xl border border-slate-200 shadow-sm transition-all disabled:opacity-50"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
              ) : (
                <Download className="w-4 h-4 text-slate-500" />
              )}
              <span>{isExporting ? t('finance.expenses.exporting') : t('finance.expenses.exportCsvBtn')}</span>
            </button>

            {/* New Expense Button */}
            {canWrite && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>{t('finance.expenses.newExpenseBtn')}</span>
              </button>
            )}

            <button
              onClick={loadExpenses}
              disabled={loading}
              className="p-2 text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-all disabled:opacity-50"
              title={t('common.refresh', { defaultValue: 'Обновить' })}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        )}
      </div>

      {/* Action Messages */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between animate-in fade-in duration-200 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span className="text-sm font-medium">{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="p-1 hover:bg-black/5 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Access Guard */}
      {!loading && !canView && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
          <AlertCircle className="w-10 h-10 text-amber-600 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-amber-900">
            {t('errors.FINANCE.VIEW_EXPENSE_FORBIDDEN')}
          </h2>
          <p className="text-sm text-amber-700 mt-1 max-w-md mx-auto">
            {t('common.accessDenied')}
          </p>
        </div>
      )}

      {canView && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  {t('finance.expenses.activeExpenses')}
                </p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">
                  {stats.activeTotal.toLocaleString()} ₸
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {stats.activeCount} {t('common.records')}
                </p>
              </div>
              <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
                <TrendingDown className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  {t('finance.expenses.voidedExpenses')}
                </p>
                <h3 className="text-2xl font-bold text-slate-600 mt-1">
                  {stats.voidedCount}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {t('finance.expenses.statusVoided')}
                </p>
              </div>
              <div className="p-3 bg-slate-50 text-slate-500 rounded-xl">
                <Ban className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  {t('finance.expenses.totalExpenses')}
                </p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">
                  {stats.totalCount}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {t('finance.expenses.statusAll')}
                </p>
              </div>
              <div className="p-3 bg-sky-50 text-sky-600 rounded-xl">
                <Layers className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  {t('finance.expenses.filterFrom')}
                </label>
                <input
                  type="date"
                  value={filterFrom}
                  onChange={(e) => setFilterFrom(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  {t('finance.expenses.filterTo')}
                </label>
                <input
                  type="date"
                  value={filterTo}
                  onChange={(e) => setFilterTo(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  {t('finance.expenses.filterCategory')}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    placeholder={t('finance.expenses.filterCategoryPlaceholder')}
                    className="w-full pl-8 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  {t('finance.expenses.filterStatus')}
                </label>
                <select
                  value={filterStatus}
                  onChange={(e: any) => setFilterStatus(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
                >
                  <option value="ALL">{t('finance.expenses.statusAll')}</option>
                  <option value="ACTIVE">{t('finance.expenses.statusActive')}</option>
                  <option value="VOIDED">{t('finance.expenses.statusVoided')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  {t('finance.expenses.filterSource', { defaultValue: 'Источник' })}
                </label>
                <select
                  value={filterSource}
                  onChange={(e: any) => setFilterSource(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
                >
                  <option value="ALL">{t('finance.expenses.sourceAll')}</option>
                  <option value="MANUAL">{t('finance.expenses.sourceManual')}</option>
                  <option value="IMPORT_EXCEL">{t('finance.expenses.sourceImportExcel')}</option>
                  <option value="IMPORT_1C">{t('finance.expenses.sourceImport1C')}</option>
                  <option value="IMPORT_UK">{t('finance.expenses.sourceImportUK')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  {t('finance.expenses.filterBatch', { defaultValue: 'Партия импорта' })}
                </label>
                <select
                  value={filterBatch}
                  onChange={(e) => setFilterBatch(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
                >
                  <option value="">{t('finance.expenses.batchAll', { defaultValue: 'Все партии' })}</option>
                  {uniqueBatches.map(([batchId, label]) => (
                    <option key={batchId} value={batchId}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  {t('finance.expenses.groupBy', { defaultValue: 'Группировка' })}
                </label>
                <select
                  value={groupBy}
                  onChange={(e: any) => setGroupBy(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all font-medium text-slate-700"
                >
                  <option value="NONE">{t('finance.expenses.groupByNone', { defaultValue: 'Без группировки' })}</option>
                  <option value="MONTH">{t('finance.expenses.groupByMonth', { defaultValue: 'По месяцам' })}</option>
                  <option value="QUARTER">{t('finance.expenses.groupByQuarter', { defaultValue: 'По кварталам' })}</option>
                </select>
              </div>
            </div>

            {(filterFrom || filterTo || filterCategory || filterStatus !== 'ALL' || filterSource !== 'ALL' || filterBatch || groupBy !== 'NONE') && (
              <div className="flex justify-end pt-1">
                <button
                  onClick={handleResetFilters}
                  className="text-xs text-rose-600 hover:text-rose-700 font-medium transition-colors"
                >
                  {t('finance.expenses.resetFilters')}
                </button>
              </div>
            )}
          </div>

          {/* Table / List */}
          <div className="space-y-4">
            {loading ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm py-20 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-rose-600 mx-auto mb-3" />
                <p className="text-sm text-slate-500">{t('common.loading')}</p>
              </div>
            ) : filteredExpenses.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm py-16 text-center px-4">
                <Receipt className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-slate-800">
                  {t('finance.expenses.emptyExpensesTitle')}
                </h3>
                <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
                  {t('finance.expenses.emptyExpensesSub')}
                </p>
                {canWrite && (
                  <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium rounded-xl shadow-sm transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{t('finance.expenses.newExpenseBtn')}</span>
                  </button>
                )}
              </div>
            ) : groupedExpenses ? (
              // Grouped mode (By Month or By Quarter)
              <div className="space-y-6">
                {groupedExpenses.map((group) => (
                  <div
                    key={group.key}
                    className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden"
                  >
                    <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="p-1.5 bg-rose-100/60 text-rose-700 rounded-lg">
                          <Layers className="w-4 h-4" />
                        </span>
                        <h3 className="font-bold text-slate-900 text-base">
                          {group.title}
                        </h3>
                        <span className="text-xs text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full">
                          {group.items.length} {t('common.records')}
                        </span>
                      </div>
                      <div className="text-sm">
                        <span className="text-slate-500 mr-2">
                          {t('finance.expenses.totalForPeriod', { defaultValue: 'Итого за период' })}:
                        </span>
                        <span className="font-bold text-slate-900 text-base">
                          {group.totalAmount.toLocaleString()} ₸
                        </span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        {renderTableHeader()}
                        <tbody className="divide-y divide-slate-100 text-sm">
                          {renderTableRows(group.items)}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // Flat mode (No grouping)
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    {renderTableHeader()}
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {renderTableRows(filteredExpenses)}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Create Expense Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-lg w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-rose-600" />
                <h3 className="font-semibold text-slate-900">
                  {t('finance.expenses.createModalTitle')}
                </h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                disabled={isCreating}
                className="p-1 hover:bg-slate-200/50 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateExpense} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  {t('finance.expenses.categoryLabel')} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  placeholder={t('finance.expenses.categoryPlaceholder')}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    {t('finance.expenses.amountLabel')} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    placeholder="50000"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    {t('finance.expenses.dateLabel')} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  {t('finance.expenses.descLabel')}
                </label>
                <textarea
                  rows={3}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder={t('finance.expenses.descPlaceholder')}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={isCreating}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl transition-all"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-all disabled:opacity-50"
                >
                  {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{isCreating ? t('finance.expenses.saving') : t('finance.expenses.saveBtn')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Void Expense Modal */}
      {voidTargetExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-red-50/50">
              <div className="flex items-center gap-2">
                <Ban className="w-5 h-5 text-red-600" />
                <h3 className="font-semibold text-slate-900">
                  {t('finance.expenses.voidModalTitle')}
                </h3>
              </div>
              <button
                onClick={() => setVoidTargetExpense(null)}
                disabled={isVoiding}
                className="p-1 hover:bg-slate-200/50 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmVoid} className="p-6 space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex gap-2.5">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{t('finance.expenses.voidModalDesc')}</span>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">{t('finance.expenses.thCategory')}:</span>
                  <span className="font-medium text-slate-800">{voidTargetExpense.category}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t('finance.expenses.thAmount')}:</span>
                  <span className="font-bold text-slate-900">{voidTargetExpense.amount.toLocaleString()} ₸</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  {t('finance.expenses.voidReasonLabel')} <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder={t('finance.expenses.voidReasonPlaceholder')}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setVoidTargetExpense(null)}
                  disabled={isVoiding}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl transition-all"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isVoiding || !voidReason.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-all disabled:opacity-50"
                >
                  {isVoiding && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{isVoiding ? t('finance.expenses.voiding') : t('finance.expenses.confirmVoidBtn')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HoaExpensesPage() {
  return (
    <Suspense
      fallback={
        <div className="p-16 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-rose-600" />
        </div>
      }
    >
      <ExpensesContent />
    </Suspense>
  );
}
