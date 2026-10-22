'use client';

import React, { useState, useEffect, useCallback, useId } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  FileSpreadsheet,
  Upload,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Download,
  RotateCcw,
  Tag,
  Check,
  X,
} from 'lucide-react';
import { apiRequest, apiDownload, getStoredSession, getApiErrorMessage } from '@/lib/api';

interface PreviewRow {
  rowIndex: number;
  dateRaw: string;
  expenseDate: string | null;
  amount: number;
  amountRaw: string;
  category: string;
  counterparty?: string | null;
  documentNumber?: string | null;
  description?: string | null;
  isValid: boolean;
  errors: string[];
  isDuplicate: boolean;
  duplicateReason?: string;
  isNewCategory: boolean;
  skip?: boolean;
}

interface PreviewResult {
  batchId: string;
  tenantId: string;
  fileName: string;
  kind: string;
  rowsTotal: number;
  validCount: number;
  duplicateCount: number;
  errorCount: number;
  newCategories: string[];
  rows: PreviewRow[];
}

interface ImportBatchItem {
  id: string;
  tenantId: string;
  kind: string;
  fileName: string;
  fileUrl?: string | null;
  status: 'PREVIEW' | 'APPLIED' | 'VOIDED';
  rowsTotal: number;
  rowsApplied: number;
  rowsSkipped: number;
  createdAt: string;
  createdById: string;
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  };
  voidedAt?: string | null;
  voidedById?: string | null;
  voidedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  } | null;
  voidedReason?: string | null;
  _count?: {
    expenses: number;
  };
}

export default function BulkImportsPage() {
  const { t } = useTranslation();
  const fileInputId = useId();

  const [tenantId, setTenantId] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [skippedRowIndexes, setSkippedRowIndexes] = useState<Set<number>>(new Set());
  const [confirmNewCategories, setConfirmNewCategories] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  // History & void state
  const [batches, setBatches] = useState<ImportBatchItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [voidTargetBatch, setVoidTargetBatch] = useState<ImportBatchItem | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);

  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const canWrite = userRole === 'SUPERADMIN' || userRole === 'HOA_ADMIN';
  const canView = canWrite || userRole === 'HOA_CHAIRMAN';

  // Load user session
  useEffect(() => {
    const session = getStoredSession();
    if (session?.user?.tenantId) {
      setTenantId(session.user.tenantId);
      setUserRole(session.user.role);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    if (!tenantId) return;
    try {
      setLoadingHistory(true);
      const res = await apiRequest<{ items: ImportBatchItem[] }>(
        `/tenants/${tenantId}/imports?limit=50`,
      );
      setBatches(res.items || []);
    } catch (err) {
      setFeedbackMessage({
        type: 'error',
        text: getApiErrorMessage(err, t),
      });
    } finally {
      setLoadingHistory(false);
    }
  }, [tenantId, t]);

  useEffect(() => {
    if (tenantId) {
      loadHistory();
    }
  }, [tenantId, loadHistory]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setPreview(null);
      setFeedbackMessage(null);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      setIsDownloadingTemplate(true);
      await apiDownload('/imports/templates/expenses.xlsx', 'expenses_template.xlsx');
      setFeedbackMessage({
        type: 'success',
        text: t('finance.imports.templateSuccess'),
      });
    } catch (err) {
      setFeedbackMessage({
        type: 'error',
        text: getApiErrorMessage(err, t),
      });
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const handleUploadAndPreview = async () => {
    if (!selectedFile || !tenantId) return;
    try {
      setIsUploading(true);
      setFeedbackMessage(null);

      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await apiRequest<PreviewResult>(
        `/tenants/${tenantId}/imports/expenses/preview`,
        {
          method: 'POST',
          body: formData,
        },
      );

      setPreview(res);

      // По умолчанию отмечаем пропуск для строк с ошибками и дубликатов
      const initialSkips = new Set<number>();
      res.rows.forEach((r) => {
        if (!r.isValid || r.isDuplicate) {
          initialSkips.add(r.rowIndex);
        }
      });
      setSkippedRowIndexes(initialSkips);
      setConfirmNewCategories(false);

      // Обновляем историю партий (появился PREVIEW)
      await loadHistory();
    } catch (err) {
      setFeedbackMessage({
        type: 'error',
        text: getApiErrorMessage(err, t),
      });
    } finally {
      setIsUploading(false);
    }
  };

  const toggleSkipRow = (rowIndex: number) => {
    setSkippedRowIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) {
        next.delete(rowIndex);
      } else {
        next.add(rowIndex);
      }
      return next;
    });
  };

  const handleApply = async () => {
    if (!preview || !preview.batchId) return;
    try {
      setIsApplying(true);
      setFeedbackMessage(null);

      const res = await apiRequest<{ rowsApplied: number; rowsSkipped: number }>(
        `/imports/${preview.batchId}/apply`,
        {
          method: 'POST',
          body: JSON.stringify({
            rowIndexesToSkip: Array.from(skippedRowIndexes),
            confirmNewCategories,
          }),
        },
      );

      setFeedbackMessage({
        type: 'success',
        text: t('finance.imports.applySuccess', {
          applied: res.rowsApplied,
          skipped: res.rowsSkipped,
        }),
      });

      // Сбрасываем превью и обновляем историю
      setPreview(null);
      setSelectedFile(null);
      await loadHistory();
    } catch (err) {
      setFeedbackMessage({
        type: 'error',
        text: getApiErrorMessage(err, t),
      });
    } finally {
      setIsApplying(false);
    }
  };

  const handleVoidBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidTargetBatch) return;

    if (!voidReason.trim()) {
      setFeedbackMessage({
        type: 'error',
        text: t('finance.imports.voidReasonLabel'),
      });
      return;
    }

    try {
      setIsVoiding(true);
      await apiRequest(`/imports/${voidTargetBatch.id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: voidReason.trim() }),
      });

      setFeedbackMessage({
        type: 'success',
        text: t('finance.imports.voidSuccess'),
      });
      setVoidTargetBatch(null);
      setVoidReason('');
      await loadHistory();
    } catch (err) {
      setFeedbackMessage({
        type: 'error',
        text: getApiErrorMessage(err, t),
      });
    } finally {
      setIsVoiding(false);
    }
  };

  const formatMoney = (val: number) =>
    val.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Шапка страницы */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/dashboard/finance/expenses"
              className="text-xs font-medium text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{t('finance.imports.backToExpenses')}</span>
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <FileSpreadsheet className="w-7 h-7 text-sky-600" />
            <span>{t('finance.imports.title')}</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('finance.imports.subtitle')}</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadTemplate}
            disabled={isDownloadingTemplate}
            className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-xl border border-slate-200 shadow-sm transition-all disabled:opacity-60"
          >
            {isDownloadingTemplate ? (
              <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
            ) : (
              <Download className="w-4 h-4 text-slate-500" />
            )}
            <span>{t('finance.imports.downloadTemplateBtn')}</span>
          </button>
        </div>
      </div>

      {/* Уведомления */}
      {feedbackMessage && (
        <div
          className={`p-4 rounded-xl flex items-start gap-3 border ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedbackMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600 mt-0.5" />
          )}
          <div className="flex-1 text-sm">{feedbackMessage.text}</div>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Секция загрузки файла */}
      {canWrite && !preview && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-2">
            {t('finance.imports.uploadCardTitle')}
          </h2>
          <div className="border-2 border-dashed border-slate-300 hover:border-sky-500 rounded-xl p-8 text-center transition-colors bg-slate-50/50">
            <input
              type="file"
              id={fileInputId}
              accept=".xlsx,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <label
              htmlFor={fileInputId}
              className="cursor-pointer flex flex-col items-center justify-center space-y-3"
            >
              <div className="w-12 h-12 bg-sky-100 text-sky-600 rounded-2xl flex items-center justify-center">
                <Upload className="w-6 h-6" />
              </div>
              <div className="text-sm font-medium text-slate-700">
                {selectedFile ? (
                  <span className="text-sky-700 font-semibold">{selectedFile.name}</span>
                ) : (
                  <span>{t('finance.imports.uploadDropzone')}</span>
                )}
              </div>
              <p className="text-xs text-slate-400">{t('finance.imports.uploadLimit')}</p>
            </label>
          </div>

          {selectedFile && (
            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setSelectedFile(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 font-medium"
              >
                {t('finance.imports.cancelPreviewBtn')}
              </button>
              <button
                onClick={handleUploadAndPreview}
                disabled={isUploading}
                className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-all disabled:opacity-60"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{t('finance.imports.previewing')}</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>{t('finance.imports.previewBtn')}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Секция предпросмотра (Preview) */}
      {preview && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-sky-600" />
                <span>{t('finance.imports.previewCardTitle')}</span>
                <span className="text-xs font-normal text-slate-400">({preview.fileName})</span>
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPreview(null)}
                className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium rounded-xl transition-all"
              >
                {t('finance.imports.cancelPreviewBtn')}
              </button>
              <button
                onClick={handleApply}
                disabled={isApplying || preview.rows.every((r) => skippedRowIndexes.has(r.rowIndex))}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-all disabled:opacity-50"
              >
                {isApplying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{t('finance.imports.applying')}</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{t('finance.imports.applyBtn')}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Плашки сводки */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/60">
              <div className="text-xs text-slate-500 font-medium">
                {t('finance.imports.totalRows')}
              </div>
              <div className="text-xl font-bold text-slate-800 mt-1">{preview.rowsTotal}</div>
            </div>
            <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200/60">
              <div className="text-xs text-emerald-700 font-medium">
                {t('finance.imports.validRows')}
              </div>
              <div className="text-xl font-bold text-emerald-800 mt-1">{preview.validCount}</div>
            </div>
            <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200/60">
              <div className="text-xs text-amber-700 font-medium">
                {t('finance.imports.duplicateRows')}
              </div>
              <div className="text-xl font-bold text-amber-800 mt-1">
                {preview.duplicateCount}
              </div>
            </div>
            <div className="p-3.5 bg-rose-50 rounded-xl border border-rose-200/60">
              <div className="text-xs text-rose-700 font-medium">
                {t('finance.imports.errorRows')}
              </div>
              <div className="text-xl font-bold text-rose-800 mt-1">{preview.errorCount}</div>
            </div>
          </div>

          {/* Предупреждение о новых категориях */}
          {preview.newCategories.length > 0 && (
            <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Tag className="w-5 h-5 text-sky-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-sky-900">
                    {t('finance.imports.newCategories')}: {preview.newCategories.join(', ')}
                  </div>
                  <div className="text-xs text-sky-700 mt-0.5">
                    {t('finance.imports.confirmNewCategoriesCheckbox')}
                  </div>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer bg-white px-3.5 py-2 rounded-lg border border-sky-300 shadow-sm text-xs font-semibold text-sky-900 hover:bg-sky-50/50 transition-colors">
                <input
                  type="checkbox"
                  checked={confirmNewCategories}
                  onChange={(e) => setConfirmNewCategories(e.target.checked)}
                  className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4"
                />
                <span>{t('finance.imports.confirmNewCategoriesCheckbox')}</span>
              </label>
            </div>
          )}

          {/* Таблица предпросмотра */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/80 text-slate-600 uppercase font-bold tracking-wider border-b border-slate-200">
                  <th className="py-2.5 px-3 w-16 text-center">{t('finance.imports.thSkip')}</th>
                  <th className="py-2.5 px-3 w-12">{t('finance.imports.thRow')}</th>
                  <th className="py-2.5 px-3 w-28">{t('finance.imports.thDate')}</th>
                  <th className="py-2.5 px-3 w-32">{t('finance.imports.thAmount')}</th>
                  <th className="py-2.5 px-3">{t('finance.imports.thCategory')}</th>
                  <th className="py-2.5 px-3">{t('finance.imports.thCounterparty')}</th>
                  <th className="py-2.5 px-3">{t('finance.imports.thDocNumber')}</th>
                  <th className="py-2.5 px-3">{t('finance.imports.thDescription')}</th>
                  <th className="py-2.5 px-3 w-48">{t('finance.imports.thStatus')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.rows.map((row) => {
                  const isSkipped = skippedRowIndexes.has(row.rowIndex);

                  let rowBg = 'bg-white hover:bg-slate-50/60';
                  if (!row.isValid) {
                    rowBg = isSkipped
                      ? 'bg-rose-50/30 text-slate-400'
                      : 'bg-rose-50/80 text-rose-950 font-medium';
                  } else if (row.isDuplicate) {
                    rowBg = isSkipped
                      ? 'bg-amber-50/30 text-slate-400'
                      : 'bg-amber-50/80 text-amber-950';
                  } else if (isSkipped) {
                    rowBg = 'bg-slate-50/50 text-slate-400 opacity-60';
                  }

                  return (
                    <tr key={row.rowIndex} className={`transition-colors ${rowBg}`}>
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSkipped}
                          onChange={() => toggleSkipRow(row.rowIndex)}
                          className="rounded text-slate-600 focus:ring-slate-500 w-4 h-4"
                        />
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-400">{row.rowIndex + 1}</td>
                      <td className="py-2.5 px-3 font-mono">
                        {row.expenseDate
                          ? new Date(row.expenseDate).toLocaleDateString('ru-RU')
                          : row.dateRaw || '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold">
                        {row.amount > 0 ? formatMoney(row.amount) : row.amountRaw || '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-medium text-slate-800">{row.category || '—'}</span>
                        {row.isNewCategory && (
                          <span className="ml-1.5 px-1.5 py-0.5 bg-sky-100 text-sky-700 rounded text-[10px] font-semibold">
                            {t('finance.imports.badgeNew')}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{row.counterparty || '—'}</td>
                      <td className="py-2.5 px-3 text-slate-600 font-mono">
                        {row.documentNumber || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate">
                        {row.description || '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        {!row.isValid ? (
                          <div className="flex items-center gap-1.5 text-rose-600">
                            <XCircle className="w-4 h-4 flex-shrink-0" />
                            <span className="text-[11px] leading-tight font-medium">
                              {row.errors.join(', ')}
                            </span>
                          </div>
                        ) : row.isDuplicate ? (
                          <div className="flex items-center gap-1.5 text-amber-700">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                            <span className="text-[11px] leading-tight">
                              {row.duplicateReason || t('finance.imports.statusDuplicate')}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
                            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                            <span>{t('finance.imports.statusValid')}</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* История партий импорта */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <span>{t('finance.imports.historyTitle')}</span>
            <span className="text-xs text-slate-400 font-normal">({batches.length})</span>
          </h2>
          <button
            onClick={loadHistory}
            disabled={loadingHistory}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loadingHistory ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loadingHistory && batches.length === 0 ? (
          <div className="py-12 flex justify-center items-center text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-sky-600" />
          </div>
        ) : batches.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm">
            {t('finance.imports.historyEmpty')}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 uppercase font-bold tracking-wider border-b border-slate-200">
                  <th className="py-3 px-4">{t('finance.imports.thFileName')}</th>
                  <th className="py-3 px-4">{t('finance.imports.thCreatedAt')}</th>
                  <th className="py-3 px-4">{t('finance.imports.thAuthor')}</th>
                  <th className="py-3 px-4 text-center">{t('finance.imports.thRowsStat')}</th>
                  <th className="py-3 px-4">{t('finance.imports.thBatchStatus')}</th>
                  <th className="py-3 px-4 text-right">{t('finance.imports.thActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batches.map((batch) => {
                  let statusBadge = (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
                      {t('finance.imports.batchStatusPreview')}
                    </span>
                  );
                  if (batch.status === 'APPLIED') {
                    statusBadge = (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                        {t('finance.imports.batchStatusApplied')}
                      </span>
                    );
                  } else if (batch.status === 'VOIDED') {
                    statusBadge = (
                      <span
                        className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800"
                        title={batch.voidedReason || undefined}
                      >
                        {t('finance.imports.batchStatusVoided')}
                      </span>
                    );
                  }

                  return (
                    <tr key={batch.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-medium text-slate-800">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="w-4 h-4 text-slate-400" />
                          <span>{batch.fileName}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-mono">
                        {new Date(batch.createdAt).toLocaleString('ru-RU')}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {batch.createdBy
                          ? `${batch.createdBy.firstName} ${batch.createdBy.lastName}`
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-center font-mono">
                        <span className="font-semibold text-emerald-700">
                          {batch.rowsApplied}
                        </span>{' '}
                        / <span className="text-slate-500">{batch.rowsTotal}</span>
                      </td>
                      <td className="py-3 px-4">{statusBadge}</td>
                      <td className="py-3 px-4 text-right">
                        {batch.status === 'APPLIED' && canWrite && (
                          <button
                            onClick={() => {
                              setVoidTargetBatch(batch);
                              setVoidReason('');
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-rose-50 text-rose-700 hover:text-rose-800 text-xs font-semibold rounded-lg border border-rose-200 shadow-sm transition-all"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>{t('finance.imports.voidBatchBtn')}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Модальное окно отката партии (Void Modal) */}
      {voidTargetBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5 text-rose-600">
                <div className="p-2 bg-rose-100 rounded-xl">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  {t('finance.imports.voidModalTitle')}
                </h3>
              </div>
              <button
                onClick={() => setVoidTargetBatch(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-500">{t('finance.imports.voidModalDesc')}</p>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-xs space-y-1">
              <div>
                <span className="text-slate-400">{t('finance.imports.thFileName')}:</span>{' '}
                <span className="font-semibold text-slate-700">{voidTargetBatch.fileName}</span>
              </div>
              <div>
                <span className="text-slate-400">{t('finance.imports.thCreatedAt')}:</span>{' '}
                <span className="font-mono text-slate-700">
                  {new Date(voidTargetBatch.createdAt).toLocaleString('ru-RU')}
                </span>
              </div>
              <div>
                <span className="text-slate-400">{t('finance.imports.thRowsStat')}:</span>{' '}
                <span className="font-semibold text-emerald-700">
                  {voidTargetBatch.rowsApplied}
                </span>
              </div>
            </div>

            <form onSubmit={handleVoidBatch} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('finance.imports.voidReasonLabel')} *
                </label>
                <textarea
                  required
                  rows={3}
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder={t('finance.imports.voidReasonPlaceholder')}
                  className="w-full text-sm border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setVoidTargetBatch(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-all"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isVoiding || !voidReason.trim()}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-all disabled:opacity-50"
                >
                  {isVoiding ? t('finance.imports.voiding') : t('finance.imports.confirmVoidBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
