'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  Send,
  AlertTriangle,
  Calendar,
  User,
  CheckCircle2,
  Megaphone,
  RefreshCw,
  Loader2,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { apiRequest, getStoredSession } from '@/lib/api';

interface AnnouncementItem {
  id: string;
  tenantId: string;
  authorId: string;
  title: string;
  content: string;
  isUrgent: boolean;
  createdAt: string;
  author: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  };
}

export default function AnnouncementsPage() {
  const { t, i18n } = useTranslation();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState('');

  const loadAnnouncements = useCallback(async () => {
    try {
      setLoading(true);
      setFeedError(null);
      const session = getStoredSession();
      if (!session || !session.user || !session.user.tenantId) {
        throw new Error(t('common.userNotAuthorizedOrLinked'));
      }
      if (session.user.tenantName) {
        setTenantName(session.user.tenantName);
      }

      const data = await apiRequest<AnnouncementItem[]>(
        `/announcements/tenant/${session.user.tenantId}`,
      );

      setAnnouncements(data);
    } catch (err: any) {
      setFeedError(err.message || t('announcements.loadFeedError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setFormError(t('announcements.fillRequiredError'));
      return;
    }

    try {
      setIsSubmitting(true);
      setFormError(null);
      setSuccessMessage(null);

      await apiRequest('/announcements', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          isUrgent,
        }),
      });

      setSuccessMessage(
        isUrgent
          ? t('announcements.urgentSuccess')
          : t('announcements.regularSuccess'),
      );

      setTitle('');
      setContent('');
      setIsUrgent(false);

      // Перезагрузка ленты из БД
      await loadAnnouncements();
    } catch (err: any) {
      if (err.status === 403) {
        setFormError(t('announcements.error403'));
      } else if (err.status === 400) {
        setFormError(t('announcements.error400', { message: err.message }));
      } else {
        setFormError(err.message || t('common.error'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'SUPERADMIN':
        return t('roles.superadmin');
      case 'HOA_ADMIN':
        return t('roles.management_company');
      case 'HOA_CHAIRMAN':
        return t('roles.hoa_chairman');
      case 'DISPATCHER':
        return t('roles.dispatcher');
      case 'SECURITY':
        return t('roles.security');
      default:
        return t('roles.employee');
    }
  };

  return (
    <div className="space-y-6">
      {/* Заголовок страницы */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {t('announcements.title')}
            </h1>
            {tenantName && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800">
                {tenantName}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600 mt-1">
            {t('announcements.subtitle')}
          </p>
        </div>

        <button
          onClick={loadAnnouncements}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 border border-slate-300 rounded-xl bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-60 self-start"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>{t('announcements.refreshBtn')}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Левая колонка: Форма создания новости */}
        <div className="lg:col-span-1">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm sticky top-8">
            <div className="flex items-center gap-2 text-slate-900 font-semibold mb-4 text-base">
              <Megaphone className="w-5 h-5 text-sky-600" />
              <span>{t('announcements.newFormTitle')}</span>
            </div>

            {successMessage && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span className="flex-1">{successMessage}</span>
                <button
                  onClick={() => setSuccessMessage(null)}
                  className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  ✕
                </button>
              </div>
            )}

            {formError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span className="flex-1">{formError}</span>
                <button
                  onClick={() => setFormError(null)}
                  className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  ✕
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  {t('announcements.titleLabel')}
                </label>
                <input
                  type="text"
                  required
                  placeholder={t('announcements.titlePlaceholder')}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  {t('announcements.contentLabel')}
                </label>
                <textarea
                  required
                  rows={5}
                  placeholder={t('announcements.contentPlaceholder')}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent resize-none"
                />
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isUrgent}
                    onChange={(e) => setIsUrgent(e.target.checked)}
                    className="mt-0.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500 w-4 h-4"
                  />
                  <div>
                    <span className="text-xs font-bold text-amber-900 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      {t('announcements.urgentCheckbox')}
                    </span>
                    <p className="text-[11px] text-amber-800/80 mt-0.5">
                      {t('announcements.urgentHelper')}
                    </p>
                  </div>
                </label>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors disabled:opacity-60"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>{isSubmitting ? t('announcements.publishingBtn') : t('announcements.publishBtn')}</span>
              </button>
            </form>
          </div>
        </div>

        {/* Правая колонка: Лента ранее опубликованных новостей */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">{t('announcements.feedTitle')}</h2>
            <span className="text-xs text-slate-500">
              {t('announcements.totalPosts', 'Всего публикаций: {{count}}', { count: announcements.length })}
            </span>
          </div>

          {feedError && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                <span>{feedError}</span>
              </div>
              <button
                onClick={loadAnnouncements}
                className="text-xs underline font-semibold hover:text-red-950"
              >
                {t('common.refresh', 'Повторить')}
              </button>
            </div>
          )}

          {loading ? (
            <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3 bg-white rounded-2xl border border-slate-200">
              <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
              <p className="text-sm font-medium">{t('common.loading')}</p>
            </div>
          ) : announcements.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                <Bell className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-slate-900">{t('announcements.emptyFeedTitle')}</h3>
              <p className="text-sm text-slate-500 mt-1">
                {t('announcements.emptyFeedSub')}
              </p>
            </div>
          ) : (
            announcements.map((item) => (
              <div
                key={item.id}
                className={`p-5 bg-white rounded-2xl border transition-all ${
                  item.isUrgent
                    ? 'border-amber-300 shadow-sm bg-gradient-to-r from-amber-50/40 via-white to-white'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="flex items-center gap-2">
                    {item.isUrgent && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        <AlertTriangle className="w-3 h-3" />
                        {t('announcements.urgentBadge')}
                      </span>
                    )}
                    <h3 className="text-base font-bold text-slate-900">{item.title}</h3>
                  </div>

                  <span className="text-xs text-slate-400 shrink-0 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {new Date(item.createdAt).toLocaleString(
                      i18n.language === 'kk' ? 'kk-KZ' : i18n.language === 'en' ? 'en-US' : 'ru-RU',
                      {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      }
                    )}
                  </span>
                </div>

                <p className="text-sm text-slate-600 whitespace-pre-line leading-relaxed mb-4">
                  {item.content}
                </p>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-semibold text-[10px]">
                      {item.author.firstName[0]}
                      {item.author.lastName[0]}
                    </div>
                    <span>
                      {item.author.firstName} {item.author.lastName}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-medium">
                      {getRoleBadge(item.author.role)}
                    </span>
                  </div>

                  <span className="text-[11px] text-slate-400">
                    ID: {item.id.slice(0, 8)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
