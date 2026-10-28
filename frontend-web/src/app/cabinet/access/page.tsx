'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyRound,
  Plus,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  X,
  Lock,
  Unlock,
  Car,
  Clock,
  Loader2,
  Trash2,
  RefreshCw,
  Phone,
} from 'lucide-react';
import { CabinetApi, GuestPass, ResidentProfile } from '@/lib/cabinet-api';
import { getGuestPassStatusLabel, getAccessPointTypeLabel } from '@/lib/cabinet-labels';

export default function CabinetAccessPage() {
  const { t, i18n } = useTranslation();

  const [profile, setProfile] = useState<ResidentProfile | null>(null);
  const [passes, setPasses] = useState<GuestPass[]>([]);
  const [isPinSet, setIsPinSet] = useState(false);
  const [loading, setLoading] = useState(true);

  // New Pass Modal State
  const [showPassModal, setShowPassModal] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPlate, setGuestPlate] = useState('');
  const [passDurationHours, setPassDurationHours] = useState('24');
  const [passSubmitting, setPassSubmitting] = useState(false);

  // Set / Change PIN Modal State
  const [showPinModal, setShowPinModal] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  // Reset PIN Flow State
  const [showResetPinModal, setShowResetPinModal] = useState(false);
  const [resetStep, setResetStep] = useState<'REQUEST' | 'CONFIRM'>('REQUEST');
  const [resetOtp, setResetOtp] = useState('');
  const [resetNewPin, setResetNewPin] = useState('');
  const [resetDevCode, setResetDevCode] = useState<string | null>(null);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Open barrier inline state
  const [barrierPin, setBarrierPin] = useState('');
  const [barrierLoading, setBarrierLoading] = useState(false);
  const [barrierSuccess, setBarrierSuccess] = useState<string | null>(null);
  const [barrierError, setBarrierError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const me = await CabinetApi.getMe();
      setProfile(me);

      const unitId = me?.ownerships?.[0]?.unitId;
      const [pinStatus, passesList] = await Promise.all([
        CabinetApi.getPinStatus(),
        unitId ? CabinetApi.getUnitGuestPasses(unitId) : Promise.resolve([]),
      ]);

      setIsPinSet(pinStatus?.isPinSet ?? false);
      setPasses(passesList || []);
    } catch (e) {
      console.warn('Failed to load access page data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Create Guest Pass Handler
  const handleCreatePass = async (e: React.FormEvent) => {
    e.preventDefault();
    const unitId = profile?.ownerships?.[0]?.unitId;
    if (!unitId || !guestName.trim()) return;

    setPassSubmitting(true);
    try {
      const from = new Date();
      const to = new Date(from.getTime() + parseInt(passDurationHours, 10) * 3600 * 1000);

      await CabinetApi.createGuestPass({
        unitId,
        guestName: guestName.trim(),
        guestPlateNumber: guestPlate.trim() || undefined,
        validFrom: from.toISOString(),
        validTo: to.toISOString(),
      });

      setShowPassModal(false);
      setGuestName('');
      setGuestPlate('');
      await loadData();
    } catch (err: any) {
      alert(err?.message || t('cabinet.passCreateError'));
    } finally {
      setPassSubmitting(false);
    }
  };

  // Revoke Guest Pass Handler
  const handleRevokePass = async (passId: string) => {
    if (!confirm(t('cabinet.revokePassConfirm'))) return;
    try {
      await CabinetApi.revokeGuestPass(passId);
      await loadData();
    } catch (err: any) {
      alert(err?.message || t('cabinet.passRevokeError'));
    }
  };

  // Set / Change PIN Handler
  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin.length !== 4) {
      setPinError(t('cabinet.pinDigitCountError'));
      return;
    }
    if (newPin !== confirmPin) {
      setPinError(t('cabinet.pinMismatchError'));
      return;
    }

    setPinSubmitting(true);
    setPinError(null);

    try {
      await CabinetApi.setPin(newPin, isPinSet ? currentPin : undefined);
      setShowPinModal(false);
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setIsPinSet(true);
      alert(t('cabinet.pinSavedSuccess'));
    } catch (err: any) {
      setPinError(err?.message || t('cabinet.pinUpdateError'));
    } finally {
      setPinSubmitting(false);
    }
  };

  // Request PIN Reset via SMS
  const handleRequestPinReset = async () => {
    setResetSubmitting(true);
    setResetError(null);
    try {
      const res = await CabinetApi.requestPinReset();
      if (res.devCode) {
        setResetDevCode(res.devCode);
      }
      setResetStep('CONFIRM');
    } catch (err: any) {
      setResetError(err?.message || t('cabinet.pinResetSmsError'));
    } finally {
      setResetSubmitting(false);
    }
  };

  // Confirm PIN Reset
  const handleConfirmPinReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetOtp.trim() || resetNewPin.length !== 4) {
      setResetError(t('cabinet.pinResetEnterDataError'));
      return;
    }

    setResetSubmitting(true);
    setResetError(null);

    try {
      await CabinetApi.confirmPinReset(resetOtp.trim(), resetNewPin.trim());
      setShowResetPinModal(false);
      setResetStep('REQUEST');
      setResetOtp('');
      setResetNewPin('');
      setIsPinSet(true);
      alert(t('cabinet.pinSavedSuccess'));
    } catch (err: any) {
      setResetError(err?.message || t('cabinet.pinResetConfirmError'));
    } finally {
      setResetSubmitting(false);
    }
  };

  // Barrier Quick Open
  const handleOpenBarrier = async (e: React.FormEvent) => {
    e.preventDefault();
    const tenantId = profile?.tenantId || profile?.ownerships?.[0]?.unit?.building?.tenantId;
    if (!tenantId) return;

    setBarrierLoading(true);
    setBarrierError(null);
    setBarrierSuccess(null);

    try {
      const points = await CabinetApi.getAccessPoints(tenantId);
      const barrier = points.find((p) => p.type === 'BARRIER' || p.type === 'GATE') || points[0];
      if (!barrier) {
        throw new Error(t('cabinet.barrierNotFound'));
      }

      await CabinetApi.openBarrier(barrier.id, barrierPin, profile?.ownerships?.[0]?.unitId);
      setBarrierSuccess(t('cabinet.barrierOpened'));
      setBarrierPin('');
      setTimeout(() => setBarrierSuccess(null), 3000);
    } catch (err: any) {
      setBarrierError(err?.message || t('cabinet.barrierError'));
    } finally {
      setBarrierLoading(false);
    }
  };

  const activePasses = passes.filter((p) => !p.isRevoked && !p.isUsed);
  const pastPasses = passes.filter((p) => p.isRevoked || p.isUsed);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      return new Intl.DateTimeFormat(
        i18n.language === 'en' ? 'en-US' : i18n.language === 'kk' ? 'kk-KZ' : 'ru-RU',
        { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Almaty' },
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
            {t('navigation.cabinetAccess')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('cabinet.accessSubtitle')}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowPassModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors self-start sm:self-center"
        >
          <Plus className="w-4 h-4" />
          <span>{t('cabinet.issueGuestPass')}</span>
        </button>
      </div>

      {/* Grid: PIN & Barrier Control */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* PIN Management Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-600" />
                <span>{t('cabinet.pinTitle')}</span>
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isPinSet
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                }`}
              >
                {isPinSet ? t('cabinet.pinConfigured') : t('cabinet.pinNotConfigured')}
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {isPinSet ? t('cabinet.pinSetDesc') : t('cabinet.pinNotSetDesc')}
            </p>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setShowPinModal(true);
                setPinError(null);
              }}
              className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold shadow-sm hover:opacity-90 transition-opacity"
            >
              {isPinSet ? t('cabinet.changePinBtn') : t('cabinet.setPinBtn')}
            </button>

            {isPinSet && (
              <button
                type="button"
                onClick={() => {
                  setShowResetPinModal(true);
                  setResetStep('REQUEST');
                  setResetError(null);
                }}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                {t('cabinet.resetPinBtn')}
              </button>
            )}
          </div>
        </div>

        {/* Barrier Open Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Unlock className="w-4 h-4 text-indigo-600" />
                <span>{t('cabinet.openBarrier')}</span>
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {t('cabinet.barrierSubtitle')}
            </p>
          </div>

          <form onSubmit={handleOpenBarrier} className="mt-4 space-y-3">
            {barrierError && (
              <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 text-xs">
                {barrierError}
              </div>
            )}
            {barrierSuccess && (
              <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 text-xs flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>{barrierSuccess}</span>
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={barrierPin}
                onChange={(e) => setBarrierPin(e.target.value)}
                placeholder={t('cabinet.barrierPinPlaceholder')}
                className="w-36 text-center tracking-widest font-mono text-base py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
              <button
                type="submit"
                disabled={barrierLoading || barrierPin.length !== 4}
                className="flex-1 py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {barrierLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Unlock className="w-4 h-4" />
                )}
                <span>{t('cabinet.openBarrier')}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Guest Passes Section */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
          {t('cabinet.activePasses')} ({activePasses.length})
        </h2>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
          </div>
        ) : activePasses.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center shadow-sm">
            <KeyRound className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {t('cabinet.noPasses')}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {t('cabinet.noPassesDesc')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activePasses.map((pass) => (
              <div
                key={pass.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span className="font-mono bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold px-2 py-0.5 rounded">
                      {pass.accessCode}
                    </span>
                    <span className="text-[11px] text-emerald-600 font-semibold">{getGuestPassStatusLabel(pass, t)}</span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-2">
                    {pass.guestName}
                  </h3>

                  {pass.guestPlateNumber && (
                    <div className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                      <Car className="w-3.5 h-3.5 text-slate-500" />
                      <span>{pass.guestPlateNumber}</span>
                    </div>
                  )}

                  <div className="mt-3 text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
                    <div>
                      {t('cabinet.validFromLabel')}: {formatDate(pass.validFrom)}
                    </div>
                    <div>
                      {t('cabinet.validToLabel')}: {formatDate(pass.validTo)}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                    <QrCode className="w-4 h-4 text-slate-600" />
                    <span>{t('cabinet.passQrReady')}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRevokePass(pass.id)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t('cabinet.revokePass')}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History of Passes */}
      {pastPasses.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            {t('cabinet.historyPasses')} ({pastPasses.length})
          </h2>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {pastPasses.slice(0, 5).map((p) => (
                <div key={p.id} className="p-3.5 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {p.guestName}
                    </span>
                    {p.guestPlateNumber && (
                      <span className="ml-2 font-mono text-slate-500">
                        ({p.guestPlateNumber})
                      </span>
                    )}
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {formatDate(p.validFrom)} — {formatDate(p.validTo)}
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      p.isRevoked
                        ? 'bg-red-50 text-red-600'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {getGuestPassStatusLabel(p, t)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Create Guest Pass Modal */}
      {showPassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl relative animate-in fade-in duration-200">
            <button
              type="button"
              onClick={() => setShowPassModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label={t('cabinet.close')}
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {t('cabinet.issueGuestPass')}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {t('cabinet.passNoticeDesc')}
            </p>

            <form onSubmit={handleCreatePass} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('cabinet.guestNameLabel')} *
                </label>
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder={t('cabinet.passGuestNamePlaceholder')}
                  className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('cabinet.guestPlateLabel')}
                </label>
                <input
                  type="text"
                  value={guestPlate}
                  onChange={(e) => setGuestPlate(e.target.value.toUpperCase())}
                  placeholder="01 123 ABC 01"
                  className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white text-xs font-mono uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('cabinet.passDurationLabel')}
                </label>
                <select
                  value={passDurationHours}
                  onChange={(e) => setPassDurationHours(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="4">{t('cabinet.passDuration4h')}</option>
                  <option value="12">{t('cabinet.passDuration12h')}</option>
                  <option value="24">{t('cabinet.passDuration24h')}</option>
                  <option value="48">{t('cabinet.passDuration48h')}</option>
                  <option value="168">{t('cabinet.passDuration168h')}</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={passSubmitting || !guestName.trim()}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {passSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>{t('cabinet.createPassButton')}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Set / Change PIN Modal */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl relative animate-in fade-in duration-200">
            <button
              type="button"
              onClick={() => setShowPinModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label={t('cabinet.close')}
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {isPinSet ? t('cabinet.changePinBtn') : t('cabinet.setPinBtn')}
            </h3>

            {pinError && (
              <div className="mt-3 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 text-xs">
                {pinError}
              </div>
            )}

            <form onSubmit={handleSavePin} className="mt-4 space-y-3">
              {isPinSet && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('cabinet.currentPinLabel')}
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value)}
                    placeholder="••••"
                    className="w-full text-center tracking-widest font-mono text-base py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('cabinet.newPinLabel')}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder="••••"
                  className="w-full text-center tracking-widest font-mono text-base py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('cabinet.pinRepeatNew')}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  placeholder="••••"
                  className="w-full text-center tracking-widest font-mono text-base py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={pinSubmitting || newPin.length !== 4}
                className="w-full mt-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {pinSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>{t('cabinet.savePin')}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Reset PIN via SMS Modal */}
      {showResetPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl relative animate-in fade-in duration-200">
            <button
              type="button"
              onClick={() => setShowResetPinModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label={t('cabinet.close')}
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {t('cabinet.pinResetTitle')}
            </h3>

            {resetError && (
              <div className="mt-3 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 text-xs">
                {resetError}
              </div>
            )}

            {resetStep === 'REQUEST' ? (
              <div className="mt-4 space-y-4">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  На ваш привязанный номер телефона будет отправлен SMS-код для подтверждения
                  сброса PIN-кода.
                </p>

                <button
                  type="button"
                  disabled={resetSubmitting}
                  onClick={handleRequestPinReset}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  {resetSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Phone className="w-4 h-4" />
                  )}
                  <span>{t('cabinet.pinSendSmsBtn')}</span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleConfirmPinReset} className="mt-4 space-y-3">
                {resetDevCode && (
                  <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-xs font-mono">
                    DEV SMS: {resetDevCode}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('cabinet.pinSmsCodeLabel')}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={resetOtp}
                    onChange={(e) => setResetOtp(e.target.value)}
                    placeholder="0000"
                    className="w-full text-center tracking-widest font-mono text-base py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('cabinet.newPinLabel')}
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={resetNewPin}
                    onChange={(e) => setResetNewPin(e.target.value)}
                    placeholder="••••"
                    className="w-full text-center tracking-widest font-mono text-base py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={resetSubmitting || !resetOtp.trim() || resetNewPin.length !== 4}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  {resetSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>{t('cabinet.pinConfirmNewBtn')}</span>
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
