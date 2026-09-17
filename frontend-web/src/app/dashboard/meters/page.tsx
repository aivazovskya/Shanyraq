'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Gauge,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Loader2,
  Clock,
  Eye,
  History,
  X,
  Droplets,
  Zap,
  Flame,
  HelpCircle,
  Check,
  Building,
  Download,
} from 'lucide-react';
import { apiRequest, apiDownload, getStoredSession } from '@/lib/api';

interface MeterItem {
  id: string;
  unitId: string;
  type: 'COLD_WATER' | 'HOT_WATER' | 'ELECTRICITY' | 'OTHER';
  serialNumber?: string | null;
  initialValue: number;
  isActive: boolean;
  unit?: {
    id: string;
    unitNumber: string;
    building?: {
      id: string;
      blockName: string;
    };
  };
}

interface ReadingItem {
  id: string;
  meterId: string;
  submittedById: string;
  value: number;
  photoUrl: string;
  periodMonth: number;
  periodYear: number;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  reviewedById?: string | null;
  reviewNote?: string | null;
  createdAt: string;
  meter: MeterItem;
  submittedBy: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
  };
  reviewedBy?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
}

export default function MetersReviewPage() {
  const { t } = useTranslation();
  const [readings, setReadings] = useState<ReadingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [tenantId, setTenantId] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'VERIFIED' | 'REJECTED'>('PENDING');

  // Reject Modal State
  const [rejectModalReading, setRejectModalReading] = useState<ReadingItem | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  // Photo Preview Modal
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  // History Drawer State
  const [historyDrawerMeter, setHistoryDrawerMeter] = useState<MeterItem | null>(null);
  const [meterHistory, setMeterHistory] = useState<ReadingItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Processing ID for row action buttons
  const [processingId, setProcessingId] = useState<string | null>(null);

  // CSV Export state
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportMonth, setExportMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [exportYear, setExportYear] = useState<number>(() => new Date().getFullYear());

  // Dispatcher, HOA Admin, Superadmin can write/review; Chairman is read-only
  const canReview = userRole === 'SUPERADMIN' || userRole === 'HOA_ADMIN' || userRole === 'DISPATCHER';
  const canExportCsv = ['DISPATCHER', 'HOA_ADMIN', 'SUPERADMIN', 'HOA_CHAIRMAN'].includes(userRole);

  const handleExportCsv = async () => {
    if (!tenantId) return;
    setExportingCsv(true);
    setExportError(null);
    try {
      const queryParams = new URLSearchParams();
      if (exportMonth) queryParams.set('month', String(exportMonth));
      if (exportYear) queryParams.set('year', String(exportYear));
      const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
      await apiDownload(
        `/meters/tenants/${tenantId}/readings/export${queryString}`,
        `meter-readings-${tenantId}-${exportYear}-${exportMonth}.csv`,
      );
    } catch (err: any) {
      setExportError(err.message || t('meters.exportError'));
      setTimeout(() => setExportError(null), 5000);
    } finally {
      setExportingCsv(false);
    }
  };

  const loadReadings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const session = getStoredSession();
      if (!session || !session.user || !session.user.tenantId) {
        throw new Error(t('common.userNotAuthorizedOrLinked'));
      }
      setTenantId(session.user.tenantId);
      setUserRole(session.user.role || '');

      const query = statusFilter === 'ALL' ? '' : `?status=${statusFilter}`;
      const data = await apiRequest<ReadingItem[]>(
        `/meters/tenants/${session.user.tenantId}/readings${query}`,
      );
      setReadings(data);
    } catch (err: any) {
      setError(err.message || t('meters.loadError'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, t]);

  useEffect(() => {
    loadReadings();
  }, [loadReadings]);

  const handleVerify = async (reading: ReadingItem) => {
    const unitLabel = reading.meter?.unit
      ? `${reading.meter.unit.unitNumber} (${reading.meter.unit.building?.blockName || t('common.block')})`
      : reading.meterId;

    if (!confirm(t('meters.confirmVerify', { value: reading.value, unit: unitLabel }))) {
      return;
    }

    try {
      setProcessingId(reading.id);
      await apiRequest(`/meters/readings/${reading.id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'VERIFIED',
        }),
      });

      setActionMessage({
        type: 'success',
        text: t('meters.verifiedSuccess'),
      });
      await loadReadings();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || t('common.error'),
      });
    } finally {
      setProcessingId(null);
    }
  };

  const openRejectModal = (reading: ReadingItem) => {
    setRejectModalReading(reading);
    setRejectNote('');
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalReading) return;

    try {
      setIsRejecting(true);
      await apiRequest(`/meters/readings/${rejectModalReading.id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'REJECTED',
          note: rejectNote.trim() || undefined,
        }),
      });

      setActionMessage({
        type: 'success',
        text: t('meters.rejectedSuccess'),
      });
      setRejectModalReading(null);
      await loadReadings();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || t('common.error'),
      });
    } finally {
      setIsRejecting(false);
    }
  };

  const openHistoryDrawer = async (meter: MeterItem) => {
    setHistoryDrawerMeter(meter);
    try {
      setLoadingHistory(true);
      const data = await apiRequest<ReadingItem[]>(`/meters/${meter.id}/readings`);
      setMeterHistory(data);
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || t('common.error'),
      });
    } finally {
      setLoadingHistory(false);
    }
  };

  const getMeterTypeBadge = (type: MeterItem['type']) => {
    switch (type) {
      case 'COLD_WATER':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
            <Droplets className="w-3.5 h-3.5 text-sky-500" />
            {t('meters.typeColdWater')}
          </span>
        );
      case 'HOT_WATER':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <Flame className="w-3.5 h-3.5 text-rose-500" />
            {t('meters.typeHotWater')}
          </span>
        );
      case 'ELECTRICITY':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            {t('meters.typeElectricity')}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700">
            <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
            {t('meters.typeOther')}
          </span>
        );
    }
  };

  const getStatusBadge = (status: ReadingItem['status']) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            {t('meters.statusPending')}
          </span>
        );
      case 'VERIFIED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            {t('meters.statusVerified')}
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            {t('meters.statusRejected')}
          </span>
        );
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sky-50 text-sky-700 rounded-xl border border-sky-100 shadow-sm">
              <Gauge className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                {t('meters.title')}
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">{t('meters.subtitle')}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {canExportCsv && (
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
              <label className="text-xs text-slate-500 font-medium">{t('meters.exportMonth')}:</label>
              <select
                value={exportMonth}
                onChange={(e) => setExportMonth(Number(e.target.value))}
                className="text-xs bg-transparent font-semibold text-slate-700 focus:outline-none cursor-pointer"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, '0')}
                  </option>
                ))}
              </select>

              <label className="text-xs text-slate-500 font-medium ml-1">{t('meters.exportYear')}:</label>
              <select
                value={exportYear}
                onChange={(e) => setExportYear(Number(e.target.value))}
                className="text-xs bg-transparent font-semibold text-slate-700 focus:outline-none cursor-pointer"
              >
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>

              <button
                onClick={handleExportCsv}
                disabled={exportingCsv}
                className="ml-1 px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 disabled:opacity-60"
              >
                {exportingCsv ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{t('meters.exportingCsv')}</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>{t('meters.exportCsvBtn')}</span>
                  </>
                )}
              </button>
            </div>
          )}

          <button
            onClick={loadReadings}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-all disabled:opacity-50"
            title={t('common.refresh')}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {exportError && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{exportError}</span>
          </div>
          <button onClick={() => setExportError(null)} className="text-rose-400 hover:text-rose-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        {(['PENDING', 'ALL', 'VERIFIED', 'REJECTED'] as const).map((filter) => {
          const isActive = statusFilter === filter;
          const label =
            filter === 'PENDING'
              ? t('meters.filterPending')
              : filter === 'ALL'
              ? t('meters.filterAll')
              : filter === 'VERIFIED'
              ? t('meters.filterVerified')
              : t('meters.filterRejected');

          return (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all ${
                isActive
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Readings Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
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
              onClick={loadReadings}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-xl shadow-sm transition-all"
            >
              {t('common.refresh')}
            </button>
          </div>
        ) : readings.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Gauge className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-1">{t('meters.emptyList')}</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">{t('meters.emptyListDesc')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-6">{t('meters.thUnit')}</th>
                  <th className="py-3.5 px-4">{t('meters.thType')}</th>
                  <th className="py-3.5 px-4">{t('meters.thValue')}</th>
                  <th className="py-3.5 px-4">{t('meters.thPeriod')}</th>
                  <th className="py-3.5 px-4">{t('meters.thPhoto')}</th>
                  <th className="py-3.5 px-4">{t('meters.thSubmittedBy')}</th>
                  <th className="py-3.5 px-4">{t('meters.thStatus')}</th>
                  <th className="py-3.5 px-6 text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {readings.map((reading) => {
                  const isProcessing = processingId === reading.id;
                  const unitNumber = reading.meter?.unit?.unitNumber || '-';
                  const blockName = reading.meter?.unit?.building?.blockName || t('common.block');

                  return (
                    <tr key={reading.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Unit */}
                      <td className="py-4 px-6">
                        <div className="font-semibold text-slate-900">
                          {t('common.unitShort')} {unitNumber}
                        </div>
                        <div className="text-xs text-slate-400 font-medium">{blockName}</div>
                      </td>

                      {/* Type */}
                      <td className="py-4 px-4">
                        {getMeterTypeBadge(reading.meter?.type)}
                        {reading.meter?.serialNumber && (
                          <div className="text-[11px] text-slate-400 mt-1 font-mono">
                            {t('meters.serialNumber', { number: reading.meter.serialNumber })}
                          </div>
                        )}
                      </td>

                      {/* Value */}
                      <td className="py-4 px-4">
                        <div className="font-bold text-slate-900 text-base font-mono">
                          {reading.value.toLocaleString()}
                        </div>
                      </td>

                      {/* Period */}
                      <td className="py-4 px-4 font-medium text-slate-600">
                        {String(reading.periodMonth).padStart(2, '0')}.{reading.periodYear}
                      </td>

                      {/* Photo */}
                      <td className="py-4 px-4">
                        {reading.photoUrl ? (
                          <button
                            onClick={() => setPreviewPhotoUrl(reading.photoUrl)}
                            className="group flex items-center gap-1.5 px-2 py-1 rounded-lg border border-slate-200 hover:border-sky-400 bg-white text-xs font-semibold text-sky-700 shadow-sm transition-all"
                          >
                            <Eye className="w-3.5 h-3.5 text-sky-500 group-hover:scale-110 transition-transform" />
                            <span>{t('meters.viewPhoto')}</span>
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400 italic">{t('meters.noPhoto')}</span>
                        )}
                      </td>

                      {/* Submitted by */}
                      <td className="py-4 px-4">
                        <div className="font-medium text-slate-800">
                          {reading.submittedBy
                            ? `${reading.submittedBy.firstName} ${reading.submittedBy.lastName}`
                            : '-'}
                        </div>
                        <div className="text-xs text-slate-400">
                          {reading.submittedBy?.phone || ''}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4">
                        {getStatusBadge(reading.status)}
                        {reading.reviewNote && (
                          <div className="text-[11px] text-rose-600 mt-1 max-w-xs truncate" title={reading.reviewNote}>
                            {t('meters.note', { note: reading.reviewNote })}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openHistoryDrawer(reading.meter)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                            title={t('meters.historyBtn')}
                          >
                            <History className="w-4 h-4" />
                          </button>

                          {canReview && reading.status === 'PENDING' && (
                            <>
                              <button
                                onClick={() => handleVerify(reading)}
                                disabled={isProcessing}
                                className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all disabled:opacity-50"
                                title={t('meters.verifyBtn')}
                              >
                                {isProcessing ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Check className="w-3.5 h-3.5" />
                                )}
                                <span>{t('meters.verifyBtn')}</span>
                              </button>

                              <button
                                onClick={() => openRejectModal(reading)}
                                disabled={isProcessing}
                                className="flex items-center gap-1 px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold rounded-lg transition-all disabled:opacity-50"
                                title={t('meters.rejectBtn')}
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>{t('meters.rejectBtn')}</span>
                              </button>
                            </>
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

      {/* REJECT MODAL */}
      {rejectModalReading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                {t('meters.rejectModalTitle')}
              </h3>
              <button
                onClick={() => setRejectModalReading(null)}
                className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 border border-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmReject} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  {t('meters.rejectReasonLabel')}
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder={t('meters.rejectReasonPlaceholder')}
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRejectModalReading(null)}
                  disabled={isRejecting}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  {t('meters.cancelBtn')}
                </button>
                <button
                  type="submit"
                  disabled={isRejecting}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {isRejecting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{t('meters.confirmRejectBtn')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PHOTO PREVIEW MODAL */}
      {previewPhotoUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative bg-white rounded-2xl max-w-2xl w-full p-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">{t('meters.photoModalTitle')}</h3>
              <button
                onClick={() => setPreviewPhotoUrl(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-4 flex items-center justify-center bg-slate-950 rounded-xl overflow-hidden max-h-[70vh]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewPhotoUrl}
                alt="Meter Reading Verification"
                className="object-contain max-h-[70vh] w-auto"
              />
            </div>
          </div>
        </div>
      )}

      {/* HISTORY DRAWER */}
      {historyDrawerMeter && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md bg-white shadow-2xl border-l border-slate-200 flex flex-col">
              {/* Drawer Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {t('meters.historyTitle')}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t('meters.historySubtitle')}
                  </p>
                </div>
                <button
                  onClick={() => setHistoryDrawerMeter(null)}
                  className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 border border-slate-200 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Meter Info Card */}
              <div className="p-6 border-b border-slate-100 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-bold text-slate-900 flex items-center gap-2">
                    <Building className="w-4 h-4 text-sky-600" />
                    {historyDrawerMeter.unit
                      ? `${t('common.unitShort')} ${historyDrawerMeter.unit.unitNumber} (${historyDrawerMeter.unit.building?.blockName || t('common.block')})`
                      : ''}
                  </div>
                  {getMeterTypeBadge(historyDrawerMeter.type)}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                      {t('meters.thValue')}
                    </span>
                    <span className="font-mono font-bold text-slate-800">
                      {t('meters.initialValue', { value: historyDrawerMeter.initialValue })}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                      {t('meters.serialNumber', { number: '' }).replace(':', '')}
                    </span>
                    <span className="font-mono font-bold text-slate-800 truncate block">
                      {historyDrawerMeter.serialNumber || '-'}
                    </span>
                  </div>
                </div>
              </div>

              {/* History Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {loadingHistory ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin text-sky-600" />
                    <p className="text-xs font-medium">{t('meters.loadingHistory')}</p>
                  </div>
                ) : meterHistory.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    {t('meters.emptyList')}
                  </div>
                ) : (
                  meterHistory.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">
                          {String(item.periodMonth).padStart(2, '0')}.{item.periodYear}
                        </span>
                        {getStatusBadge(item.status)}
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xl font-bold font-mono text-slate-900">
                          {item.value.toLocaleString()}
                        </span>
                        {item.photoUrl && (
                          <button
                            onClick={() => setPreviewPhotoUrl(item.photoUrl)}
                            className="px-2 py-1 text-xs font-semibold text-sky-600 hover:bg-sky-50 rounded-lg transition-colors border border-sky-100"
                          >
                            {t('meters.viewPhoto')}
                          </button>
                        )}
                      </div>

                      {item.reviewNote && (
                        <div className="text-xs text-rose-600 bg-rose-50 p-2 rounded-lg border border-rose-100">
                          {t('meters.note', { note: item.reviewNote })}
                        </div>
                      )}

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                        <span>
                          {item.submittedBy
                            ? `${item.submittedBy.firstName} ${item.submittedBy.lastName}`
                            : ''}
                        </span>
                        <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Drawer Footer */}
              <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                <button
                  onClick={() => setHistoryDrawerMeter(null)}
                  className="w-full py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-all"
                >
                  {t('meters.closeBtn')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
