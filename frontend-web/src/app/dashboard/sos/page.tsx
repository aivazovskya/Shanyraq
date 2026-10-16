'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Phone,
  MapPin,
  ExternalLink,
  Shield,
  Loader2,
  RefreshCw,
  Home,
  FileText,
  Activity,
  Calendar,
  Download,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { apiRequest, apiDownload, getStoredSession, AuthUser } from '@/lib/api';
import Link from 'next/link';
import { Dialog } from '@/components/Dialog';
import { getApiErrorMessage } from '@/lib/api';
import { createRealtimeSocket } from '@/lib/socket';

export interface SosStatistics {
  totalAlerts: number;
  byStatus: {
    ACTIVE: number;
    RESOLVED: number;
    FALSE_ALARM: number;
  };
  averageResponseTimeMinutes: number;
  dailyTrend: Array<{ date: string; count: number }>;
}

interface SosAlertItem {
  id: string;
  tenantId: string;
  unitId: string | null;
  triggeredById: string;
  latitude: number | null;
  longitude: number | null;
  status: 'ACTIVE' | 'RESOLVED' | 'FALSE_ALARM';
  acceptedById: string | null;
  acceptedAt: string | null;
  acceptedBy?: { id: string; firstName: string; lastName: string } | null;
  resolvedById: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
  unit?: {
    id: string;
    unitNumber: string;
    building?: {
      blockName: string;
    };
  } | null;
  triggeredBy?: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
  } | null;
  resolvedBy?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
}

export default function SosDashboardPage() {
  const { t, i18n } = useTranslation();
  const statsController = useRef<AbortController | null>(null);
  const alertsController = useRef<AbortController | null>(null);
  const [alertsLoaded, setAlertsLoaded] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [tenantId, setTenantId] = useState<string>('');
  const [alerts, setAlerts] = useState<SosAlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Statistics state
  const [stats, setStats] = useState<SosStatistics | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Modal state
  const [selectedAlert, setSelectedAlert] = useState<SosAlertItem | null>(null);
  const [targetStatus, setTargetStatus] = useState<'RESOLVED' | 'FALSE_ALARM'>('RESOLVED');
  const [resolutionNote, setResolutionNote] = useState('');
  const [resolving, setResolving] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Update elapsed time timer every 10 seconds
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  const loadAlerts = useCallback(async (tId: string, isSilent = false) => {
    if (!tId) return;
    alertsController.current?.abort();
    const controller = new AbortController();
    alertsController.current = controller;
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setErrorMsg(null);

    try {
      const data = await apiRequest<SosAlertItem[]>(`/sos/tenants/${tId}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setAlerts(data || []);
      setAlertsLoaded(true);
    } catch (err: any) {
      if (controller.signal.aborted) return;
      setErrorMsg(getApiErrorMessage(err, t));
    } finally {
      if (!controller.signal.aborted) { setLoading(false); setRefreshing(false); }
    }
  }, [t]);

  const loadStats = useCallback(async (tId: string, fromStr?: string, toStr?: string) => {
    if (!tId) return;
    statsController.current?.abort();
    const controller = new AbortController();
    statsController.current = controller;
    setLoadingStats(true);
    setStatsError(null);
    setStats(null);
    try {
      if (fromStr && toStr && fromStr > toStr) throw new Error(t('uiPolish.invalidDates'));
      const params = new URLSearchParams();
      if (fromStr) params.set('from', fromStr);
      if (toStr) params.set('to', toStr);
      const queryStr = params.toString() ? `?${params.toString()}` : '';
      const data = await apiRequest<SosStatistics>(`/sos/tenants/${tId}/statistics${queryStr}`, { signal: controller.signal });
      if (!controller.signal.aborted) setStats(data);
    } catch (err: any) {
      if (!controller.signal.aborted) setStatsError(getApiErrorMessage(err, t));
    } finally {
      if (!controller.signal.aborted) setLoadingStats(false);
    }
  }, [t]);

  useEffect(() => () => { alertsController.current?.abort(); statsController.current?.abort(); }, []);

  useEffect(() => {
    const session = getStoredSession();
    if (session?.user) {
      setCurrentUser(session.user);
      const effectiveTenantId = session.user.tenantId;
      if (!effectiveTenantId) {
        setErrorMsg(t('common.userNotAuthorizedOrLinked'));
        setLoading(false);
        return;
      }
      setTenantId(effectiveTenantId);
      loadAlerts(effectiveTenantId);
    } else {
      setErrorMsg(t('common.userNotAuthorizedOrLinked'));
      setLoading(false);
    }
  }, [loadAlerts, t]);

  useEffect(() => {
    if (tenantId) {
      loadStats(tenantId, dateFrom, dateTo);
    }
  }, [tenantId, dateFrom, dateTo, loadStats]);

  // Real-time WebSocket: подключение к комнате SOS жилого комплекса
  useEffect(() => {
    if (!tenantId) return;

    const socket = createRealtimeSocket();
    if (!socket) return;

    socket.on('connect', () => {
      socket.emit('sos:join', { tenantId });
      // Reconciliation fetch при первичном подключении
      loadAlerts(tenantId, true);
      loadStats(tenantId, dateFrom, dateTo);
    });

    socket.on('reconnect', () => {
      socket.emit('sos:join', { tenantId });
      // Reconciliation fetch при реконнекте
      loadAlerts(tenantId, true);
      loadStats(tenantId, dateFrom, dateTo);
    });

    socket.on('sos:alert:triggered', (newAlert: SosAlertItem) => {
      setAlerts((prev) => {
        const index = prev.findIndex((a) => a.id === newAlert.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = newAlert;
          return updated;
        }
        return [newAlert, ...prev];
      });
      loadStats(tenantId, dateFrom, dateTo);
    });

    socket.on('sos:alert:updated', (updatedAlert: SosAlertItem) => {
      setAlerts((prev) =>
        prev.map((a) => (a.id === updatedAlert.id ? updatedAlert : a)),
      );
      loadStats(tenantId, dateFrom, dateTo);
    });

    return () => {
      socket.disconnect();
    };
  }, [tenantId, loadAlerts, loadStats, dateFrom, dateTo]);

  // CSV Export state
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const isChairman = currentUser?.role === 'HOA_CHAIRMAN';
  const canProcess = ['SECURITY', 'DISPATCHER', 'HOA_ADMIN', 'SUPERADMIN'].includes(currentUser?.role || '');
  const canExportCsv = ['SECURITY', 'DISPATCHER', 'HOA_ADMIN', 'HOA_CHAIRMAN', 'SUPERADMIN'].includes(
    currentUser?.role || '',
  );

  const handleExportCsv = async () => {
    if (!tenantId) return;
    setExportingCsv(true);
    setExportError(null);
    try {
      const queryParams = new URLSearchParams();
      if (dateFrom) queryParams.set('from', dateFrom);
      if (dateTo) queryParams.set('to', dateTo);
      const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
      await apiDownload(
        `/sos/tenants/${tenantId}/alerts/export${queryString}`,
        `sos-alerts-${tenantId}.csv`,
      );
    } catch (err: any) {
      setExportError(err.message || t('sos.exportError'));
      setTimeout(() => setExportError(null), 5000);
    } finally {
      setExportingCsv(false);
    }
  };

  const handleOpenResolveModal = (alert: SosAlertItem, status: 'RESOLVED' | 'FALSE_ALARM') => {
    setResolveError(null);
    setSelectedAlert(alert);
    setTargetStatus(status);
    setResolutionNote('');
  };

  const handleConfirmResolve = async () => {
    if (!selectedAlert || !resolutionNote.trim() || resolving) return;
    setResolveError(null);
    setResolving(true);
    try {
      await apiRequest(`/sos/${selectedAlert.id}/resolve`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: targetStatus,
          note: resolutionNote.trim() || undefined,
        }),
      });
      setSelectedAlert(null);
      setSuccess(true);
      await Promise.all([
        loadAlerts(tenantId, true),
        loadStats(tenantId, dateFrom, dateTo),
      ]);
    } catch (err: any) {
      await loadAlerts(tenantId, true);
      setResolveError(getApiErrorMessage(err, t));
    } finally {
      setResolving(false);
    }
  };

  const handleAccept = async (item: SosAlertItem) => {
    if (acceptingId) return;
    setAcceptingId(item.id);
    setSuccess(false);
    try {
      const updated = await apiRequest<SosAlertItem>(`/sos/${item.id}/accept`, { method: 'PATCH' });
      setAlerts((prev) => prev.map((alert) => alert.id === updated.id ? updated : alert));
      setErrorMsg(null);
    } catch (error) {
      await loadAlerts(tenantId, true);
      setErrorMsg(getApiErrorMessage(error, t));
    } finally { setAcceptingId(null); }
  };

  const activeAlerts = alerts.filter((a) => a.status === 'ACTIVE').sort((a, b) => Number(!!a.acceptedById) - Number(!!b.acceptedById) || Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const historyAlerts = alerts.filter((a) => a.status !== 'ACTIVE');

  const formatElapsed = (createdAtStr: string) => {
    const diffSec = Math.max(0, Math.floor((now - new Date(createdAtStr).getTime()) / 1000));
    if (diffSec < 60) return `${diffSec} ${t('sos.timeSec')}`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} ${t('sos.timeMin')}`;
    const diffHours = Math.floor(diffMin / 60);
    return `${diffHours} ${t('sos.timeHour')} ${diffMin % 60} ${t('sos.timeMin')}`;
  };

  if (loading) {
    return (
      <div role="status" aria-label={t('common.loading')} className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-red-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg text-red-600">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{t('sos.title')}</h1>
              <p className="text-sm text-slate-500">{t('sos.subtitle')}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isChairman && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
              <Shield className="h-3.5 w-3.5 mr-1" />
              {t('sos.readOnlyNotice')}
            </span>
          )}

          <button
            onClick={() => {
              loadAlerts(tenantId, true);
              loadStats(tenantId, dateFrom, dateTo);
            }}
            disabled={refreshing}
            className="inline-flex items-center min-h-11 px-4 py-2 border border-slate-200 text-sm font-semibold rounded-xl text-slate-700 bg-white hover:bg-slate-50 focus:outline-none"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin text-red-600' : ''}`} />
            {t('common.refresh')}
          </button>
        </div>
      </div>

      {success && <p role="status" className="rounded-xl bg-green-50 p-4 text-sm text-green-800">
        {t('sosFlow.saved')} <Link href="/dashboard/shift-handover" className="font-semibold underline">{t('sosFlow.journal')}</Link>
      </p>}
      {errorMsg && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {errorMsg}
        </div>
      )}

      {/* ACTIVE ALERTS SECTION */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">{t('sos.activeAlerts')}</h2>
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-700">
              {alertsLoaded ? activeAlerts.length : '—'}
            </span>
          </div>
        </div>

        {!alertsLoaded ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><p>{t('uiPolish.alertsUnavailable')}</p><button className="mt-2 min-h-11 font-semibold underline" onClick={() => loadAlerts(tenantId, true)}>{t('common.refresh')}</button></div> : activeAlerts.length === 0 ? (
          <div className="p-8 text-center bg-white border border-slate-200 rounded-xl shadow-sm">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-500 mb-3" />
            <p className="text-base font-medium text-slate-900">{t('sos.noActiveAlerts')}</p>
            <p className="text-sm text-slate-500 mt-1">{t('sos.allAlertsHandled')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
            {activeAlerts.map((alert) => {
              const residentName = alert.triggeredBy
                ? `${alert.triggeredBy.firstName} ${alert.triggeredBy.lastName}`.trim()
                : t('sos.residentFallback');
              const phone = alert.triggeredBy?.phone || '';
              const unitStr = alert.unit
                ? `${alert.unit.building?.blockName ? alert.unit.building.blockName + ', ' : ''}${t('common.unitShort')} ${alert.unit.unitNumber}`
                : null;
              const hasCoords = alert.latitude != null && alert.longitude != null;

              return (
                <div
                  key={alert.id}
                  className={`bg-white border ${alert.acceptedById ? 'border-amber-200' : 'border-red-300'} rounded-2xl p-4 sm:p-5 flex min-w-0 flex-col justify-between`}
                >
                  <div className={`mb-4 flex w-fit items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold tabular-nums ${alert.acceptedById ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700'}`}>
                    <Clock className="h-3 w-3" />
                    <span>{formatElapsed(alert.createdAt)}</span>
                  </div>

                  <div>
                    <div className="flex items-start gap-3 mb-4">
                      <div className="p-2.5 bg-red-100 rounded-full text-red-600 flex-shrink-0">
                        <AlertTriangle className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="break-words text-base font-semibold text-slate-900">{residentName}</h3>
                        <p className="text-xs text-red-600 font-semibold uppercase tracking-wider">
                          {t(alert.acceptedById ? 'sosFlow.inProgress' : 'sosFlow.waiting')}
                        </p>
                        {alert.acceptedBy && <p className="mt-1 text-sm text-slate-600">{t('sosFlow.acceptedBy')}: {alert.acceptedBy.firstName} {alert.acceptedBy.lastName}{alert.acceptedAt && <span className="block text-xs">{new Date(alert.acceptedAt).toLocaleString()}</span>}</p>}
                      </div>
                    </div>

                    <div className="space-y-2 text-sm text-slate-700 bg-red-50/50 p-3 rounded-lg border border-red-100 mb-4">
                      {unitStr && (
                        <div className="flex items-center gap-2">
                          <Home className="h-4 w-4 text-slate-400 flex-shrink-0" />
                          <span className="font-medium text-slate-900">{unitStr}</span>
                        </div>
                      )}

                      {phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-slate-400 flex-shrink-0" />
                          <a
                            href={`tel:${phone}`}
                            className="font-bold text-blue-600 hover:underline flex items-center gap-1"
                          >
                            {phone}
                          </a>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-slate-400 flex-shrink-0" />
                        <span className="text-xs text-slate-500">
                          {new Date(alert.createdAt).toLocaleTimeString()} ({new Date(alert.createdAt).toLocaleDateString()})
                        </span>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <MapPin className="h-4 w-4 text-red-500 flex-shrink-0" />
                        {hasCoords ? (
                          <a
                            href={`https://maps.google.com/?q=${alert.latitude},${alert.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-xs font-semibold text-red-600 hover:text-red-700 hover:underline"
                          >
                            <span>{t('sos.viewOnMap')} ({alert.latitude?.toFixed(4)}, {alert.longitude?.toFixed(4)})</span>
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400 italic">{t('sos.noLocation')}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {canProcess && !alert.acceptedById && <button onClick={() => handleAccept(alert)} disabled={!!acceptingId}
                    className="mt-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                    {acceptingId === alert.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}{t('sosFlow.accept')}
                  </button>}
                  {canProcess && alert.acceptedById === currentUser?.id && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                      <button
                        onClick={() => handleOpenResolveModal(alert, 'RESOLVED')}
                        className="min-h-11 w-full inline-flex justify-center items-center px-3 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-green-600 hover:bg-green-700 shadow-sm"
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1.5" />
                        {t('sos.resolveAction')}
                      </button>
                      <button
                        onClick={() => handleOpenResolveModal(alert, 'FALSE_ALARM')}
                        className="min-h-11 w-full inline-flex justify-center items-center px-3 py-2 border border-slate-300 text-sm font-medium rounded-lg text-slate-700 bg-white hover:bg-slate-50 shadow-sm"
                      >
                        <XCircle className="h-4 w-4 mr-1.5 text-slate-400" />
                        {t('sos.falseAlarmAction')}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* STATISTICS & TRENDS SECTION */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Activity className="h-5 w-5 text-red-600" />
              {t('sos.statsTitle')}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{t('sos.statsSubtitle')}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <label htmlFor="sos-date-from" className="text-xs font-medium text-slate-600">{t('sos.periodFrom')}</label>
            <input
              type="date" id="sos-date-from" max={dateTo || undefined}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="min-h-11 min-w-0 max-w-full px-2.5 py-2 border border-slate-200 rounded-xl text-sm font-medium focus:ring-1 focus:ring-red-500 focus:border-red-500 outline-none"
            />
            <label htmlFor="sos-date-to" className="text-xs font-medium text-slate-600">{t('sos.periodTo')}</label>
            <input
              type="date" id="sos-date-to" min={dateFrom || undefined}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="min-h-11 min-w-0 max-w-full px-2.5 py-2 border border-slate-200 rounded-xl text-sm font-medium focus:ring-1 focus:ring-red-500 focus:border-red-500 outline-none"
            />
            {canExportCsv && (
              <button
                onClick={handleExportCsv}
                disabled={exportingCsv || !!(dateFrom && dateTo && dateFrom > dateTo)}
                className="min-h-11 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 disabled:opacity-60 shadow-sm"
              >
                {exportingCsv ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{t('sos.exportingCsv')}</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>{t('sos.exportCsvBtn')}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {exportError && (
          <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{exportError}</span>
            </div>
            <button onClick={() => setExportError(null)} aria-label={t('common.cancel')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-red-600 hover:bg-red-100">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}

        {statsError && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p>{statsError}</p><button className="mt-2 min-h-11 font-semibold underline" onClick={() => loadStats(tenantId, dateFrom, dateTo)}>{t('common.refresh')}</button></div>}
        {/* 4 Compact KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-4">
          {/* Card 1: Total Alerts */}
          <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/70 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">{t('sos.totalAlerts')}</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {loadingStats ? '...' : (stats?.totalAlerts ?? '—')}
              </p>
            </div>
            <div className="p-2.5 bg-red-100/80 rounded-lg text-red-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>

          {/* Card 2: Active Now */}
          <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/70 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">{t('sos.activeNow')}</p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-2xl font-bold text-slate-900">{alertsLoaded ? activeAlerts.length : '—'}</p>
                {activeAlerts.length > 0 && (
                  <span className="h-2 w-2 rounded-full bg-red-600" aria-hidden="true" />
                )}
              </div>
            </div>
            <div className="p-2.5 bg-amber-100/80 rounded-lg text-amber-600">
              <Clock className="h-5 w-5" />
            </div>
          </div>

          {/* Card 3: Average Response Time */}
          <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/70 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">{t('sos.avgResponseTime')}</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {loadingStats ? '...' : stats ? `${stats.averageResponseTimeMinutes} ${t('sos.timeMin')}` : '—'}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {t('sos.avgResponseTimeExcludesFalseAlarms')}
              </p>
            </div>
            <div className="p-2.5 bg-blue-100/80 rounded-lg text-blue-600">
              <Clock className="h-5 w-5" />
            </div>
          </div>

          {/* Card 4: Resolved vs False Alarm */}
          <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/70 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">{t('sos.resolvedVsFalse')}</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {loadingStats ? '...' : stats ? `${stats.byStatus.RESOLVED} / ${stats.byStatus.FALSE_ALARM}` : '—'}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {t('sos.resolvedCount')}: {stats?.byStatus.RESOLVED ?? '—'} · {t('sos.falseAlarmCount')}: {stats?.byStatus.FALSE_ALARM ?? '—'}
              </p>
            </div>
            <div className="p-2.5 bg-green-100/80 rounded-lg text-green-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Daily Trend Chart */}
        {(loadingStats || stats) && <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            {t('sos.dailyTrend')}
          </h3>
          <div className="h-56 w-full pt-2">
            {loadingStats && <p role="status" className="flex h-full items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{t('common.loading')}</p>}
            {isMounted && stats && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats?.dailyTrend || []}
                  margin={{ top: 10, right: 10, left: -25, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickFormatter={(val: string) => {
                      try {
                        const parts = val.split('-');
                        return `${parts[2]}.${parts[1]}`;
                      } catch {
                        return val;
                      }
                    }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                  />
                  <Tooltip
                    formatter={(value: any) => [value, t('sos.alertsCount')]}
                    labelFormatter={(label: any) => label}
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="count" fill="#0284c7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>}
      </div>

      {/* HISTORY SECTION */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mt-8">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">{t('sos.history')}</h2>
        </div>

        {!alertsLoaded ? <p className="p-6 text-sm text-slate-500">{t('uiPolish.alertsUnavailable')}</p> : historyAlerts.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            {t('sos.noHistoryAlerts')}
          </div>
        ) : (
          <>
          <div className="divide-y divide-slate-100 md:hidden">
            {historyAlerts.map((item) => <article key={item.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${item.status === 'RESOLVED' ? 'bg-green-50 text-green-800' : 'bg-slate-100 text-slate-700'}`}>{t(`sos.status.${item.status}`)}</span><time className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString(i18n.language)}</time></div>
              <p className="break-words text-sm font-semibold text-slate-900">{item.triggeredBy ? `${item.triggeredBy.firstName} ${item.triggeredBy.lastName}` : t('sos.residentFallback')}</p>
              {item.unit && <p className="text-sm text-slate-600">{item.unit.building?.blockName} · {t('common.unitShort')} {item.unit.unitNumber}</p>}
              {item.triggeredBy?.phone && <a href={`tel:${item.triggeredBy.phone}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-sky-700"><Phone size={16} />{item.triggeredBy.phone}</a>}
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{item.resolutionNote || '—'}</p>
              {item.resolvedBy && <p className="text-xs text-slate-500">{t('sos.resolvedBy')}: {item.resolvedBy.firstName} {item.resolvedBy.lastName}{item.resolvedAt && ` · ${new Date(item.resolvedAt).toLocaleString(i18n.language)}`}</p>}
            </article>)}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-6 py-3 text-left font-medium">{t('sos.time')}</th>
                  <th className="px-6 py-3 text-left font-medium">{t('sos.triggeredBy')}</th>
                  <th className="px-6 py-3 text-left font-medium">{t('sos.unit')}</th>
                  <th className="px-6 py-3 text-left font-medium">{t('sos.phone')}</th>
                  <th className="px-6 py-3 text-left font-medium">{t('sos.statusHeader')}</th>
                  <th className="px-6 py-3 text-left font-medium">{t('sos.resolvedBy')}</th>
                  <th className="px-6 py-3 text-left font-medium">{t('sos.noteHeader')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {historyAlerts.map((alert) => {
                  const residentName = alert.triggeredBy
                    ? `${alert.triggeredBy.firstName} ${alert.triggeredBy.lastName}`.trim()
                    : '—';
                  const resolverName = alert.resolvedBy
                    ? `${alert.resolvedBy.firstName} ${alert.resolvedBy.lastName}`.trim()
                    : '—';
                  const unitStr = alert.unit
                    ? `${alert.unit.building?.blockName ? alert.unit.building.blockName + ', ' : ''}${t('common.unitShort')} ${alert.unit.unitNumber}`
                    : '—';

                  return (
                    <tr key={alert.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 whitespace-nowrap text-slate-600">
                        {new Date(alert.createdAt).toLocaleString(i18n.language)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-900">
                        {residentName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-600">
                        {unitStr}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-600">
                        {alert.triggeredBy?.phone ? (
                          <a href={`tel:${alert.triggeredBy.phone}`} className="text-blue-600 hover:underline">
                            {alert.triggeredBy.phone}
                          </a>
                        ) : '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            alert.status === 'RESOLVED'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {alert.status === 'RESOLVED' ? t('sos.status.RESOLVED') : t('sos.status.FALSE_ALARM')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-600">
                        <div>{resolverName}</div>
                        {alert.resolvedAt && (
                          <div className="text-xs text-slate-400">
                            {new Date(alert.resolvedAt).toLocaleTimeString()}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-500 max-w-sm whitespace-pre-wrap break-words">
                        {alert.resolutionNote || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {/* RESOLVE / FALSE ALARM MODAL */}
      {selectedAlert && (
        <Dialog labelledBy="sos-resolution-title" onClose={() => { if (!resolving) setSelectedAlert(null); }}>
          <form onSubmit={(event) => { event.preventDefault(); handleConfirmResolve(); }} className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 id="sos-resolution-title" className="text-lg font-bold text-slate-900 flex items-center gap-2">
                {targetStatus === 'RESOLVED' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-amber-500" />
                )}
                {t('sos.resolveModalTitle')}
              </h3>
              <button
                disabled={resolving}
                type="button" aria-label={t('common.cancel')}
                onClick={() => setSelectedAlert(null)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="text-sm text-slate-600 space-y-1 bg-slate-50 p-3 rounded-lg">
              <div>
                <strong>{t('sos.triggeredBy')}:</strong>{' '}
                {selectedAlert.triggeredBy
                  ? `${selectedAlert.triggeredBy.firstName} ${selectedAlert.triggeredBy.lastName}`
                  : '—'}
              </div>
              {selectedAlert.unit && (
                <div>
                  <strong>{t('sos.unit')}:</strong> {t('common.unitShort')} {selectedAlert.unit.unitNumber}
                </div>
              )}
              <div>
                <strong>{t('sos.statusHeader')}:</strong>{' '}
                <span className="font-semibold text-slate-900">
                  {targetStatus === 'RESOLVED' ? t('sos.status.RESOLVED') : t('sos.status.FALSE_ALARM')}
                </span>
              </div>
            </div>

            <div>
              <label htmlFor="sos-resolution-note" className="block text-sm font-medium text-slate-700 mb-1">
                {t('sosFlow.resultLabel')}
              </label>
              <textarea id="sos-resolution-note" required maxLength={1600} disabled={resolving}
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                placeholder={t('sos.resolutionNotePlaceholder')}
                rows={3}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-red-500 focus:outline-none"
              />
            </div>

            <p className="text-sm text-slate-600">{t('sosFlow.journalHint')}</p>
            {resolveError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{resolveError}</p>}
            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={resolving}
                onClick={() => setSelectedAlert(null)}
                className="min-h-11 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-xl"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={resolving || !resolutionNote.trim()}
                className={`inline-flex min-h-11 items-center justify-center px-4 py-2 text-sm font-semibold text-white rounded-xl disabled:opacity-50 ${
                  targetStatus === 'RESOLVED'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {resolving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    {t('sos.resolving')}
                  </>
                ) : (
                  t('sos.confirmResolve')
                )}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
