'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  CheckCheck,
  Clock,
  Loader2,
  CheckCircle2,
  Info,
  AlertTriangle,
  MessageSquare,
  Wrench,
  CreditCard,
  Megaphone,
} from 'lucide-react';
import { CabinetApi, NotificationItem } from '@/lib/cabinet-api';

export default function CabinetNotificationsPage() {
  const { t, i18n } = useTranslation();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const items = await CabinetApi.getNotifications({ take: 50 });
      setNotifications(items || []);
    } catch (e) {
      console.warn('Failed to load notifications:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await CabinetApi.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
    } catch (e) {
      console.warn('Failed to mark notification read:', e);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await CabinetApi.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (e) {
      console.warn('Failed to mark all read:', e);
    }
  };

  const filtered = notifications.filter((n) => (!unreadOnly ? true : !n.isRead));
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      return new Intl.DateTimeFormat(
        i18n.language === 'en' ? 'en-US' : i18n.language === 'kk' ? 'kk-KZ' : 'ru-RU',
        {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Almaty',
        },
      ).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  };

  const getIcon = (item: NotificationItem) => {
    const type = item.data?.type || '';
    if (type.includes('SOS')) return <AlertTriangle className="w-5 h-5 text-red-500" />;
    if (type.includes('CHAT')) return <MessageSquare className="w-5 h-5 text-emerald-500" />;
    if (type.includes('REQUEST')) return <Wrench className="w-5 h-5 text-emerald-500" />;
    if (type.includes('FINANCE')) return <CreditCard className="w-5 h-5 text-emerald-500" />;
    if (type.includes('COMMUNITY') || type.includes('AD')) return <Megaphone className="w-5 h-5 text-emerald-500" />;
    return <Bell className="w-5 h-5 text-amber-500" />;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {t('navigation.cabinetNotifications')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('cabinet.notificationsSubtitle')}
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllAsRead}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors self-start sm:self-center"
          >
            <CheckCheck className="w-4 h-4 text-emerald-600" />
            <span>{t('cabinet.markAllRead', { count: unreadCount })}</span>
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit">
        <button
          type="button"
          onClick={() => setUnreadOnly(false)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            !unreadOnly
              ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          {t('common.all')} ({notifications.length})
        </button>
        <button
          type="button"
          onClick={() => setUnreadOnly(true)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            unreadOnly
              ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          {t('cabinet.unread', { count: unreadCount })}
        </button>
      </div>

      {/* Notifications List */}
      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center shadow-sm">
          <Bell className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            {t('cabinet.noNotifications')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('cabinet.noNotificationsDesc')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => !item.isRead && handleMarkAsRead(item.id)}
              className={`p-4 rounded-2xl border shadow-sm transition-all flex items-start gap-3.5 ${
                !item.isRead
                  ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60 cursor-pointer'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 shrink-0 mt-0.5">
                {getIcon(item)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {item.title}
                  </h3>
                  <span className="text-[10px] text-slate-400 shrink-0">
                    {formatDate(item.createdAt)}
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                  {item.body}
                </p>
              </div>

              {!item.isRead && (
                <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0 mt-2" title="Не прочитано" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
