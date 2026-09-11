'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ShieldAlert,
  Download,
  Calendar,
  Filter,
  Loader2,
  UserCheck,
  UserX,
  CreditCard,
  ShoppingBag,
  FileText,
  Building2,
} from 'lucide-react';
import { apiRequest, apiDownload, getStoredSession, AuthUser } from '@/lib/api';

interface AuditLogActor {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface AuditLogEntry {
  id: string;
  tenantId: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, any> | null;
  createdAt: string;
  actor: AuditLogActor | null;
}

export interface TenantItem {
  id: string;
  name: string;
  city?: string;
  address?: string;
}

export default function AuditLogPage() {
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [tenantId, setTenantId] = useState<string>('');
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);

  const [dates] = useState(() => {
    const toDate = new Date();
    const fromDate = new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    return {
      from: fromDate.toISOString().split('T')[0],
      to: toDate.toISOString().split('T')[0],
    };
  });

  const [dateFrom, setDateFrom] = useState(dates.from);
  const [dateTo, setDateTo] = useState(dates.to);
  const [actionFilter, setActionFilter] = useState('ALL');

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExportingCsv] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize session, load tenants for SUPERADMIN or default tenantId for staff
  useEffect(() => {
    const session = getStoredSession();
    if (session?.user) {
      setCurrentUser(session.user);
      const isSuper = session.user.role === 'SUPERADMIN';

      if (isSuper) {
        setLoadingTenants(true);
        apiRequest<TenantItem[]>('/properties/tenants')
          .then((data) => {
            setTenants(data || []);
          })
          .catch((err) => {
            console.error('Failed to load tenants for superadmin:', err);
          })
          .finally(() => {
            setLoadingTenants(false);
          });

        if (session.user.tenantId) {
          setTenantId(session.user.tenantId);
        } else {
          setLoading(false);
        }
      } else {
        const effectiveTenantId = session.user.tenantId;
        if (effectiveTenantId) {
          setTenantId(effectiveTenantId);
        } else {
          setLoading(false);
        }
      }
    } else {
      setLoading(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    if (!tenantId) {
      setLogs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      if (actionFilter && actionFilter !== 'ALL') params.set('action', actionFilter);

      const qs = params.toString() ? `?${params.toString()}` : '';
      const data = await apiRequest<AuditLogEntry[]>(`/audit-log/tenants/${tenantId}${qs}`);
      setLogs(data);
    } catch (err: any) {
      setError(err?.message || 'Error fetching audit logs');
    } finally {
      setLoading(false);
    }
  }, [tenantId, dateFrom, dateTo, actionFilter]);

  useEffect(() => {
    if (tenantId) {
      fetchLogs();
    }
  }, [fetchLogs, tenantId]);

  const handleExportCsv = async () => {
    if (!tenantId) return;
    setExportingCsv(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      if (actionFilter && actionFilter !== 'ALL') params.set('action', actionFilter);

      const qs = params.toString() ? `?${params.toString()}` : '';
      const dateStr = new Date().toISOString().split('T')[0];
      await apiDownload(
        `/audit-log/tenants/${tenantId}/export${qs}`,
        `audit-log-${tenantId}-${dateStr}.csv`,
      );
    } catch (err: any) {
      setError(err?.message || 'Error exporting CSV');
      setTimeout(() => setError(null), 5000);
    } finally {
      setExportingCsv(false);
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'TARIFF_CREATED':
      case 'TARIFF_UPDATED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CreditCard className="w-3.5 h-3.5" />
            {t(`auditLog.actions.${action}`)}
          </span>
        );
      case 'RESIDENT_ACTIVATED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
            <UserCheck className="w-3.5 h-3.5" />
            {t(`auditLog.actions.${action}`)}
          </span>
        );
      case 'RESIDENT_DEACTIVATED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <UserX className="w-3.5 h-3.5" />
            {t(`auditLog.actions.${action}`)}
          </span>
        );
      case 'LISTING_MODERATED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <ShoppingBag className="w-3.5 h-3.5" />
            {t(`auditLog.actions.${action}`)}
          </span>
        );
      case 'OWNERSHIP_VERIFIED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <UserCheck className="w-3.5 h-3.5" />
            {t(`auditLog.actions.${action}`)}
          </span>
        );
      case 'OWNERSHIP_REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
            <UserX className="w-3.5 h-3.5" />
            {t(`auditLog.actions.${action}`)}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700">
            <FileText className="w-3.5 h-3.5" />
            {action}
          </span>
        );
    }
  };

  const formatSummary = (metadata: Record<string, any> | null) => {
    if (!metadata) return '—';
    const parts: string[] = [];

    if (metadata.name) parts.push(`Название: "${metadata.name}"`);
    if (metadata.rate !== undefined) parts.push(`Тариф: ${metadata.rate} ₸`);
    if (metadata.residentName) parts.push(`Жилец: ${metadata.residentName}`);
    if (metadata.reason) parts.push(`Причина: "${metadata.reason}"`);
    if (metadata.sharePercent !== undefined) parts.push(`Доля: ${metadata.sharePercent}%`);
    if (metadata.requestedShare !== undefined) parts.push(`Запрошено: ${metadata.requestedShare}%`);
    if (metadata.after && typeof metadata.after === 'object') {
      const changed = Object.entries(metadata.after)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      if (changed) parts.push(`Изменено: ${changed}`);
    }

    return parts.length > 0 ? parts.join(' • ') : JSON.stringify(metadata);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <ShieldAlert className="w-7 h-7 text-sky-600" />
            {t('auditLog.title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('auditLog.subtitle')}</p>
        </div>

        <div className="flex items-center gap-3">
          {currentUser?.role === 'SUPERADMIN' && (
            <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3 py-1.5 shadow-sm">
              <Building2 className="h-4 w-4 text-sky-600 flex-shrink-0" />
              <select
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                disabled={loadingTenants}
                className="text-sm font-medium text-slate-800 bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="">{t('auditLog.selectTenantPlaceholder')}</option>
                {tenants.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} {item.city ? `(${item.city})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={handleExportCsv}
            disabled={exporting || loading || logs.length === 0 || !tenantId}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition"
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
            ) : (
              <Download className="w-4 h-4 text-slate-500" />
            )}
            {exporting ? t('auditLog.exporting') : t('auditLog.exportCsv')}
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5" />
            {t('auditLog.filterAction')}
          </label>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full text-sm rounded-lg border-slate-200 bg-slate-50 focus:bg-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 px-3 py-2 border"
          >
            <option value="ALL">{t('auditLog.allActions')}</option>
            <option value="TARIFF_CREATED">{t('auditLog.actions.TARIFF_CREATED')}</option>
            <option value="TARIFF_UPDATED">{t('auditLog.actions.TARIFF_UPDATED')}</option>
            <option value="RESIDENT_ACTIVATED">{t('auditLog.actions.RESIDENT_ACTIVATED')}</option>
            <option value="RESIDENT_DEACTIVATED">{t('auditLog.actions.RESIDENT_DEACTIVATED')}</option>
            <option value="LISTING_MODERATED">{t('auditLog.actions.LISTING_MODERATED')}</option>
            <option value="OWNERSHIP_VERIFIED">{t('auditLog.actions.OWNERSHIP_VERIFIED')}</option>
            <option value="OWNERSHIP_REJECTED">{t('auditLog.actions.OWNERSHIP_REJECTED')}</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            {t('auditLog.dateFrom')}
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full text-sm rounded-lg border-slate-200 bg-slate-50 focus:bg-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 px-3 py-2 border"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            {t('auditLog.dateTo')}
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full text-sm rounded-lg border-slate-200 bg-slate-50 focus:bg-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 px-3 py-2 border"
          />
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          {error}
        </div>
      )}

      {/* Log Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {currentUser?.role === 'SUPERADMIN' && !tenantId ? (
          <div className="py-16 text-center text-slate-500 text-sm">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="font-semibold text-slate-700">{t('auditLog.selectTenantPromptTitle')}</p>
            <p className="text-slate-400 text-xs mt-1">{t('auditLog.selectTenantPromptSub')}</p>
          </div>
        ) : loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
            <span className="text-sm font-medium">{t('auditLog.loading')}</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm font-medium">
            {t('auditLog.empty')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">{t('auditLog.columns.date')}</th>
                  <th className="px-6 py-3.5">{t('auditLog.columns.actor')}</th>
                  <th className="px-6 py-3.5">{t('auditLog.columns.action')}</th>
                  <th className="px-6 py-3.5">{t('auditLog.columns.target')}</th>
                  <th className="px-6 py-3.5">{t('auditLog.columns.details')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition">
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500">
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {item.actor ? (
                        <div>
                          <div className="font-medium text-slate-900">
                            {item.actor.firstName} {item.actor.lastName}
                          </div>
                          <div className="text-xs text-slate-400">{item.actor.role}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">
                          {t('auditLog.deletedStaff')}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getActionBadge(item.action)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500">
                      <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                        {item.targetType}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-700 max-w-md break-words">
                      {formatSummary(item.metadata)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
