'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Gauge,
  Plus,
  Droplet,
  Flame,
  Zap,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  History,
  Loader2,
  ChevronRight,
  ChevronDown,
  Upload,
} from 'lucide-react';
import { CabinetApi, MeterData, MeterReading, ResidentProfile } from '@/lib/cabinet-api';
import { getMeterTypeLabel } from '@/lib/cabinet-labels';

export default function CabinetMetersPage() {
  const { t, i18n } = useTranslation();

  const [profile, setProfile] = useState<ResidentProfile | null>(null);
  const [meters, setMeters] = useState<MeterData[]>([]);
  const [loading, setLoading] = useState(true);

  // Submit Reading Modal State
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [selectedMeter, setSelectedMeter] = useState<MeterData | null>(null);
  const [readingValue, setReadingValue] = useState('');
  const [readingMonth, setReadingMonth] = useState<number>(new Date().getMonth() + 1);
  const [readingYear, setReadingYear] = useState<number>(new Date().getFullYear());
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // History expanded state per meter
  const [expandedMeters, setExpandedMeters] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const me = await CabinetApi.getMe();
      setProfile(me);

      const unitId = me?.ownerships?.[0]?.unitId;
      if (unitId) {
        const list = await CabinetApi.getUnitMeters(unitId);
        setMeters(list || []);
        if (list && list.length > 0 && !selectedMeter) {
          setSelectedMeter(list[0]);
        }
      }
    } catch (e) {
      console.warn('Failed to load meters data:', e);
    } finally {
      setLoading(false);
    }
  }, [selectedMeter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleExpand = (meterId: string) => {
    setExpandedMeters((prev) => ({ ...prev, [meterId]: !prev[meterId] }));
  };

  const handleOpenSubmit = (meter: MeterData) => {
    setSelectedMeter(meter);
    setReadingValue('');
    setPhotoFile(null);
    setPhotoUploading(false);
    setSubmitError(null);
    setShowSubmitModal(true);
  };

  const handleSubmitReading = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMeter || !readingValue) return;

    const val = parseFloat(readingValue);
    if (isNaN(val) || val < 0) {
      setSubmitError(t('cabinet.meterInvalidValue'));
      return;
    }

    // Check against previous reading
    const lastReading = selectedMeter.readings?.[0]?.value ?? selectedMeter.initialValue;
    if (val < lastReading) {
      setSubmitError(t('cabinet.meterValueLesser'));
      return;
    }

    if (!photoFile) {
      setSubmitError(t('cabinet.meterPhotoRequired'));
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    // 1. Upload photo to /uploads (MinIO)
    let photoUrl = '';
    try {
      setPhotoUploading(true);
      const uploaded = await CabinetApi.uploadFile(photoFile, 'media');
      photoUrl = uploaded.url;
    } catch (uploadErr: any) {
      setSubmitError(t('cabinet.meterPhotoUploadFailed'));
      setPhotoUploading(false);
      setSubmitting(false);
      return;
    }

    // 2. Submit reading with uploaded photo URL
    try {
      await CabinetApi.submitReading(selectedMeter.id, {
        value: val,
        photoUrl,
        month: readingMonth,
        year: readingYear,
      });

      setShowSubmitModal(false);
      setReadingValue('');
      setPhotoFile(null);
      alert(t('cabinet.readingSubmittedSuccess'));
      await loadData();
    } catch (err: any) {
      setSubmitError(err?.message || t('cabinet.meterSubmitError'));
    } finally {
      setSubmitting(false);
      setPhotoUploading(false);
    }
  };

  const getMeterIcon = (type: string) => {
    switch (type) {
      case 'COLD_WATER':
        return <Droplet className="w-5 h-5 text-emerald-500" />;
      case 'HOT_WATER':
        return <Flame className="w-5 h-5 text-rose-500" />;
      case 'ELECTRICITY':
        return <Zap className="w-5 h-5 text-amber-500" />;
      default:
        return <Gauge className="w-5 h-5 text-emerald-500" />;
    }
  };

  const getUnitSymbol = (type: string) => {
    switch (type) {
      case 'COLD_WATER':
      case 'HOT_WATER':
        return 'м³';
      case 'ELECTRICITY':
        return 'кВт·ч';
      default:
        return 'ед.';
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      return new Intl.DateTimeFormat(
        i18n.language === 'en' ? 'en-US' : i18n.language === 'kk' ? 'kk-KZ' : 'ru-RU',
        { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Almaty' },
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
            {t('cabinet.metersTitle')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('cabinet.meterReadingSub')}
          </p>
        </div>

        {meters.length > 0 && (
          <button
            type="button"
            onClick={() => handleOpenSubmit(meters[0])}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors self-start sm:self-center"
          >
            <Plus className="w-4 h-4" />
            <span>{t('cabinet.submitReading')}</span>
          </button>
        )}
      </div>

      {/* Meter List */}
      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </div>
      ) : meters.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center shadow-sm">
          <Gauge className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            {t('cabinet.noMeters')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('cabinet.noMetersDesc')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {meters.map((meter) => {
            const latest = meter.readings?.[0];
            const unit = getUnitSymbol(meter.type);
            const isExpanded = expandedMeters[meter.id] || false;

            return (
              <div
                key={meter.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                        {getMeterIcon(meter.type)}
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                          {getMeterTypeLabel(meter.type, t)}
                        </h2>
                        <span className="text-[11px] font-mono text-slate-400">
                          № {meter.serialNumber || '—'}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenSubmit(meter)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 font-bold text-xs transition-colors shrink-0"
                    >
                      {t('cabinet.submitReading')}
                    </button>
                  </div>

                  {/* Current Reading Hero */}
                  <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                        {t('cabinet.latestReading')}
                      </span>
                      <div className="text-2xl font-black font-mono text-slate-900 dark:text-white tracking-tight mt-0.5">
                        {latest ? latest.value : meter.initialValue}{' '}
                        <span className="text-xs font-normal text-slate-400">{unit}</span>
                      </div>
                      {latest && (
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          {formatDate(latest.createdAt)} ({latest.periodMonth}.{latest.periodYear})
                        </span>
                      )}
                    </div>

                    {latest && (
                      <span
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                          latest.status === 'VERIFIED'
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                            : latest.status === 'REJECTED'
                            ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
                            : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {latest.status === 'VERIFIED'
                          ? t('cabinet.meterReadingVerified')
                          : latest.status === 'REJECTED'
                          ? t('cabinet.meterReadingRejected')
                          : t('cabinet.meterReadingPending')}
                      </span>
                    )}
                  </div>
                </div>

                {/* History Trigger */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => toggleExpand(meter.id)}
                    className="w-full flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900"
                  >
                    <span className="flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        {t('cabinet.readingHistory')} ({meter.readings?.length || 0})
                      </span>
                    </span>
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                </div>

                {/* Expandable History Table */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                    {meter.readings && meter.readings.length > 0 ? (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {meter.readings.map((r) => (
                          <div key={r.id} className="py-2 flex items-center justify-between">
                            <div>
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {r.periodMonth}.{r.periodYear}
                              </span>
                              <span className="text-slate-400 ml-2 text-[11px]">
                                {formatDate(r.createdAt)}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-slate-900 dark:text-white">
                                {r.value} {unit}
                              </span>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  r.status === 'VERIFIED'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : r.status === 'REJECTED'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}
                              >
                                {r.status === 'VERIFIED'
                                  ? t('cabinet.meterReadingVerified')
                                  : r.status === 'REJECTED'
                                  ? t('cabinet.meterReadingRejected')
                                  : t('cabinet.meterReadingPending')}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-3 text-xs text-slate-400">
                        {t('cabinet.noReadings')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Submit Reading Modal */}
      {showSubmitModal && selectedMeter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl relative animate-in fade-in duration-200">
            <button
              type="button"
              onClick={() => setShowSubmitModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label={t('cabinet.close')}
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-2">
              {getMeterIcon(selectedMeter.type)}
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t('cabinet.submitMeterReading')}
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {getMeterTypeLabel(selectedMeter.type, t)} (
              {selectedMeter.serialNumber || '—'})
            </p>

            {submitError && (
              <div className="mt-3 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 text-xs flex flex-col gap-1.5">
                <span>{submitError}</span>
                {photoFile && (
                  <button
                    type="button"
                    onClick={handleSubmitReading}
                    className="self-start text-[11px] font-bold underline hover:opacity-80 text-emerald-600 dark:text-emerald-400"
                  >
                    {t('cabinet.meterSubmitRetry')}
                  </button>
                )}
              </div>
            )}

            <form onSubmit={handleSubmitReading} className="mt-4 space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs flex justify-between">
                <span className="text-slate-500">{t('cabinet.previousReading')}:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {selectedMeter.readings?.[0]?.value ?? selectedMeter.initialValue}{' '}
                  {getUnitSymbol(selectedMeter.type)}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('cabinet.newReadingValue')} *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    value={readingValue}
                    onChange={(e) => setReadingValue(e.target.value)}
                    placeholder={t('cabinet.readingPlaceholder')}
                    className="w-full py-2.5 px-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white text-base font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                  <span className="absolute right-3 top-3 text-xs text-slate-400 font-bold">
                    {getUnitSymbol(selectedMeter.type)}
                  </span>
                </div>
              </div>

              {/* Photo Upload Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('cabinet.meterPhotoLabel')} *
                </label>
                <label className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 rounded-xl cursor-pointer bg-slate-50 dark:bg-slate-800/40 transition-colors">
                  <Upload className="w-5 h-5 text-slate-400 mb-1" />
                  <span className="text-xs text-slate-600 dark:text-slate-300 font-medium text-center">
                    {photoFile ? photoFile.name : t('cabinet.chooseMeterPhoto')}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5">
                    {t('cabinet.fileSizeNotice')}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setPhotoFile(file);
                        setSubmitError(null);
                      }
                    }}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    {t('cabinet.month')}
                  </label>
                  <select
                    value={readingMonth}
                    onChange={(e) => setReadingMonth(parseInt(e.target.value, 10))}
                    className="w-full py-1.5 px-2 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    {t('cabinet.year')}
                  </label>
                  <select
                    value={readingYear}
                    onChange={(e) => setReadingYear(parseInt(e.target.value, 10))}
                    className="w-full py-1.5 px-2 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs"
                  >
                    {[2025, 2026, 2027].map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || !readingValue}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {submitting || photoUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>{t('cabinet.submitMeterReading')}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
