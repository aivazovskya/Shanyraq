'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Bell, CheckCheck, Loader2, ExternalLink, Settings, ChevronLeft } from 'lucide-react';
import { apiRequest } from '@/lib/api';

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  body: string;
  data?: Record<string, any> | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationPreferences {
  CHAT: boolean;
  SERVICE_REQUEST: boolean;
  ANNOUNCEMENT: boolean;
  FINANCE: boolean;
}

export function NotificationBell() {
  const { t } = useTranslation();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    CHAT: true,
    SERVICE_REQUEST: true,
    ANNOUNCEMENT: true,
    FINANCE: true,
  });
  const [loadingPrefs, setLoadingPrefs] = useState(false);
  const [updatingPref, setUpdatingPref] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchPreferences = useCallback(async () => {
    setLoadingPrefs(true);
    try {
      const prefs = await apiRequest<NotificationPreferences>('/notifications/preferences');
      if (prefs) {
        setPreferences(prefs);
      }
    } catch {
      // Ignore if fetch fails
    } finally {
      setLoadingPrefs(false);
    }
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await apiRequest<{ count: number; unreadCount: number }>('/notifications/unread-count');
      setUnreadCount(res.unreadCount ?? res.count ?? 0);
    } catch {
      // Ignore if session not ready
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const items = await apiRequest<NotificationItem[]>('/notifications?take=20');
      setNotifications(items || []);
    } catch {
      // Ignore fetch errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
      fetchUnreadCount();
    }
  }, [isOpen, fetchNotifications, fetchUnreadCount]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleTogglePreference = async (key: keyof NotificationPreferences) => {
    const nextVal = !preferences[key];
    setPreferences((prev) => ({ ...prev, [key]: nextVal }));
    setUpdatingPref(key);
    try {
      const updated = await apiRequest<NotificationPreferences>('/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ [key]: nextVal }),
      });
      if (updated) {
        setPreferences(updated);
      }
    } catch {
      setPreferences((prev) => ({ ...prev, [key]: !nextVal }));
    } finally {
      setUpdatingPref(null);
    }
  };

  const PREFERENCE_CATEGORIES: Array<{
    key: keyof NotificationPreferences;
    labelKey: string;
    descKey: string;
  }> = [
    {
      key: 'CHAT',
      labelKey: 'notifications.preferences.chat',
      descKey: 'notifications.preferences.chatDesc',
    },
    {
      key: 'SERVICE_REQUEST',
      labelKey: 'notifications.preferences.serviceRequest',
      descKey: 'notifications.preferences.serviceRequestDesc',
    },
    {
      key: 'ANNOUNCEMENT',
      labelKey: 'notifications.preferences.announcement',
      descKey: 'notifications.preferences.announcementDesc',
    },
    {
      key: 'FINANCE',
      labelKey: 'notifications.preferences.finance',
      descKey: 'notifications.preferences.financeDesc',
    },
  ];

  const handleMarkAllRead = async () => {
    try {
      await apiRequest('/notifications/read-all', { method: 'PATCH' });
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
    } catch {
      // Handle error gracefully
    }
  };

  const getTargetRoute = (data?: Record<string, any> | null): string | null => {
    if (!data) return null;
    const type = data.type || '';

    if (type.includes('SOS') || data.alertId) return '/dashboard/sos';
    if (type.includes('CHAT') || data.conversationId) return '/dashboard/chat';
    if (type.includes('REQUEST') || data.requestId) return '/dashboard/requests';
    if (type.includes('VOTING') || type.includes('MEETING') || data.meetingId) return '/dashboard/votings';
    if (type.includes('ANNOUNCEMENT') || data.announcementId) return '/dashboard/announcements';
    if (type.includes('BOOKING') || data.bookingId) return '/dashboard/bookings';
    if (type.includes('BILL') || type.includes('PAYMENT') || data.invoiceId) return '/dashboard/finance';

    return null;
  };

  const handleItemClick = async (item: NotificationItem) => {
    if (!item.isRead) {
      try {
        await apiRequest(`/notifications/${item.id}/read`, { method: 'PATCH' });
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)),
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch {
        // Continue navigation even if mark-read failed
      }
    }

    const route = getTargetRoute(item.data);
    if (route) {
      setIsOpen(false);
      router.push(route);
    }
  };

  const formatRelativeTime = (isoDate: string): string => {
    try {
      const date = new Date(isoDate);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMinutes < 1) return t('notifications.justNow');
      if (diffMinutes < 60) return t('notifications.minutesAgo', { count: diffMinutes });
      if (diffHours < 24) return t('notifications.hoursAgo', { count: diffHours });
      return t('notifications.daysAgo', { count: diffDays });
    } catch {
      return '';
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell Button */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (isOpen) {
            setShowSettings(false);
          }
        }}
        className="relative p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500"
        aria-label={t('notifications.title')}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-rose-600 rounded-full border-2 border-white animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Panel Header */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            {showSettings ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-1 -ml-1 text-slate-500 hover:text-slate-800 rounded-md hover:bg-slate-200/60 transition-colors cursor-pointer"
                  title={t('notifications.backToNotifications')}
                  aria-label={t('notifications.backToNotifications')}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-semibold text-sm text-slate-800">
                  {t('notifications.settingsTitle')}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-slate-800">
                  {t('notifications.title')}
                </span>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-rose-100 text-rose-700">
                    {unreadCount}
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              {!showSettings && unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="inline-flex items-center gap-1 text-xs text-sky-600 hover:text-sky-800 font-medium hover:underline cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  {t('notifications.markAllAsRead')}
                </button>
              )}
              <button
                onClick={() => {
                  const next = !showSettings;
                  setShowSettings(next);
                  if (next) {
                    fetchPreferences();
                  }
                }}
                className={`p-1.5 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors cursor-pointer ${
                  showSettings ? 'text-sky-600 bg-sky-100/70 hover:bg-sky-100' : ''
                }`}
                title={showSettings ? t('notifications.backToNotifications') : t('notifications.settingsTitle')}
                aria-label={showSettings ? t('notifications.backToNotifications') : t('notifications.settingsTitle')}
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Panel Content */}
          {showSettings ? (
            <div className="p-4 space-y-3 max-h-[380px] overflow-y-auto">
              <div className="pb-2 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-700">
                  {t('notifications.preferences.title')}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  {t('notifications.preferences.subtitle')}
                </p>
              </div>

              {loadingPrefs ? (
                <div className="py-8 flex items-center justify-center text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {PREFERENCE_CATEGORIES.map((cat) => {
                    const isEnabled = preferences[cat.key];
                    return (
                      <div
                        key={cat.key}
                        className="py-2.5 first:pt-1 last:pb-1 flex items-start justify-between gap-3"
                      >
                        <div className="flex-1 min-w-0 pr-2">
                          <p className="text-xs font-semibold text-slate-800">
                            {t(cat.labelKey)}
                          </p>
                          <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                            {t(cat.descKey)}
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isEnabled}
                          disabled={updatingPref === cat.key}
                          onClick={() => handleTogglePreference(cat.key)}
                          className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1 ${
                            isEnabled ? 'bg-sky-600' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              isEnabled ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
              {loading && notifications.length === 0 ? (
                <div className="p-8 flex items-center justify-center text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <Bell className="w-8 h-8 mx-auto mb-2 text-slate-300 opacity-60" />
                  <p className="text-xs font-medium">{t('notifications.empty')}</p>
                </div>
              ) : (
                notifications.map((item) => {
                  const route = getTargetRoute(item.data);
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleItemClick(item)}
                      className={`p-3.5 transition-colors cursor-pointer flex gap-3 items-start ${
                        !item.isRead ? 'bg-sky-50/60 hover:bg-sky-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* Unread indicator dot */}
                      <div className="pt-1 shrink-0">
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${
                            !item.isRead ? 'bg-sky-600' : 'bg-transparent'
                          }`}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <p
                            className={`text-xs truncate ${
                              !item.isRead
                                ? 'font-semibold text-slate-900'
                                : 'font-medium text-slate-700'
                            }`}
                          >
                            {item.title}
                          </p>
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {formatRelativeTime(item.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                          {item.body}
                        </p>
                      </div>

                      {route && (
                        <div className="pt-1 text-slate-400 hover:text-slate-600 shrink-0">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
