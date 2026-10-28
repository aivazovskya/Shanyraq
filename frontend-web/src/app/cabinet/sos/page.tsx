'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  ShieldAlert,
  User,
  MapPin,
} from 'lucide-react';
import { CabinetApi, SosAlert, ResidentProfile } from '@/lib/cabinet-api';
import { getSosStatusLabel } from '@/lib/cabinet-labels';

export default function CabinetSosPage() {
  const { t, i18n } = useTranslation();

  const [profile, setProfile] = useState<ResidentProfile | null>(null);
  const [alerts, setAlerts] = useState<SosAlert[]>([]);
  const [loading, setLoading] = useState(true);

  // Trigger SOS state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [triggerSuccess, setTriggerSuccess] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [me, list] = await Promise.all([
        CabinetApi.getMe(),
        CabinetApi.getMySosAlerts(),
      ]);
      setProfile(me);
      setAlerts(list || []);
    } catch (e) {
      console.warn('Failed to load SOS history:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleTriggerSos = async () => {
    setTriggering(true);
    setTriggerError(null);
    try {
      let coords: { latitude?: number; longitude?: number } = {};
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 });
          });
          coords = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          };
        } catch {}
      }

      await CabinetApi.triggerSos(coords);
      setTriggerSuccess(true);
      setTimeout(() => {
        setShowConfirmModal(false);
        setTriggerSuccess(false);
      }, 2000);
      await loadData();
    } catch (err: any) {
      setTriggerError(err?.message || t('cabinet.sosError'));
    } finally {
      setTriggering(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 font-extrabold animate-pulse';
      case 'RESOLVED':
        return 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold';
      case 'FALSE_ALARM':
        return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold';
      default:
        return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300';
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      return new Intl.DateTimeFormat(
        i18n.language === 'en' ? 'en-US' : i18n.language === 'kk' ? 'kk-KZ' : 'ru-RU',
        {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Almaty',
        },
      ).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {t('cabinet.sosTitle')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('cabinet.sosSubtitle')}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowConfirmModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-sm transition-colors self-start sm:self-center"
        >
          <AlertTriangle className="w-4 h-4" />
          <span>{t('cabinet.sosCallButton')}</span>
        </button>
      </div>

      {/* SOS Alerts History List */}
      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-red-600" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center shadow-sm">
          <ShieldAlert className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            {t('cabinet.noSosHistory')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('cabinet.noSosHistoryDesc')}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-5 rounded-2xl border shadow-sm transition-all ${
                alert.status === 'ACTIVE'
                  ? 'bg-red-50/50 dark:bg-red-950/20 border-red-300 dark:border-red-900'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span
                  className={`text-[10px] uppercase px-2.5 py-0.5 rounded-full ${getStatusBadge(
                    alert.status,
                  )}`}
                >
                  {getSosStatusLabel(alert.status, t)}
                </span>

                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{formatDate(alert.createdAt)}</span>
                </span>
              </div>

              {alert.latitude && alert.longitude && (
                <div className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {t('cabinet.sosGpsCoords', {
                      coords: `${alert.latitude.toFixed(5)}, ${alert.longitude.toFixed(5)}`,
                    })}
                  </span>
                </div>
              )}

              {/* Resolution details */}
              {alert.resolvedAt && (
                <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {t('cabinet.sosResolution')}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {formatDate(alert.resolvedAt)}
                    </span>
                  </div>
                  {alert.resolvedBy && (
                    <div className="text-[11px] text-slate-500">
                      {t('cabinet.sosResolvedStaff', {
                        name: `${alert.resolvedBy.firstName} ${alert.resolvedBy.lastName}`,
                      })}
                    </div>
                  )}
                  {alert.resolutionNote && (
                    <p className="mt-1 text-slate-700 dark:text-slate-200 italic">
                      «{alert.resolutionNote}»
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl relative animate-in fade-in duration-200 text-center">
            <button
              type="button"
              onClick={() => setShowConfirmModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label={t('cabinet.close')}
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-600 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {t('cabinet.sosConfirmTitle')}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {t('cabinet.sosConfirmDesc')}
            </p>

            {triggerError && (
              <div className="mt-3 p-2 rounded-xl bg-red-50 text-red-600 text-xs">
                {triggerError}
              </div>
            )}

            {triggerSuccess && (
              <div className="mt-3 p-2 rounded-xl bg-emerald-50 text-emerald-600 text-xs font-semibold flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>{t('cabinet.sosSent')}</span>
              </div>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {t('cabinet.cancel')}
              </button>
              <button
                type="button"
                disabled={triggering}
                onClick={handleTriggerSos}
                className="flex-1 py-2.5 px-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {triggering ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <AlertTriangle className="w-4 h-4" />
                )}
                <span>{t('cabinet.sosCallButton')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
