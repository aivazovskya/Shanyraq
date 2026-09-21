'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ClipboardList,
  RefreshCw,
  Send,
  AlertCircle,
  Building2,
  Clock,
} from 'lucide-react';
import { apiRequest, getStoredSession, AuthUser, getApiErrorMessage } from '@/lib/api';

interface TenantItem {
  id: string;
  name: string;
  city?: string;
}

interface ShiftHandoverAuthor {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface ShiftHandoverNote {
  id: string;
  tenantId: string;
  authorId: string;
  content: string;
  createdAt: string;
  author: ShiftHandoverAuthor;
}

export default function ShiftHandoverPage() {
  const { t, i18n } = useTranslation();

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(
    () => getStoredSession()?.user || null,
  );
  const [tenantId, setTenantId] = useState<string>(
    () => getStoredSession()?.user?.tenantId || '',
  );
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [loadingTenants, setLoadingTenants] = useState<boolean>(false);

  const [notes, setNotes] = useState<ShiftHandoverNote[]>([]);
  const [loading, setLoading] = useState<boolean>(
    () => Boolean(getStoredSession()?.user?.tenantId),
  );
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Compose state
  const [content, setContent] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadNotes = useCallback(
    async (tId: string, isRefreshAction = false) => {
      if (!tId) {
        setNotes([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      try {
        if (isRefreshAction) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setErrorMsg(null);

        const data = await apiRequest<ShiftHandoverNote[]>(
          `/shift-handover/tenants/${tId}/notes`,
        );
        setNotes(data || []);
      } catch (err: any) {
        console.error('Failed to load shift handover notes:', err);
        setErrorMsg(getApiErrorMessage(err, t) || t('shiftHandover.loadError'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [t],
  );

  useEffect(() => {
    const session = getStoredSession();
    if (session?.user) {
      setCurrentUser(session.user);
      const isSuper = session.user.role === 'SUPERADMIN';

      if (isSuper) {
        setLoadingTenants(true);
        apiRequest<TenantItem[]>('/properties/tenants')
          .then((data) => {
            setTenants(data || []);
          })
          .catch((err) => {
            console.error('Failed to load tenants for superadmin:', err);
          })
          .finally(() => {
            setLoadingTenants(false);
          });

        if (session.user.tenantId) {
          setTenantId(session.user.tenantId);
          loadNotes(session.user.tenantId);
        } else {
          setLoading(false);
        }
      } else {
        const effectiveTenantId = session.user.tenantId;
        if (!effectiveTenantId) {
          setErrorMsg(t('common.userNotAuthorizedOrLinked'));
          setLoading(false);
          return;
        }
        setTenantId(effectiveTenantId);
        loadNotes(effectiveTenantId);
      }
    } else {
      setErrorMsg(t('common.userNotAuthorizedOrLinked'));
      setLoading(false);
    }
  }, [loadNotes, t]);

  const handleRefresh = () => {
    if (tenantId) {
      loadNotes(tenantId, true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) {
      setFormError(t('shiftHandover.fillRequiredError'));
      return;
    }
    if (!tenantId) {
      return;
    }

    try {
      setIsSubmitting(true);
      setFormError(null);

      await apiRequest<ShiftHandoverNote>(
        `/shift-handover/tenants/${tenantId}/notes`,
        {
          method: 'POST',
          body: JSON.stringify({ content: trimmed }),
        },
      );

      setContent('');
      await loadNotes(tenantId, true);
    } catch (err: any) {
      console.error('Failed to post shift handover note:', err);
      setFormError(getApiErrorMessage(err, t) || t('common.error'));
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

  const canPost = !!currentUser && currentUser.role !== 'HOA_CHAIRMAN';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList className="h-7 w-7 text-indigo-600" />
            {t('shiftHandover.pageTitle')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('shiftHandover.pageSubtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {currentUser?.role === 'SUPERADMIN' && (
            <div className="flex items-center gap-2 bg-white border border-indigo-200 rounded-lg px-3 py-1.5 shadow-sm">
              <Building2 className="h-4 w-4 text-indigo-600 flex-shrink-0" />
              <select
                value={tenantId}
                onChange={(e) => {
                  const newTId = e.target.value;
                  setTenantId(newTId);
                  if (newTId) {
                    loadNotes(newTId);
                  } else {
                    setNotes([]);
                  }
                }}
                disabled={loadingTenants}
                className="text-sm font-medium text-gray-800 bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="">
                  {t('shiftHandover.selectTenantPlaceholder')}
                </option>
                {tenants.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} {item.city ? `(${item.city})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={handleRefresh}
            disabled={loading || refreshing || !tenantId}
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-gray-300 rounded-xl bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-60"
          >
            <RefreshCw
              className={`w-4 h-4 ${loading || refreshing ? 'animate-spin' : ''}`}
            />
            <span>{t('shiftHandover.refreshBtn')}</span>
          </button>
        </div>
      </div>

      {/* Global Error Banner */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">{errorMsg}</div>
          <button
            onClick={() => setErrorMsg(null)}
            className="text-red-400 hover:text-red-600 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Superadmin No Tenant Selected Prompt */}
      {currentUser?.role === 'SUPERADMIN' && !tenantId && !loading && (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-12 text-center">
          <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">
            {t('shiftHandover.selectTenantPromptTitle')}
          </h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            {t('shiftHandover.selectTenantPromptSub')}
          </p>
        </div>
      )}

      {/* Main Grid: Compose (if allowed) + Feed */}
      {(!currentUser || currentUser.role !== 'SUPERADMIN' || tenantId) && (
        <div
          className={`grid grid-cols-1 ${canPost ? 'lg:grid-cols-3' : 'lg:grid-cols-1'} gap-8`}
        >
          {/* Compose Box (hidden for HOA_CHAIRMAN) */}
          {canPost && (
            <div className="lg:col-span-1">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm sticky top-8">
                <div className="flex items-center gap-2 text-slate-900 font-semibold mb-4 text-base">
                  <ClipboardList className="w-5 h-5 text-indigo-600" />
                  <span>{t('shiftHandover.composeTitle')}</span>
                </div>

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
                    <textarea
                      rows={5}
                      maxLength={2000}
                      placeholder={t('shiftHandover.composePlaceholder')}
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      disabled={isSubmitting || !tenantId}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y disabled:bg-gray-50"
                    />
                    <div className="flex justify-end mt-1 text-xs text-slate-400">
                      <span>{content.length} / 2000</span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || !content.trim() || !tenantId}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>{t('shiftHandover.postingBtn')}</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>{t('shiftHandover.postBtn')}</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Feed Column */}
          <div className={canPost ? 'lg:col-span-2 space-y-4' : 'w-full space-y-4'}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">
                {t('shiftHandover.recentNotesTitle')}
              </h2>
              {notes.length > 0 && (
                <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                  {notes.length}
                </span>
              )}
            </div>

            {loading ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
                <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-500">
                  {t('common.loading') || 'Загрузка...'}
                </p>
              </div>
            ) : notes.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-sm">
                <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-gray-900 mb-1">
                  {t('shiftHandover.emptyFeedTitle')}
                </h3>
                <p className="text-sm text-gray-500 max-w-sm mx-auto">
                  {t('shiftHandover.emptyFeedSub')}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {notes.map((note) => {
                  const authorName = `${note.author.firstName || ''} ${note.author.lastName || ''}`.trim() || '—';
                  const initials = `${note.author.firstName?.[0] || ''}${note.author.lastName?.[0] || ''}` || 'SH';
                  const localizedDate = new Date(note.createdAt).toLocaleString(
                    i18n.language === 'kk'
                      ? 'kk-KZ'
                      : i18n.language === 'en'
                        ? 'en-US'
                        : 'ru-RU',
                    {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    },
                  );

                  return (
                    <div
                      key={note.id}
                      className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm transition hover:border-slate-300 space-y-3"
                    >
                      {/* Note Header: Author & Timestamp */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-xs">
                            {initials}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-900">
                                {authorName}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-medium">
                                {getRoleBadge(note.author.role)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 text-xs text-slate-400">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{localizedDate}</span>
                        </div>
                      </div>

                      {/* Note Content */}
                      <p className="text-sm text-slate-800 whitespace-pre-line leading-relaxed pl-10">
                        {note.content}
                      </p>

                      {/* Footer ID */}
                      <div className="pt-2 border-t border-slate-100 flex justify-end">
                        <span className="text-[11px] text-slate-400">
                          ID: {note.id.slice(0, 8)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
