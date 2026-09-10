'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Bell, CheckCheck, Loader2, ExternalLink } from 'lucide-react';
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

export function NotificationBell() {
  const { t } = useTranslation();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
        onClick={() => setIsOpen(!isOpen)}
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
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="inline-flex items-center gap-1 text-xs text-sky-600 hover:text-sky-800 font-medium hover:underline cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                {t('notifications.markAllAsRead')}
              </button>
            )}
          </div>

          {/* Panel Content */}
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
        </div>
      )}
    </div>
  );
}
