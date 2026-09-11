'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyRound,
  ShieldCheck,
  Video,
  Car,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCw,
  Plus,
  Activity,
  DoorClosed,
  Radio,
  Server,
  X,
  RefreshCw,
  Check,
  AlertCircle,
  Download,
  Calendar,
} from 'lucide-react';
import { apiRequest, apiDownload, getStoredSession } from '@/lib/api';

interface AccessPointItem {
  id: string;
  name: string;
  type: 'BARRIER' | 'GATE' | 'DOOR_INTERCOM' | 'CAMERA';
  controllerType: string;
  endpointUrl?: string | null;
  rtspStreamUrl?: string | null;
  streamName?: string | null;
  isActive: boolean;
  tenantId: string;
  createdAt?: string;
}

interface AccessLogItem {
  id: string;
  userId?: string | null;
  unitId?: string | null;
  action: string;
  status: string;
  note?: string | null;
  createdAt: string;
  accessPoint?: {
    id: string;
    name: string;
    type: string;
  } | null;
  user?: {
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
  } | null;
  unit?: {
    id: string;
    unitNumber: string;
    building?: {
      id: string;
      blockName: string;
    } | null;
  } | null;
}

interface HealthCheckResult {
  reachable: boolean;
  model?: string;
  serialNumber?: string;
  error?: string;
}

export default function AccessPage() {
  const { t } = useTranslation();
  const session = getStoredSession();
  const user = session?.user;
  const tenantId = user?.tenantId;
  const canManage = user?.role === 'HOA_ADMIN' || user?.role === 'SUPERADMIN';
  const canViewLogs =
    user?.role === 'SECURITY' ||
    user?.role === 'HOA_ADMIN' ||
    user?.role === 'SUPERADMIN';

  const [points, setPoints] = useState<AccessPointItem[]>([]);
  const [loadingPoints, setLoadingPoints] = useState(true);
  const [openingPointId, setOpeningPointId] = useState<string | null>(null);
  const [lastOpened, setLastOpened] = useState<{ [key: string]: string }>({});

  // Health check state per access point id
  const [healthChecking, setHealthChecking] = useState<{ [key: string]: boolean }>({});
  const [healthResults, setHealthResults] = useState<{ [key: string]: HealthCheckResult }>({});

  // Registration modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<'DOOR_INTERCOM' | 'BARRIER' | 'GATE' | 'CAMERA'>('DOOR_INTERCOM');
  const [formControllerType, setFormControllerType] = useState('HIKVISION_ISAPI');
  const [formEndpointUrl, setFormEndpointUrl] = useState('');
  const [formRtspUrl, setFormRtspUrl] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Logs state
  const [initialDates] = useState(() => {
    const toDate = new Date();
    const fromDate = new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    return {
      from: fromDate.toISOString().split('T')[0],
      to: toDate.toISOString().split('T')[0],
    };
  });
  const [logFrom, setLogFrom] = useState(initialDates.from);
  const [logTo, setLogTo] = useState(initialDates.to);
  const [logs, setLogs] = useState<AccessLogItem[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const fetchPoints = useCallback(async () => {
    if (!tenantId) {
      setLoadingPoints(false);
      return;
    }
    setLoadingPoints(true);
    try {
      const data = await apiRequest<AccessPointItem[]>(`/access/tenant/${tenantId}/points`);
      setPoints(data);
    } catch (err: any) {
      console.warn('Failed to load points:', err);
    } finally {
      setLoadingPoints(false);
    }
  }, [tenantId]);

  const fetchLogs = useCallback(async () => {
    if (!tenantId || !canViewLogs) {
      setLoadingLogs(false);
      return;
    }
    setLoadingLogs(true);
    try {
      const data = await apiRequest<AccessLogItem[]>(`/access/tenant/${tenantId}/logs`);
      setLogs(data);
    } catch (err: any) {
      console.warn('Failed to load access logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  }, [tenantId, canViewLogs]);

  useEffect(() => {
    fetchPoints();
    if (canViewLogs) {
      fetchLogs();
    }
  }, [fetchPoints, fetchLogs, canViewLogs]);

  const handleExportCsv = async () => {
    if (!tenantId) return;
    setExportingCsv(true);
    setExportError(null);
    try {
      const queryParams = new URLSearchParams();
      if (logFrom) queryParams.set('from', logFrom);
      if (logTo) queryParams.set('to', logTo);
      const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
      await apiDownload(
        `/access/tenant/${tenantId}/logs/export${queryString}`,
        `access-log-${tenantId}.csv`,
      );
    } catch (err: any) {
      setExportError(err.message || 'Error exporting CSV');
      setTimeout(() => setExportError(null), 5000);
    } finally {
      setExportingCsv(false);
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'OPEN_BARRIER':
        return t('access.actionOpenBarrier');
      case 'OPEN_INTERCOM':
        return t('access.actionOpenIntercom');
      case 'VIEW_CAMERA':
        return t('access.actionViewCamera');
      case 'GUEST_CODE_ENTRY':
        return t('access.actionGuestCodeEntry');
      default:
        return action;
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (!logFrom && !logTo) return true;
    const logDate = new Date(log.createdAt);
    if (logFrom) {
      const fromD = new Date(logFrom);
      fromD.setHours(0, 0, 0, 0);
      if (logDate < fromD) return false;
    }
    if (logTo) {
      const toD = new Date(logTo);
      toD.setHours(23, 59, 59, 999);
      if (logDate > toD) return false;
    }
    return true;
  });

  const handleOpenPoint = async (point: AccessPointItem) => {
    setOpeningPointId(point.id);
    try {
      setTimeout(() => {
        setOpeningPointId(null);
        setLastOpened((prev) => ({
          ...prev,
          [point.id]: new Date().toLocaleTimeString('ru-RU'),
        }));
      }, 1000);
    } catch (err: any) {
      setOpeningPointId(null);
    }
  };

  const handleCheckHealth = async (pointId: string) => {
    setHealthChecking((prev) => ({ ...prev, [pointId]: true }));
    try {
      const result = await apiRequest<HealthCheckResult>(`/access/points/${pointId}/health-check`);
      setHealthResults((prev) => ({ ...prev, [pointId]: result }));
    } catch (err: any) {
      setHealthResults((prev) => ({
        ...prev,
        [pointId]: { reachable: false, error: err.message || t('access.healthUnreachable') },
      }));
    } finally {
      setHealthChecking((prev) => ({ ...prev, [pointId]: false }));
    }
  };

  const handleCreatePoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;

    if (!formName.trim()) {
      setFormError(t('access.nameLabel'));
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      await apiRequest(`/access/tenant/${tenantId}/points`, {
        method: 'POST',
        body: JSON.stringify({
          name: formName.trim(),
          type: formType,
          controllerType: formControllerType.trim(),
          endpointUrl: formEndpointUrl.trim() || undefined,
          rtspStreamUrl: formRtspUrl.trim() || undefined,
        }),
      });

      setIsModalOpen(false);
      setFormName('');
      setFormEndpointUrl('');
      setFormRtspUrl('');
      setActionSuccess(t('access.addPointSuccess'));
      setTimeout(() => setActionSuccess(null), 4000);
      await fetchPoints();
    } catch (err: any) {
      setFormError(err.message || 'Error creating point');
    } finally {
      setIsSubmitting(false);
    }
  };

  const barriers = points.filter((p) => p.type === 'BARRIER' || p.type === 'GATE');
  const intercoms = points.filter((p) => p.type === 'DOOR_INTERCOM');
  const cameras = points.filter((p) => p.type === 'CAMERA');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('access.title')}</h1>
          <p className="text-sm text-slate-500">{t('access.subtitle')}</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchPoints}
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium flex items-center gap-2 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loadingPoints ? 'animate-spin text-slate-400' : ''}`} />
            {t('access.refreshBtn')}
          </button>

          {canManage && (
            <button
              onClick={() => {
                setFormError(null);
                setIsModalOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center gap-2 shadow-sm transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              {t('access.addPointBtn')}
            </button>
          )}
        </div>
      </div>

      {actionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2">
          <Check className="w-5 h-5 text-emerald-600 shrink-0" />
          {actionSuccess}
        </div>
      )}

      {/* Section: Intercoms (Домофоны) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <DoorClosed className="w-5 h-5 text-emerald-600" />
          <h2 className="text-lg font-bold text-slate-900">{t('access.intercomsSection')}</h2>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            {intercoms.length}
          </span>
        </div>

        {intercoms.length === 0 ? (
          <div className="p-6 rounded-2xl bg-white border border-slate-200 text-center text-slate-500 text-sm">
            {t('access.noPoints')}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {intercoms.map((point) => {
              const isChecking = healthChecking[point.id];
              const health = healthResults[point.id];
              const isHikvision = point.controllerType === 'HIKVISION_ISAPI';

              return (
                <div
                  key={point.id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        {t('access.pointTypeIntercom')}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                        {point.controllerType}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900 mt-2">{point.name}</h3>
                    <p className="text-xs text-slate-500 mt-1 font-mono break-all">
                      {point.endpointUrl || 'local://relay'}
                    </p>

                    {/* Health Check Status */}
                    {health && (
                      <div className="mt-3 p-2.5 rounded-xl text-xs space-y-1 bg-slate-50 border border-slate-200">
                        <div className="flex items-center gap-1.5 font-medium">
                          {health.reachable ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="text-emerald-700">{t('access.healthReachable')}</span>
                            </>
                          ) : (
                            <>
                              <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                              <span className="text-red-700">{t('access.healthUnreachable')}</span>
                            </>
                          )}
                        </div>
                        {health.model && (
                          <div className="text-slate-600">{t('access.deviceModel', { model: health.model })}</div>
                        )}
                        {health.serialNumber && (
                          <div className="text-slate-600 font-mono text-[11px]">
                            {t('access.serialNumber', { serial: health.serialNumber })}
                          </div>
                        )}
                        {health.error && (
                          <div className="text-red-600 text-[11px]">{health.error}</div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-5 pt-3 border-t border-slate-100 flex flex-col gap-2">
                    {isHikvision && canManage && (
                      <button
                        onClick={() => handleCheckHealth(point.id)}
                        disabled={isChecking}
                        className="w-full py-2 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                      >
                        <Activity className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin text-emerald-600' : ''}`} />
                        {isChecking ? t('access.checkingHealth') : t('access.checkHealthBtn')}
                      </button>
                    )}

                    <button
                      onClick={() => handleOpenPoint(point)}
                      disabled={openingPointId === point.id}
                      className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95"
                    >
                      {openingPointId === point.id ? (
                        <>
                          <RotateCw className="w-3.5 h-3.5 animate-spin" />
                          {t('access.openRelaySending')}
                        </>
                      ) : (
                        <>
                          <KeyRound className="w-3.5 h-3.5" />
                          {t('access.openManualBtn')}
                        </>
                      )}
                    </button>
                    {lastOpened[point.id] && (
                      <div className="text-center text-[10px] text-emerald-600 font-medium">
                        {t('access.lastOpened', { time: lastOpened[point.id] })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section: Barriers and Gates */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-bold text-slate-900">{t('access.barriersSection')}</h2>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            {barriers.length}
          </span>
        </div>

        {barriers.length === 0 ? (
          <div className="p-6 rounded-2xl bg-white border border-slate-200 text-center text-slate-500 text-sm">
            {t('access.noPoints')}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {barriers.map((point) => (
              <div
                key={point.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {point.type === 'BARRIER' ? t('access.pointTypeBarrier') : t('access.pointTypeGate')}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                      {point.controllerType}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mt-2">{point.name}</h3>
                  <p className="text-xs text-slate-500 mt-1 font-mono break-all">
                    {point.endpointUrl || 'local://relay'}
                  </p>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => handleOpenPoint(point)}
                    disabled={openingPointId === point.id}
                    className="w-full py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95"
                  >
                    {openingPointId === point.id ? (
                      <>
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                        {t('access.openRelaySending')}
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-3.5 h-3.5" />
                        {t('access.openManualBtn')}
                      </>
                    )}
                  </button>
                  {lastOpened[point.id] && (
                    <div className="text-center text-[10px] text-emerald-600 font-medium mt-1.5">
                      {t('access.lastOpened', { time: lastOpened[point.id] })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section: Video Camera Preview */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Video className="w-5 h-5 text-slate-700" />
          <h2 className="text-lg font-bold text-slate-900">{t('access.camerasSection')}</h2>
        </div>

        <div className="bg-slate-950 rounded-2xl p-4 shadow-sm text-white flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2 font-medium">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
              <span>{t('access.camera1Name')}</span>
            </div>
            <span className="text-slate-400 font-mono">{t('access.camera1Codec')}</span>
          </div>

          <div className="h-44 my-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center text-slate-500">
            <Video className="w-10 h-10 text-slate-600 mb-2" />
            <div className="text-xs font-medium text-slate-400">{t('access.liveStreamText')}</div>
            <div className="text-[11px] text-slate-600">{t('access.liveStreamGateway')}</div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800">
            <span>{t('access.lprActive')}</span>
            <span className="text-emerald-400 font-semibold">{t('access.systemNormal')}</span>
          </div>
        </div>
      </div>

      {/* Access Logs Table & Export Section (Visible to SECURITY, HOA_ADMIN, SUPERADMIN) */}
      {canViewLogs && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-0">
          <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                {t('access.auditTitle')}
              </h2>
              <span className="text-xs text-slate-500">{t('access.recent100Events')}</span>
            </div>

            {/* Date Filters & CSV Download Button */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-600 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{t('access.dateFrom')}</span>
                <input
                  type="date"
                  value={logFrom}
                  onChange={(e) => setLogFrom(e.target.value)}
                  className="bg-transparent text-slate-800 text-xs focus:outline-none"
                />
                <span>{t('access.dateTo')}</span>
                <input
                  type="date"
                  value={logTo}
                  onChange={(e) => setLogTo(e.target.value)}
                  className="bg-transparent text-slate-800 text-xs focus:outline-none"
                />
              </div>

              <button
                onClick={handleExportCsv}
                disabled={exportingCsv}
                className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 disabled:opacity-60"
              >
                {exportingCsv ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{t('access.exportingCsv')}</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>{t('access.exportCsvBtn')}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {exportError && (
            <div className="p-3 mx-4 my-2 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{exportError}</span>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">{t('access.thTime')}</th>
                  <th className="py-3 px-4">{t('access.thPoint')}</th>
                  <th className="py-3 px-4">{t('access.thUser')}</th>
                  <th className="py-3 px-4">{t('access.thUnit')}</th>
                  <th className="py-3 px-4">{t('access.thEvent')}</th>
                  <th className="py-3 px-4">{t('access.thNote')}</th>
                  <th className="py-3 px-4 text-right">{t('access.thResult')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {loadingLogs ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      <div className="flex items-center justify-center gap-2">
                        <RotateCw className="w-4 h-4 animate-spin text-emerald-600" />
                        <span>{t('access.logsLoading')}</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      {t('access.logsEmpty')}
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => {
                    const userFullName = [log.user?.firstName, log.user?.lastName]
                      .filter(Boolean)
                      .join(' ');
                    const userLabel = userFullName || (log.userId ? log.userId : t('access.guestLabel'));
                    const unitLabel = log.unit
                      ? `${log.unit.building?.blockName ? `${log.unit.building.blockName}, ` : ''}${t('common.unitShort')} ${log.unit.unitNumber}`
                      : '—';
                    const isSuccess = log.status === 'SUCCESS';

                    return (
                      <tr key={log.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString('ru-RU', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                          {log.accessPoint?.name || '—'}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-medium text-slate-900">{userLabel}</div>
                          {log.user?.phone && (
                            <div className="text-[11px] text-slate-400 font-mono">
                              {log.user.phone}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">{unitLabel}</td>
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          {getActionLabel(log.action)}
                        </td>
                        <td className="py-3 px-4 text-slate-500 max-w-xs truncate" title={log.note || ''}>
                          {log.note || '—'}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {isSuccess ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                              {t('access.statusSuccess')}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 font-semibold">
                              {t('access.statusDenied')}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Registration Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">{t('access.modalTitle')}</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePoint} className="p-5 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('access.nameLabel')} *
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t('access.namePlaceholder')}
                  required
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('access.typeLabel')} *
                </label>
                <select
                  value={formType}
                  onChange={(e) => {
                    const newType = e.target.value as any;
                    setFormType(newType);
                    if (newType === 'DOOR_INTERCOM') {
                      setFormControllerType('HIKVISION_ISAPI');
                    } else if (newType === 'BARRIER' || newType === 'GATE') {
                      setFormControllerType('PAL_ES');
                    } else if (newType === 'CAMERA') {
                      setFormControllerType('RTSP_CAMERA');
                    }
                  }}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                >
                  <option value="DOOR_INTERCOM">{t('access.pointTypeIntercom')}</option>
                  <option value="BARRIER">{t('access.pointTypeBarrier')}</option>
                  <option value="GATE">{t('access.pointTypeGate')}</option>
                  <option value="CAMERA">{t('access.pointTypeCamera')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('access.controllerTypeLabel')} *
                </label>
                <input
                  type="text"
                  value={formControllerType}
                  onChange={(e) => setFormControllerType(e.target.value)}
                  placeholder="HIKVISION_ISAPI / PAL_ES / MQTT_RELAY"
                  required
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('access.endpointUrlLabel')}
                </label>
                <input
                  type="text"
                  value={formEndpointUrl}
                  onChange={(e) => setFormEndpointUrl(e.target.value)}
                  placeholder={t('access.endpointUrlPlaceholder')}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                />
              </div>

              {formType === 'CAMERA' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('access.rtspStreamUrlLabel')}
                  </label>
                  <input
                    type="text"
                    value={formRtspUrl}
                    onChange={(e) => setFormRtspUrl(e.target.value)}
                    placeholder="rtsp://admin:pass@192.168.1.150:554/ch1"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                  />
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition"
                >
                  {t('access.cancelBtn')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center gap-2 transition"
                >
                  {isSubmitting ? (
                    <>
                      <RotateCw className="w-4 h-4 animate-spin" />
                      {t('access.savingBtn')}
                    </>
                  ) : (
                    t('access.saveBtn')
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
