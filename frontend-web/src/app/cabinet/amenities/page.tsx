'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Calendar,
  Clock,
  Plus,
  CheckCircle2,
  X,
  AlertCircle,
  Loader2,
  Trash2,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  CabinetApi,
  BookableResource,
  Booking,
  ResidentProfile,
} from '@/lib/cabinet-api';
import { getBookingStatusLabel, getResourceTypeLabel } from '@/lib/cabinet-labels';

export default function CabinetAmenitiesPage() {
  const { t, i18n } = useTranslation();

  const [profile, setProfile] = useState<ResidentProfile | null>(null);
  const [resources, setResources] = useState<BookableResource[]>([]);
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [activeTab, setActiveTab] = useState<'resources' | 'my'>('resources');
  const [loading, setLoading] = useState(true);

  // Booking Modal State
  const [selectedResource, setSelectedResource] = useState<BookableResource | null>(null);
  const [bookDate, setBookDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [bookStart, setBookStart] = useState('14:00');
  const [bookEnd, setBookEnd] = useState('16:00');
  const [bookNote, setBookNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const me = await CabinetApi.getMe();
      setProfile(me);

      const tenantId = me.tenantId || me.ownerships?.[0]?.unit?.building?.tenantId;
      const [resList, bookingsList] = await Promise.all([
        tenantId ? CabinetApi.getResources(tenantId) : Promise.resolve([]),
        CabinetApi.getMyBookings(),
      ]);

      setResources(resList || []);
      setMyBookings(bookingsList || []);
    } catch (e) {
      console.warn('Failed to load amenities data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenBook = (resource: BookableResource) => {
    setSelectedResource(resource);
    setBookNote('');
    setSubmitError(null);
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResource) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const startTime = new Date(`${bookDate}T${bookStart}:00`).toISOString();
      const endTime = new Date(`${bookDate}T${bookEnd}:00`).toISOString();

      await CabinetApi.createBooking(selectedResource.id, {
        startTime,
        endTime,
        note: bookNote.trim() || undefined,
      });

      setSelectedResource(null);
      alert(t('cabinet.bookingCreatedSuccess'));
      await loadData();
      setActiveTab('my');
    } catch (err: any) {
      setSubmitError(err?.message || t('cabinet.bookingCreateError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelBooking = async (id: string) => {
    if (!confirm(t('cabinet.cancelBookingConfirm'))) return;
    try {
      await CabinetApi.cancelBooking(id);
      alert(t('cabinet.bookingCancelledSuccess'));
      await loadData();
    } catch (err: any) {
      alert(err?.message || t('cabinet.bookingCancelError'));
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      return new Intl.DateTimeFormat(
        i18n.language === 'en' ? 'en-US' : i18n.language === 'kk' ? 'kk-KZ' : 'ru-RU',
        {
          day: 'numeric',
          month: 'short',
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
            {t('cabinet.bookingTitle')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('cabinet.bookingSubtitle')}
          </p>
        </div>

        {/* Tabs switcher */}
        <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl self-start sm:self-center">
          <button
            type="button"
            onClick={() => setActiveTab('resources')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'resources'
                ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            {t('cabinet.allZones')} ({resources.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('my')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'my'
                ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            {t('cabinet.myBookings')} ({myBookings.length})
          </button>
        </div>
      </div>

      {/* Tab: Resources */}
      {activeTab === 'resources' && (
        <>
          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            </div>
          ) : resources.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center shadow-sm">
              <Calendar className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                {t('cabinet.noAvailableZones')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {t('cabinet.noAvailableZonesDesc')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {resources.map((res) => (
                <div
                  key={res.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="font-bold text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">
                        {getResourceTypeLabel(res.type, t)}
                      </span>
                      {res.maxDurationMinutes && (
                        <span className="text-slate-400 text-[11px]">
                          {t('cabinet.hoursMax', { hours: res.maxDurationMinutes / 60 })}
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {res.name}
                    </h3>
                    {res.description && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                        {res.description}
                      </p>
                    )}

                    {(res.operatingHoursStart || res.operatingHoursEnd) && (
                      <div className="mt-3 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>
                          {t('cabinet.workingHours')}: {res.operatingHoursStart || '09:00'} —{' '}
                          {res.operatingHoursEnd || '22:00'}
                        </span>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenBook(res)}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <Calendar className="w-4 h-4" />
                    <span>{t('cabinet.bookResource')}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Tab: My Bookings */}
      {activeTab === 'my' && (
        <div className="space-y-4">
          {myBookings.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center shadow-sm">
              <Calendar className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                {t('cabinet.noBookings')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {t('cabinet.noBookingsDesc')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myBookings.map((b) => (
                <div
                  key={b.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {b.resource?.name || t('cabinet.bookResource')}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          b.status === 'CONFIRMED'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {getBookingStatusLabel(b.status, t)}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-2 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          {formatDate(b.startTime)} — {formatDate(b.endTime)}
                        </span>
                      </div>
                      {b.note && <div className="text-[11px] italic">«{b.note}»</div>}
                    </div>
                  </div>

                  {b.status === 'CONFIRMED' && (
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleCancelBooking(b.id)}
                        className="text-xs font-semibold text-red-600 hover:underline flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{t('cabinet.cancelBooking')}</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Booking Modal */}
      {selectedResource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl relative animate-in fade-in duration-200">
            <button
              type="button"
              onClick={() => setSelectedResource(null)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label={t('cabinet.close')}
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {t('cabinet.bookResource')}
            </h3>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
              {selectedResource.name}
            </p>

            {submitError && (
              <div className="mt-3 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 text-xs">
                {submitError}
              </div>
            )}

            <form onSubmit={handleCreateBooking} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('cabinet.bookingDate')}
                </label>
                <input
                  type="date"
                  value={bookDate}
                  onChange={(e) => setBookDate(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('cabinet.bookingStart')}
                  </label>
                  <input
                    type="time"
                    value={bookStart}
                    onChange={(e) => setBookStart(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('cabinet.bookingEnd')}
                  </label>
                  <input
                    type="time"
                    value={bookEnd}
                    onChange={(e) => setBookEnd(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white text-xs"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('cabinet.bookingNote')}
                </label>
                <input
                  type="text"
                  value={bookNote}
                  onChange={(e) => setBookNote(e.target.value)}
                  placeholder="Например: Праздник, 4 человека"
                  className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white text-xs"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>{t('cabinet.confirmBooking')}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
