'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  Clock,
  ArrowLeft,
  RefreshCw,
  Layers,
  Users,
  Building,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import { apiRequest, getStoredSession } from '@/lib/api';

interface WaitlistEntry {
  id: string;
  resourceId: string;
  unitId: string;
  userId: string;
  startTime: string;
  endTime: string;
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
  user: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
  };
}

interface BookableResource {
  id: string;
  name: string;
  type: string;
}

interface TenantItem {
  id: string;
  name: string;
  city?: string;
}

export default function BookingsWaitlistPage() {
  const { t, i18n } = useTranslation();
  const session = getStoredSession();
  const isSuper = session?.user?.role === 'SUPERADMIN';

  const [tenantId, setTenantId] = useState<string>(session?.user?.tenantId || '');
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);

  const [resources, setResources] = useState<BookableResource[]>([]);
  const [selectedResource, setSelectedResource] = useState<string>('');
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load tenants list for superadmin
  useEffect(() => {
    if (isSuper) {
      setLoadingTenants(true);
      apiRequest<TenantItem[]>('/properties/tenants')
        .then((data) => {
          setTenants(data || []);
          if (!tenantId && data && data.length > 0) {
            setTenantId(data[0].id);
          }
        })
        .catch((err) => {
          console.warn('Failed to load tenants:', err);
        })
        .finally(() => {
          setLoadingTenants(false);
        });
    }
  }, [isSuper, tenantId]);

  // Load resources for dropdown
  const fetchResources = useCallback(async () => {
    if (!tenantId) {
      setResources([]);
      return;
    }
    try {
      const data = await apiRequest<BookableResource[]>(`/bookings/tenants/${tenantId}/resources`);
      setResources(data || []);
    } catch (err: any) {
      console.warn('Failed to load resources:', err);
    }
  }, [tenantId]);

  // Load waitlist entries
  const fetchWaitlist = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      setEntries([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const qs = selectedResource ? `?resourceId=${encodeURIComponent(selectedResource)}` : '';
      const data = await apiRequest<WaitlistEntry[]>(`/bookings/tenants/${tenantId}/waitlist${qs}`);
      setEntries(data || []);
    } catch (err: any) {
      console.warn('Failed to load waitlist demand:', err);
      setError(err.message || t('bookings.loadError'));
    } finally {
      setLoading(false);
    }
  }, [tenantId, selectedResource, t]);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  useEffect(() => {
    fetchWaitlist();
  }, [fetchWaitlist]);

  // Client-side grouping by resourceId
  const groupedWaitlist = useMemo(() => {
    const map = new Map<string, { resource: WaitlistEntry['resource']; entries: WaitlistEntry[] }>();
    for (const entry of entries) {
      if (!map.has(entry.resourceId)) {
        map.set(entry.resourceId, { resource: entry.resource, entries: [] });
      }
      map.get(entry.resourceId)!.entries.push(entry);
    }
    return Array.from(map.values());
  }, [entries]);

  const getTypeLabel = (tType: string) => {
    switch (tType) {
      case 'BBQ_AREA':
        return t('bookings.typeBbQ');
      case 'COWORKING':
        return t('bookings.typeCoworking');
      case 'GUEST_PARKING':
        return t('bookings.typeParking');
      case 'KIDS_ROOM':
        return t('bookings.typeKids');
      default:
        return t('bookings.typeOther');
    }
  };

  const formatSlot = (startIso: string, endIso: string) => {
    try {
      const s = new Date(startIso);
      const e = new Date(endIso);
      const locale = i18n.language === 'kk' ? 'kk-KZ' : i18n.language === 'en' ? 'en-US' : 'ru-RU';
      const datePart = s.toLocaleDateString(locale, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      const startPart = s.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
      const endPart = e.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
      return `${datePart}, ${startPart} – ${endPart}`;
    } catch {
      return `${startIso} – ${endIso}`;
    }
  };

  const formatDateTime = (iso: string) => {
    try {
      const d = new Date(iso);
      const locale = i18n.language === 'kk' ? 'kk-KZ' : i18n.language === 'en' ? 'en-US' : 'ru-RU';
      return d.toLocaleString(locale, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/dashboard/bookings"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {t('bookings.waitlistBackBtn')}
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{t('bookings.waitlistPageTitle')}</h1>
          <p className="text-sm text-slate-500">{t('bookings.waitlistPageSubtitle')}</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchWaitlist}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium flex items-center gap-2 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-slate-400' : ''}`} />
            {t('bookings.refreshBtn')}
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {isSuper && (
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              {t('shiftHandover.selectTenantPromptTitle') || 'Жилой комплекс'}
            </label>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              disabled={loadingTenants}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              {tenants.map((ten) => (
                <option key={ten.id} value={ten.id}>
                  {ten.name} {ten.city ? `(${ten.city})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">
            {t('bookings.thSpace')}
          </label>
          <select
            value={selectedResource}
            onChange={(e) => setSelectedResource(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="">{t('bookings.waitlistFilterAllResources')}</option>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span>{error}</span>
          <button
            onClick={fetchWaitlist}
            className="ml-auto underline font-semibold text-xs text-red-700 hover:text-red-900"
          >
            {t('common.retry') || 'Повторить'}
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm animate-pulse space-y-4"
            >
              <div className="h-6 w-48 bg-slate-100 rounded-lg" />
              <div className="h-16 bg-slate-50 rounded-xl" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && groupedWaitlist.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm max-w-xl mx-auto my-8">
          <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4 border border-amber-100">
            <Clock className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">
            {t('bookings.waitlistEmptyTitle')}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {t('bookings.waitlistEmptySub')}
          </p>
        </div>
      )}

      {/* Grouped Demand List */}
      {!loading && !error && groupedWaitlist.length > 0 && (
        <div className="space-y-6">
          {groupedWaitlist.map((group) => (
            <div
              key={group.resource.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
            >
              {/* Resource Group Header */}
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100/70 text-emerald-800 flex items-center justify-center font-bold">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">{group.resource.name}</h2>
                    <span className="inline-block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      {getTypeLabel(group.resource.type)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    {t('bookings.waitlistWaitingCount', { count: group.entries.length })}
                  </span>
                </div>
              </div>

              {/* Table of Waiting Entries */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/40 text-slate-500 font-semibold border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-3">{t('bookings.waitlistThUnit')}</th>
                      <th className="px-6 py-3">{t('bookings.waitlistThResident')}</th>
                      <th className="px-6 py-3">{t('bookings.waitlistThSlot')}</th>
                      <th className="px-6 py-3">{t('bookings.waitlistThJoinedAt')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {group.entries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-50/60 transition">
                        {/* Unit info */}
                        <td className="px-6 py-4 font-semibold text-slate-900 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>
                              {t('common.unitShort') || 'кв.'} {entry.unit.unitNumber}
                              {entry.unit.building?.blockName ? ` (${entry.unit.building.blockName})` : ''}
                            </span>
                          </div>
                        </td>

                        {/* Resident info */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="font-semibold text-slate-900">
                            {[entry.user.firstName, entry.user.lastName].filter(Boolean).join(' ') || '—'}
                          </div>
                          <div className="text-[11px] text-slate-500">{entry.user.phone}</div>
                        </td>

                        {/* Requested slot */}
                        <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-900">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            <span>{formatSlot(entry.startTime, entry.endTime)}</span>
                          </div>
                        </td>

                        {/* Joined at */}
                        <td className="px-6 py-4 whitespace-nowrap text-slate-500">
                          <div className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>{formatDateTime(entry.createdAt)}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
