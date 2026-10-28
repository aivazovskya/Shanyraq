'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  AlertCircle,
  Clock,
  User,
  X,
  ChevronRight,
  Loader2,
  Calendar,
} from 'lucide-react';
import {
  CabinetApi,
  AnnouncementItem,
  ResidentProfile,
} from '@/lib/cabinet-api';
import { getRoleLabel } from '@/lib/cabinet-labels';

export default function CabinetAnnouncementsPage() {
  const { t, i18n } = useTranslation();

  const [profile, setProfile] = useState<ResidentProfile | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [urgentOnly, setUrgentOnly] = useState(false);

  // Selected Announcement Modal
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<AnnouncementItem | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const me = await CabinetApi.getMe();
      setProfile(me);

      const tenantId = me.tenantId || me.ownerships?.[0]?.unit?.building?.tenantId;
      if (tenantId) {
        const list = await CabinetApi.getAnnouncements(tenantId);
        setAnnouncements(list || []);
      }
    } catch (e) {
      console.warn('Failed to load announcements:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = announcements.filter((a) => (!urgentOnly ? true : a.isUrgent));

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
            {t('navigation.cabinetAnnouncements')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('cabinet.announcementsSubtitle')}
          </p>
        </div>

        {/* Filter buttons */}
        <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl self-start sm:self-center">
          <button
            type="button"
            onClick={() => setUrgentOnly(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              !urgentOnly
                ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            {t('cabinet.allAnnouncements')} ({announcements.length})
          </button>
          <button
            type="button"
            onClick={() => setUrgentOnly(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              urgentOnly
                ? 'bg-white dark:bg-slate-700 text-red-700 dark:text-red-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            {t('cabinet.urgentOnly')}
          </button>
        </div>
      </div>

      {/* Announcements List */}
      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center shadow-sm">
          <Bell className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            {t('cabinet.noAnnouncements')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('cabinet.noAnnouncementsDesc')}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedAnnouncement(item)}
              className={`p-5 rounded-2xl border shadow-sm cursor-pointer transition-all ${
                item.isUrgent
                  ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60 hover:border-amber-400'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-500'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  {item.isUrgent && (
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
                      {t('common.urgent')}
                    </span>
                  )}
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatDate(item.createdAt)}</span>
                  </span>
                </div>

                <ChevronRight className="w-4 h-4 text-slate-400" />
              </div>

              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {item.title}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 line-clamp-2">
                {item.content}
              </p>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5 text-[11px] text-slate-500">
                <User className="w-3.5 h-3.5" />
                <span>
                  {t('cabinet.author')}: {item.author?.firstName} {item.author?.lastName} ({getRoleLabel(item.author?.role, t)})
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Selected Announcement Modal */}
      {selectedAnnouncement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl relative animate-in fade-in duration-200">
            <button
              type="button"
              onClick={() => setSelectedAnnouncement(null)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label={t('cabinet.close')}
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-2">
              {selectedAnnouncement.isUrgent && (
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                  {t('common.urgent')}
                </span>
              )}
              <span className="text-xs text-slate-400">
                {formatDate(selectedAnnouncement.createdAt)}
              </span>
            </div>

            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              {selectedAnnouncement.title}
            </h3>

            <div className="mt-4 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
              {selectedAnnouncement.content}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
              {t('cabinet.author')}:{' '}
              <span className="font-semibold text-slate-900 dark:text-white">
                {selectedAnnouncement.author?.firstName} {selectedAnnouncement.author?.lastName}
              </span>{' '}
              ({getRoleLabel(selectedAnnouncement.author?.role, t)})
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
