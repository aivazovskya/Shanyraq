'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  Calendar,
  Layers,
  CheckCircle2,
  XCircle,
  RefreshCw,
  X,
  Check,
  AlertCircle,
  Clock,
  Filter,
} from 'lucide-react';
import { apiRequest, getStoredSession } from '@/lib/api';

interface BookingItem {
  id: string;
  resourceId: string;
  unitId: string;
  bookedById: string;
  startTime: string;
  endTime: string;
  status: 'CONFIRMED' | 'CANCELLED';
  note?: string | null;
  createdAt: string;
  resource: {
    id: string;
    name: string;
    type: string;
  };
  unit: {
    id: string;
    unitNumber: string;
    building?: {
      id: string;
      blockName: string;
    };
  };
  bookedBy: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
  };
  cancelledBy?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
}

interface BookableResource {
  id: string;
  name: string;
  type: string;
}

export default function BookingsModerationPage() {
  const { t } = useTranslation();
  const session = getStoredSession();
  const tenantId = session?.user?.tenantId;
  const canManage = ['SUPERADMIN', 'HOA_ADMIN', 'DISPATCHER', 'HOA_CHAIRMAN'].includes(
    session?.user?.role || '',
  );

  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [resources, setResources] = useState<BookableResource[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedResource, setSelectedResource] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CONFIRMED' | 'CANCELLED'>('ALL');

  // Cancel modal
  const [cancellingBooking, setCancellingBooking] = useState<BookingItem | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchResources = useCallback(async () => {
    if (!tenantId) return;
    try {
      const data = await apiRequest<BookableResource[]>(`/bookings/tenants/${tenantId}/resources`);
      setResources(data);
    } catch (err: any) {
      console.warn('Failed to load resources:', err);
    }
  }, [tenantId]);

  const fetchBookings = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedResource) params.append('resourceId', selectedResource);
      if (dateFrom) params.append('from', new Date(dateFrom).toISOString());
      if (dateTo) {
        const toObj = new Date(dateTo);
        toObj.setHours(23, 59, 59, 999);
        params.append('to', toObj.toISOString());
      }

      const qs = params.toString();
      const url = `/bookings/tenants/${tenantId}/bookings${qs ? `?${qs}` : ''}`;
      const data = await apiRequest<BookingItem[]>(url);
      setBookings(data);
    } catch (err: any) {
      console.warn('Failed to load bookings:', err);
    } finally {
      setLoading(false);
    }
  }, [tenantId, selectedResource, dateFrom, dateTo]);

  useEffect(() => {
    fetchResources();
    fetchBookings();
  }, [fetchResources, fetchBookings]);

  const handleCancelBooking = async () => {
    if (!cancellingBooking) return;
    setIsCancelling(true);
    setActionError(null);
    try {
      await apiRequest(`/bookings/${cancellingBooking.id}/cancel`, {
        method: 'PATCH',
      });
      setCancellingBooking(null);
      setActionSuccess(t('bookings.cancelSuccess'));
      setTimeout(() => setActionSuccess(null), 4000);
      await fetchBookings();
    } catch (err: any) {
      setActionError(err.message || 'Error cancelling booking');
    } finally {
      setIsCancelling(false);
    }
  };

  const filteredBookings = bookings.filter((b) => {
    if (statusFilter !== 'ALL' && b.status !== statusFilter) return false;
    return true;
  });

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('bookings.title')}</h1>
          <p className="text-sm text-slate-500">{t('bookings.subtitle')}</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchBookings}
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium flex items-center gap-2 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-slate-400' : ''}`} />
            {t('bookings.refreshBtn')}
          </button>

          <Link
            href="/dashboard/bookings/resources"
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center gap-2 shadow-sm transition active:scale-95"
          >
            <Layers className="w-4 h-4" />
            {t('bookings.catalogBtn')}
          </Link>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2">
          <Check className="w-5 h-5 text-emerald-600 shrink-0" />
          {actionSuccess}
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">
            {t('bookings.thSpace')}
          </label>
          <select
            value={selectedResource}
            onChange={(e) => setSelectedResource(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="">{t('bookings.filterResource')}</option>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">
            {t('bookings.dateFrom')}
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">
            {t('bookings.dateTo')}
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">
            {t('bookings.thStatus')}
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="ALL">{t('bookings.filterStatus')}</option>
            <option value="CONFIRMED">{t('bookings.statusConfirmed')}</option>
            <option value="CANCELLED">{t('bookings.statusCancelled')}</option>
          </select>
        </div>
      </div>

      {/* Bookings Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filteredBookings.length === 0 && !loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            {t('bookings.noBookings')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">{t('bookings.thSpace')}</th>
                  <th className="py-3.5 px-4">{t('bookings.thResident')}</th>
                  <th className="py-3.5 px-4">{t('bookings.thUnit')}</th>
                  <th className="py-3.5 px-4">{t('bookings.thTime')}</th>
                  <th className="py-3.5 px-4">{t('bookings.thStatus')}</th>
                  <th className="py-3.5 px-4">{t('bookings.thNote')}</th>
                  <th className="py-3.5 px-4 text-right">{t('bookings.thActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredBookings.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      {b.resource?.name || '—'}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-900">
                        {b.bookedBy?.firstName} {b.bookedBy?.lastName}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {b.bookedBy?.phone}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-medium text-slate-900">
                        {b.unit?.unitNumber}
                      </span>
                      {b.unit?.building?.blockName && (
                        <span className="text-[11px] text-slate-500 block">
                          {b.unit.building.blockName}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600">
                      <div>{formatDateTime(b.startTime)}</div>
                      <div className="text-slate-400">до {formatDateTime(b.endTime)}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      {b.status === 'CONFIRMED' ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold text-[11px]">
                          {t('bookings.statusConfirmed')}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold text-[11px]">
                          {t('bookings.statusCancelled')}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 max-w-xs truncate">
                      {b.note || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {b.status === 'CONFIRMED' && canManage && (
                        <button
                          onClick={() => setCancellingBooking(b)}
                          className="px-2.5 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-[11px] font-semibold transition"
                        >
                          {t('bookings.cancelBtn')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cancel Confirmation Modal */}
      {cancellingBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">{t('bookings.cancelModalTitle')}</h3>
              <button
                onClick={() => setCancellingBooking(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {actionError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {actionError}
                </div>
              )}

              <p className="text-sm text-slate-600">
                {t('bookings.cancelModalConfirm')}
              </p>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                <div className="font-semibold text-slate-900">
                  {cancellingBooking.resource?.name}
                </div>
                <div className="text-slate-500">
                  {formatDateTime(cancellingBooking.startTime)} — {formatDateTime(cancellingBooking.endTime)}
                </div>
                <div className="text-slate-500">
                  {cancellingBooking.bookedBy?.firstName} {cancellingBooking.bookedBy?.lastName} (кв. {cancellingBooking.unit?.unitNumber})
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCancellingBooking(null)}
                  disabled={isCancelling}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition"
                >
                  {t('bookings.closeBtn')}
                </button>
                <button
                  type="button"
                  onClick={handleCancelBooking}
                  disabled={isCancelling}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold flex items-center gap-2 transition"
                >
                  {isCancelling ? t('bookings.savingBtn') : t('bookings.cancelBtn')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
