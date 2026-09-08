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
} from 'lucide-react';
import { apiRequest, getStoredSession, AuthUser } from '@/lib/api';

interface SosAlertItem {
  id: string;
  tenantId: string;
  unitId: string | null;
  triggeredById: string;
  latitude: number | null;
  longitude: number | null;
  status: 'ACTIVE' | 'RESOLVED' | 'FALSE_ALARM';
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
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [tenantId, setTenantId] = useState<string>('');
  const [alerts, setAlerts] = useState<SosAlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Modal state
  const [selectedAlert, setSelectedAlert] = useState<SosAlertItem | null>(null);
  const [targetStatus, setTargetStatus] = useState<'RESOLVED' | 'FALSE_ALARM'>('RESOLVED');
  const [resolutionNote, setResolutionNote] = useState('');
  const [resolving, setResolving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Update elapsed time timer every 10 seconds
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  const loadAlerts = useCallback(async (tId: string, isSilent = false) => {
    if (!tId) return;
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setErrorMsg(null);

    try {
      const data = await apiRequest<SosAlertItem[]>(`/sos/tenants/${tId}`);
      setAlerts(data || []);
    } catch (err: any) {
      console.error('Failed to load SOS alerts:', err);
      if (!isSilent) setErrorMsg(err.message || t('sos.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

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

  // Polling every 15 seconds (Architecture Decision #3)
  useEffect(() => {
    if (!tenantId) return;

    const interval = setInterval(() => {
      loadAlerts(tenantId, true);
    }, 15000);

    return () => clearInterval(interval);
  }, [tenantId, loadAlerts]);

  const isChairman = currentUser?.role === 'HOA_CHAIRMAN';

  const handleOpenResolveModal = (alert: SosAlertItem, status: 'RESOLVED' | 'FALSE_ALARM') => {
    setSelectedAlert(alert);
    setTargetStatus(status);
    setResolutionNote('');
  };

  const handleConfirmResolve = async () => {
    if (!selectedAlert) return;
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
      await loadAlerts(tenantId, true);
    } catch (err: any) {
      alert(err.message || t('sos.resolveError'));
    } finally {
      setResolving(false);
    }
  };

  const activeAlerts = alerts.filter((a) => a.status === 'ACTIVE');
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
      <div className="flex h-64 items-center justify-center">
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
              <h1 className="text-2xl font-bold text-gray-900">{t('sos.title')}</h1>
              <p className="text-sm text-gray-500">{t('sos.subtitle')}</p>
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
            onClick={() => loadAlerts(tenantId, false)}
            disabled={refreshing}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin text-red-600' : ''}`} />
            {t('common.refresh')}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {errorMsg}
        </div>
      )}

      {/* ACTIVE ALERTS SECTION */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">{t('sos.activeAlerts')}</h2>
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white animate-pulse">
              {activeAlerts.length}
            </span>
          </div>
        </div>

        {activeAlerts.length === 0 ? (
          <div className="p-8 text-center bg-white border border-gray-200 rounded-xl shadow-sm">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-500 mb-3" />
            <p className="text-base font-medium text-gray-900">{t('sos.noActiveAlerts')}</p>
            <p className="text-sm text-gray-500 mt-1">{t('sos.allAlertsHandled')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                  className="bg-white border-2 border-red-500 rounded-xl shadow-lg p-5 flex flex-col justify-between relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-bl-lg flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{formatElapsed(alert.createdAt)}</span>
                  </div>

                  <div>
                    <div className="flex items-start gap-3 mb-4">
                      <div className="p-2.5 bg-red-100 rounded-full text-red-600 flex-shrink-0 animate-bounce">
                        <AlertTriangle className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">{residentName}</h3>
                        <p className="text-xs text-red-600 font-semibold uppercase tracking-wider">
                          {t('sos.status.ACTIVE')}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm text-gray-700 bg-red-50/50 p-3 rounded-lg border border-red-100 mb-4">
                      {unitStr && (
                        <div className="flex items-center gap-2">
                          <Home className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          <span className="font-medium text-gray-900">{unitStr}</span>
                        </div>
                      )}

                      {phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          <a
                            href={`tel:${phone}`}
                            className="font-bold text-blue-600 hover:underline flex items-center gap-1"
                          >
                            {phone}
                          </a>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <span className="text-xs text-gray-500">
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
                          <span className="text-xs text-gray-400 italic">{t('sos.noLocation')}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {!isChairman && (
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
                      <button
                        onClick={() => handleOpenResolveModal(alert, 'RESOLVED')}
                        className="w-full inline-flex justify-center items-center px-3 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-green-600 hover:bg-green-700 shadow-sm"
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1.5" />
                        {t('sos.resolveAction')}
                      </button>
                      <button
                        onClick={() => handleOpenResolveModal(alert, 'FALSE_ALARM')}
                        className="w-full inline-flex justify-center items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 shadow-sm"
                      >
                        <XCircle className="h-4 w-4 mr-1.5 text-gray-400" />
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

      {/* HISTORY SECTION */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mt-8">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">{t('sos.history')}</h2>
        </div>

        {historyAlerts.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            {t('sos.noHistoryAlerts')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-gray-500">
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
              <tbody className="divide-y divide-gray-200 bg-white">
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
                    <tr key={alert.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                        {new Date(alert.createdAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                        {residentName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                        {unitStr}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600">
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
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {alert.status === 'RESOLVED' ? t('sos.status.RESOLVED') : t('sos.status.FALSE_ALARM')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                        <div>{resolverName}</div>
                        {alert.resolvedAt && (
                          <div className="text-xs text-gray-400">
                            {new Date(alert.resolvedAt).toLocaleTimeString()}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-500 max-w-xs truncate">
                        {alert.resolutionNote || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* RESOLVE / FALSE ALARM MODAL */}
      {selectedAlert && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                {targetStatus === 'RESOLVED' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-amber-500" />
                )}
                {t('sos.resolveModalTitle')}
              </h3>
              <button
                onClick={() => setSelectedAlert(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="text-sm text-gray-600 space-y-1 bg-gray-50 p-3 rounded-lg">
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
                <span className="font-semibold text-gray-900">
                  {targetStatus === 'RESOLVED' ? t('sos.status.RESOLVED') : t('sos.status.FALSE_ALARM')}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('sos.resolutionNoteLabel')}
              </label>
              <textarea
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                placeholder={t('sos.resolutionNotePlaceholder')}
                rows={3}
                className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-red-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedAlert(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmResolve}
                disabled={resolving}
                className={`inline-flex items-center px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm ${
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
          </div>
        </div>
      )}
    </div>
  );
}
