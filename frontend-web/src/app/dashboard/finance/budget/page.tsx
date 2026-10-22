'use client';

import React, { useState, useEffect, useCallback, useId } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  FileSpreadsheet,
  ArrowLeft,
  ArrowRight,
  Download,
  Upload,
  Plus,
  Trash2,
  Save,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  History,
  RotateCcw,
} from 'lucide-react';
import { apiRequest, apiDownload, getStoredSession, getApiErrorMessage } from '@/lib/api';
import { parseBudgetResponse, BudgetApiResponse, BudgetLineItem } from '@/lib/budget-parser';

interface ParsedBudgetMonthItem {
  month: number;
  plannedAmount: number;
  amountRaw: string;
  willUpdate: boolean;
  isValid: boolean;
  errors: string[];
}

interface ParsedBudgetCategoryRow {
  rowIndex: number;
  category: string;
  categoryRaw: string;
  year: number;
  months: ParsedBudgetMonthItem[];
  rowTotal: number;
  isValid: boolean;
  errors: string[];
  willUpdateCount: number;
  newCount: number;
}

interface BudgetImportPreviewResult {
  batchId: string;
  tenantId: string;
  year: number;
  fileName: string;
  kind: string;
  rowsTotal: number;
  validCount: number;
  willUpdateCount: number;
  newCount: number;
  errorCount: number;
  categoriesCount: number;
  rows: ParsedBudgetCategoryRow[];
}

interface ImportBatchItem {
  id: string;
  tenantId: string;
  kind: string;
  fileName: string;
  status: 'PREVIEW' | 'APPLIED' | 'VOIDED';
  rowsTotal: number;
  rowsApplied: number;
  createdAt: string;
  voidedAt?: string | null;
  voidedReason?: string | null;
}

const STANDARD_CATEGORIES = [
  'Текущий ремонт',
  'Лифтовое хозяйство',
  'Уборка и клининг',
  'Вывоз ТБО',
  'Охрана и СКУД',
  'Электроэнергия ОДН',
  'Водоснабжение и отопление ОДН',
  'Аварийная служба',
  'Банковские услуги и комиссия',
  'Фонд оплаты труда (ФОТ)',
  'Юридические и бухгалтерские услуги',
  'Благоустройство и озеленение',
  'Прочие расходы',
];

export default function BudgetPage() {
  const { t } = useTranslation();
  const fileInputId = useId();

  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [tenantId, setTenantId] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState<boolean>(false);

  // Categories list and values map: key is `${category}__${month}`
  const [categories, setCategories] = useState<string[]>([]);
  const [cellValues, setCellValues] = useState<Record<string, number>>({});
  const [initialValues, setInitialValues] = useState<Record<string, number>>({});
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());

  // Add category modal
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState<boolean>(false);
  const [newCategoryName, setNewCategoryName] = useState<string>('');

  // Delete category modal
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);
  const [isDeletingCategory, setIsDeletingCategory] = useState<boolean>(false);

  // Import modal
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isPreviewing, setIsPreviewing] = useState<boolean>(false);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [previewResult, setPreviewResult] = useState<BudgetImportPreviewResult | null>(null);

  // History & void modal
  const [batches, setBatches] = useState<ImportBatchItem[]>([]);
  const [loadingBatches, setLoadingBatches] = useState<boolean>(false);
  const [voidTargetBatch, setVoidTargetBatch] = useState<ImportBatchItem | null>(null);
  const [voidReason, setVoidReason] = useState<string>('');
  const [isVoiding, setIsVoiding] = useState<boolean>(false);

  // Feedback notifications
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const canWrite = userRole === 'SUPERADMIN' || userRole === 'HOA_ADMIN';
  const canView = canWrite || userRole === 'HOA_CHAIRMAN';

  const loadBudget = useCallback(
    async (targetYear = selectedYear) => {
      try {
        setLoading(true);
        setFeedback(null);
        const session = getStoredSession();
        if (!session?.user?.tenantId) {
          throw new Error(t('common.userNotAuthorizedOrLinked'));
        }
        setTenantId(session.user.tenantId);
        setUserRole(session.user.role || '');

        const data = await apiRequest<BudgetApiResponse | BudgetLineItem[]>(
          `/finance/tenants/${session.user.tenantId}/budget?year=${targetYear}`,
        );

        const { categories: catList, cellValues: valMap } = parseBudgetResponse(data);
        setCategories(catList);
        setCellValues(valMap);
        setInitialValues(valMap);
        setDirtyKeys(new Set());
      } catch (err: any) {
        setFeedback({
          type: 'error',
          text: getApiErrorMessage(err, t),
        });
      } finally {
        setLoading(false);
      }
    },
    [selectedYear, t],
  );

  const loadBatches = useCallback(async () => {
    try {
      setLoadingBatches(true);
      const session = getStoredSession();
      if (!session?.user?.tenantId) return;

      const data = await apiRequest<{ items?: ImportBatchItem[]; batches?: ImportBatchItem[] } | ImportBatchItem[]>(
        `/finance/tenants/${session.user.tenantId}/imports?kind=BUDGET`,
      );
      if (Array.isArray(data)) {
        setBatches(data);
      } else if (data && Array.isArray((data as any).items)) {
        setBatches((data as any).items);
      } else if (data && Array.isArray((data as any).batches)) {
        setBatches((data as any).batches);
      } else {
        setBatches([]);
      }
    } catch {
      // non-blocking
    } finally {
      setLoadingBatches(false);
    }
  }, []);

  useEffect(() => {
    loadBudget(selectedYear);
  }, [loadBudget, selectedYear]);

  useEffect(() => {
    if (isImportModalOpen) {
      loadBatches();
    }
  }, [isImportModalOpen, loadBatches]);

  const handleCellChange = (category: string, month: number, rawValue: string) => {
    const parsed = parseFloat(rawValue);
    const amount = isNaN(parsed) || parsed < 0 ? 0 : Math.round(parsed * 100) / 100;
    const key = `${category}__${month}`;

    setCellValues((prev) => ({
      ...prev,
      [key]: amount,
    }));

    setDirtyKeys((prev) => {
      const next = new Set(prev);
      const original = initialValues[key] || 0;
      if (amount !== original) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (dirtyKeys.size === 0 || !canWrite) return;
    try {
      setIsSaving(true);
      setFeedback(null);

      const items: Array<{
        year: number;
        month: number;
        category: string;
        plannedAmount: number;
      }> = [];

      for (const key of Array.from(dirtyKeys)) {
        const [cat, mStr] = key.split('__');
        const month = parseInt(mStr, 10);
        const plannedAmount = cellValues[key] || 0;
        items.push({
          year: selectedYear,
          month,
          category: cat,
          plannedAmount,
        });
      }

      await apiRequest(`/finance/tenants/${tenantId}/budget`, {
        method: 'PUT',
        body: JSON.stringify({ lines: items, items }),
      });

      setFeedback({
        type: 'success',
        text: t('budget.savedSuccess'),
      });

      await loadBudget(selectedYear);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: getApiErrorMessage(err, t),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;

    if (!categories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      setCategories((prev) => [...prev, trimmed]);
    }
    setNewCategoryName('');
    setIsAddCategoryOpen(false);
  };

  const handleDeleteCategory = async () => {
    if (!categoryToDelete || !canWrite) return;
    try {
      setIsDeletingCategory(true);
      await apiRequest(
        `/finance/tenants/${tenantId}/budget/category?year=${selectedYear}&category=${encodeURIComponent(categoryToDelete)}`,
        { method: 'DELETE' },
      );

      setFeedback({
        type: 'success',
        text: t('budget.categoryDeleted'),
      });
      setCategoryToDelete(null);
      await loadBudget(selectedYear);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: getApiErrorMessage(err, t),
      });
    } finally {
      setIsDeletingCategory(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      setIsDownloadingTemplate(true);
      await apiDownload('/imports/templates/budget.xlsx', `budget_template_${selectedYear}.xlsx`);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: getApiErrorMessage(err, t),
      });
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  // Import flow
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setPreviewResult(null);
    }
  };

  const handlePreviewImport = async () => {
    if (!selectedFile || !tenantId) return;
    try {
      setIsPreviewing(true);
      setFeedback(null);
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('year', String(selectedYear));

      const res = await apiRequest<BudgetImportPreviewResult>(
        `/finance/tenants/${tenantId}/imports/budget/preview`,
        {
          method: 'POST',
          body: formData,
        },
      );
      setPreviewResult(res);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: getApiErrorMessage(err, t),
      });
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleApplyImport = async () => {
    if (!previewResult) return;
    try {
      setIsApplying(true);
      setFeedback(null);
      await apiRequest(`/imports/${previewResult.batchId}/apply`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      setFeedback({
        type: 'success',
        text: t('budget.savedSuccess'),
      });
      setIsImportModalOpen(false);
      setSelectedFile(null);
      setPreviewResult(null);
      await loadBudget(selectedYear);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: getApiErrorMessage(err, t),
      });
    } finally {
      setIsApplying(false);
    }
  };

  const handleVoidBatch = async () => {
    if (!voidTargetBatch || !voidReason.trim()) return;
    try {
      setIsVoiding(true);
      setFeedback(null);
      await apiRequest(`/imports/${voidTargetBatch.id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: voidReason.trim() }),
      });

      setFeedback({
        type: 'success',
        text: t('budget.voidSuccess'),
      });
      setVoidTargetBatch(null);
      setVoidReason('');
      await loadBatches();
      await loadBudget(selectedYear);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: getApiErrorMessage(err, t),
      });
    } finally {
      setIsVoiding(false);
    }
  };

  // Computations for totals
  const monthTotals: Record<number, number> = {};
  for (let m = 1; m <= 12; m++) {
    monthTotals[m] = 0;
  }
  let grandTotal = 0;

  for (const cat of categories) {
    for (let m = 1; m <= 12; m++) {
      const val = cellValues[`${cat}__${m}`] || 0;
      monthTotals[m] += val;
      grandTotal += val;
    }
  }

  const categoryTotals: Record<string, number> = {};
  for (const cat of categories) {
    let rowSum = 0;
    for (let m = 1; m <= 12; m++) {
      rowSum += cellValues[`${cat}__${m}`] || 0;
    }
    categoryTotals[cat] = rowSum;
  }

  const monthShortHeaders = [
    t('budget.months.short.1'),
    t('budget.months.short.2'),
    t('budget.months.short.3'),
    t('budget.months.short.4'),
    t('budget.months.short.5'),
    t('budget.months.short.6'),
    t('budget.months.short.7'),
    t('budget.months.short.8'),
    t('budget.months.short.9'),
    t('budget.months.short.10'),
    t('budget.months.short.11'),
    t('budget.months.short.12'),
  ];

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6">
      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link
              href="/dashboard/finance"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{t('budget.backToFinance')}</span>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 shadow-sm">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                {t('budget.title')}
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">{t('budget.subtitle')}</p>
            </div>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Year selector */}
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('budget.yearLabel')}:
            </span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              disabled={loading || isSaving}
              className="bg-transparent text-sm font-bold text-slate-800 focus:outline-none cursor-pointer"
            >
              {[2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* Link to Audit */}
          <Link
            href="/dashboard/finance/audit"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm font-semibold rounded-xl border border-indigo-200 shadow-sm transition-all"
          >
            <span>{t('budget.goToAudit')}</span>
            <ArrowRight className="w-4 h-4" />
          </Link>

          {/* Download Template */}
          <button
            onClick={handleDownloadTemplate}
            disabled={isDownloadingTemplate}
            className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-xl border border-slate-200 shadow-sm transition-all disabled:opacity-50"
            title={t('budget.downloadTemplate')}
          >
            {isDownloadingTemplate ? (
              <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
            ) : (
              <Download className="w-4 h-4 text-emerald-600" />
            )}
            <span className="hidden sm:inline">{t('budget.downloadTemplate')}</span>
          </button>

          {/* Import Budget Modal trigger */}
          {canWrite && (
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-xl border border-slate-200 shadow-sm transition-all"
            >
              <Upload className="w-4 h-4 text-indigo-600" />
              <span>{t('budget.importBudgetBtn')}</span>
            </button>
          )}

          {/* Add Category button */}
          {canWrite && (
            <button
              onClick={() => setIsAddCategoryOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-xl border border-slate-200 shadow-sm transition-all"
            >
              <Plus className="w-4 h-4 text-slate-600" />
              <span>{t('budget.addCategoryBtn')}</span>
            </button>
          )}

          {/* Save button */}
          {canWrite && (
            <button
              onClick={handleSave}
              disabled={dirtyKeys.size === 0 || isSaving}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl shadow-sm transition-all ${
                dirtyKeys.size > 0
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-400/50 animate-pulse'
                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
              }`}
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>
                {isSaving ? t('budget.saving') : t('budget.saveChangesBtn')}
                {dirtyKeys.size > 0 ? ` (${dirtyKeys.size})` : ''}
              </span>
            </button>
          )}

          {/* Refresh button */}
          <button
            onClick={() => loadBudget(selectedYear)}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-all disabled:opacity-50"
            title={t('common.refresh')}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Dirty Warning Banner */}
      {dirtyKeys.size > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              {t('budget.unsavedChanges')}: <strong>{dirtyKeys.size}</strong>
            </span>
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-lg shadow-sm"
          >
            {isSaving ? t('budget.saving') : t('budget.saveChangesBtn')}
          </button>
        </div>
      )}

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span className="text-sm font-medium">{feedback.text}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Budget Grid Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            <p className="text-sm">{t('common.loading')}</p>
          </div>
        ) : categories.length === 0 ? (
          <div className="p-16 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
            <FileSpreadsheet className="w-12 h-12 text-slate-300" />
            <p className="text-sm max-w-md">{t('budget.emptyCategories')}</p>
            {canWrite && (
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => setIsAddCategoryOpen(true)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl shadow-sm"
                >
                  {t('budget.addCategoryBtn')}
                </button>
                <button
                  onClick={() => setIsImportModalOpen(true)}
                  className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-xl border border-slate-200 shadow-sm"
                >
                  {t('budget.importBudgetBtn')}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4 min-w-[220px] sticky left-0 bg-slate-50 z-10 border-r border-slate-200">
                    {t('budget.thCategory')}
                  </th>
                  {monthShortHeaders.map((mName, idx) => (
                    <th key={idx} className="py-3 px-2 min-w-[100px] text-right font-medium">
                      {mName}
                    </th>
                  ))}
                  <th className="py-3 px-4 min-w-[130px] text-right bg-slate-100 font-bold text-slate-800 border-l border-slate-200">
                    {t('budget.thYearTotal')}
                  </th>
                  {canWrite && (
                    <th className="py-3 px-3 text-center w-[50px]">{t('common.actions')}</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categories.map((cat) => {
                  const rowSum = categoryTotals[cat] || 0;
                  return (
                    <tr key={cat} className="hover:bg-slate-50/60 transition-colors">
                      {/* Category Title */}
                      <td className="py-2.5 px-4 font-semibold text-slate-800 sticky left-0 bg-white z-10 border-r border-slate-200 truncate max-w-[240px]">
                        {cat}
                      </td>

                      {/* 12 Month inputs */}
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                        const cellKey = `${cat}__${m}`;
                        const val = cellValues[cellKey] ?? 0;
                        const isDirty = dirtyKeys.has(cellKey);

                        return (
                          <td key={m} className="py-1.5 px-1.5 text-right">
                            {canWrite ? (
                              <input
                                type="number"
                                min="0"
                                step="1000"
                                value={val === 0 ? '' : val}
                                placeholder="0"
                                onChange={(e) => handleCellChange(cat, m, e.target.value)}
                                className={`w-full text-right px-2 py-1 text-xs rounded-lg border transition-all ${
                                  isDirty
                                    ? 'bg-amber-50 border-amber-400 font-bold text-amber-900 ring-1 ring-amber-300'
                                    : 'bg-white border-slate-200 hover:border-slate-300 focus:border-emerald-500 text-slate-800'
                                } focus:outline-none`}
                              />
                            ) : (
                              <span className="font-mono text-slate-700 px-2 py-1 block">
                                {val > 0 ? val.toLocaleString() : '—'}
                              </span>
                            )}
                          </td>
                        );
                      })}

                      {/* Row Total */}
                      <td className="py-2.5 px-4 text-right font-bold text-slate-900 bg-slate-50/50 border-l border-slate-200 font-mono whitespace-nowrap">
                        {rowSum.toLocaleString()} ₸
                      </td>

                      {/* Delete category action */}
                      {canWrite && (
                        <td className="py-2.5 px-3 text-center">
                          <button
                            onClick={() => setCategoryToDelete(cat)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                            title={t('common.delete')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {/* Grand totals row */}
                <tr className="bg-slate-100/80 border-t-2 border-slate-300 font-bold text-slate-900 text-xs">
                  <td className="py-3 px-4 sticky left-0 bg-slate-100 z-10 border-r border-slate-300">
                    {t('budget.totalsRow')}
                  </td>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <td key={m} className="py-3 px-2 text-right font-mono whitespace-nowrap">
                      {monthTotals[m] ? `${monthTotals[m].toLocaleString()} ₸` : '0 ₸'}
                    </td>
                  ))}
                  <td className="py-3 px-4 text-right font-extrabold text-emerald-800 bg-emerald-50/70 border-l border-slate-300 font-mono text-sm whitespace-nowrap">
                    {grandTotal.toLocaleString()} ₸
                  </td>
                  {canWrite && <td></td>}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Add Category Modal */}
      {isAddCategoryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4 border border-slate-100">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">{t('budget.modalAddTitle')}</h3>
              <button
                onClick={() => setIsAddCategoryOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('budget.categoryNameLabel')}
                </label>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder={t('budget.categoryPlaceholder')}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500"
                  autoFocus
                />
              </div>

              <div>
                <span className="block text-xs text-slate-500 mb-2">
                  {t('budget.selectStandardCategory')}
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-1">
                  {STANDARD_CATEGORIES.map((std) => (
                    <button
                      key={std}
                      type="button"
                      onClick={() => setNewCategoryName(std)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                        newCategoryName === std
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {std}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setIsAddCategoryOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                {t('budget.cancelBtn')}
              </button>
              <button
                onClick={handleAddCategory}
                disabled={!newCategoryName.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl shadow-sm"
              >
                {t('budget.addBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Category Confirmation Modal */}
      {categoryToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl space-y-4 border border-slate-100">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-slate-900">
                {t('budget.deleteCategoryConfirm', {
                  category: categoryToDelete,
                  year: selectedYear,
                })}
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              {t('common.confirm')}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setCategoryToDelete(null)}
                disabled={isDeletingCategory}
                className="px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                {t('budget.cancelBtn')}
              </button>
              <button
                onClick={handleDeleteCategory}
                disabled={isDeletingCategory}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-xl shadow-sm"
              >
                {isDeletingCategory ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-xl space-y-5 border border-slate-100 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{t('budget.importModalTitle')}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{t('budget.importModalDesc')}</p>
              </div>
              <button
                onClick={() => {
                  setIsImportModalOpen(false);
                  setPreviewResult(null);
                  setSelectedFile(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step 1: Upload or Preview */}
            {!previewResult ? (
              <div className="space-y-4">
                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center hover:border-emerald-400 transition-colors bg-slate-50/50">
                  <input
                    type="file"
                    id={fileInputId}
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <label htmlFor={fileInputId} className="cursor-pointer flex flex-col items-center">
                    <FileSpreadsheet className="w-10 h-10 text-emerald-600 mb-2" />
                    <span className="text-sm font-semibold text-slate-700">
                      {selectedFile ? selectedFile.name : t('budget.dropFileHere')}
                    </span>
                    <span className="text-xs text-slate-400 mt-1">.xlsx, .xls, .csv</span>
                  </label>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={handleDownloadTemplate}
                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{t('budget.downloadTemplate')}</span>
                  </button>

                  <button
                    onClick={handlePreviewImport}
                    disabled={!selectedFile || isPreviewing}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl shadow-sm flex items-center gap-2"
                  >
                    {isPreviewing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{t('budget.previewing')}</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span>{t('budget.previewBtn')}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* Step 2: Preview Results */
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 p-3 rounded-xl">
                  <div>
                    <h4 className="text-sm font-bold text-emerald-900">
                      {t('budget.previewTitle', { year: previewResult.year })}
                    </h4>
                    <p className="text-xs text-emerald-700">
                      {previewResult.fileName} • {previewResult.categoriesCount} {t('budget.thCategory')} • {previewResult.validCount} {t('common.records', { defaultValue: 'записей' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-xs font-semibold rounded-lg">
                      {t('budget.willUpdateBadge')}: {previewResult.willUpdateCount}
                    </span>
                    <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg">
                      {t('budget.newBadge')}: {previewResult.newCount}
                    </span>
                  </div>
                </div>

                {/* Preview rows table */}
                <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">{t('budget.thCategory')}</th>
                        <th className="py-2 px-3 text-right">{t('budget.thYearTotal')}</th>
                        <th className="py-2 px-3 text-center">{t('common.status')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewResult.rows.map((r, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="py-2 px-3 font-semibold text-slate-800">{r.category}</td>
                          <td className="py-2 px-3 text-right font-mono text-slate-700">
                            {r.rowTotal.toLocaleString()} ₸
                          </td>
                          <td className="py-2 px-3 text-center">
                            {r.willUpdateCount > 0 ? (
                              <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
                                {t('budget.willUpdateBadge')}
                              </span>
                            ) : (
                              <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                                {t('budget.newBadge')}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => setPreviewResult(null)}
                    disabled={isApplying}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    {t('budget.cancelImportBtn')}
                  </button>
                  <button
                    onClick={handleApplyImport}
                    disabled={isApplying}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-sm flex items-center gap-2"
                  >
                    {isApplying ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{t('budget.applying')}</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{t('budget.applyImportBtn')}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Import History Section */}
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <History className="w-4 h-4 text-slate-500" />
                  <span>{t('budget.historyTitle')}</span>
                </h4>
                <button
                  onClick={loadBatches}
                  disabled={loadingBatches}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingBatches ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {loadingBatches ? (
                <div className="py-4 text-center text-xs text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                </div>
              ) : batches.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-2">{t('budget.noHistory')}</p>
              ) : (
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 text-xs">
                  {batches.map((b) => (
                    <div key={b.id} className="p-3 flex items-center justify-between hover:bg-slate-50">
                      <div>
                        <div className="font-semibold text-slate-800 flex items-center gap-2">
                          <span>{b.fileName}</span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                              b.status === 'APPLIED'
                                ? 'bg-emerald-50 text-emerald-700'
                                : b.status === 'VOIDED'
                                ? 'bg-rose-50 text-rose-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {b.status === 'APPLIED'
                              ? t('finance.imports.batchStatusApplied')
                              : b.status === 'VOIDED'
                              ? t('finance.imports.batchStatusVoided')
                              : t('finance.imports.batchStatusPreview')}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {new Date(b.createdAt).toLocaleDateString()} • {b.rowsApplied} {t('common.records', { defaultValue: 'записей' })}
                        </p>
                      </div>

                      {canWrite && b.status === 'APPLIED' && (
                        <button
                          onClick={() => setVoidTargetBatch(b)}
                          className="px-2.5 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>{t('budget.voidBtn')}</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Void Confirmation Modal */}
      {voidTargetBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4 border border-slate-100">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <div>
                <h3 className="text-base font-bold text-slate-900">{t('budget.voidModalTitle')}</h3>
                <p className="text-xs text-slate-500">{voidTargetBatch.fileName}</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('budget.voidReasonLabel')}
              </label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder={t('budget.voidReasonPlaceholder')}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setVoidTargetBatch(null);
                  setVoidReason('');
                }}
                disabled={isVoiding}
                className="px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                {t('budget.cancelBtn')}
              </button>
              <button
                onClick={handleVoidBatch}
                disabled={isVoiding || !voidReason.trim()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl shadow-sm flex items-center gap-1.5"
              >
                {isVoiding ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{t('budget.voiding')}</span>
                  </>
                ) : (
                  <span>{t('budget.confirmVoidBtn')}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
