'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Wrench,
  Plus,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  MessageSquare,
  Star,
  Send,
  X,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Image as ImageIcon,
  User,
  Paperclip,
} from 'lucide-react';
import {
  CabinetApi,
  ServiceRequestItem,
  RequestCategory,
  RequestPriority,
  RequestStatus,
} from '@/lib/cabinet-api';
import {
  getRequestStatusLabel,
  getRequestCategoryLabel,
  getRequestPriorityLabel,
} from '@/lib/cabinet-labels';

const CATEGORIES: Array<{ key: RequestCategory; label: string }> = [
  { key: 'PLUMBING', label: 'Сантехника' },
  { key: 'ELECTRICAL', label: 'Электрика' },
  { key: 'ELEVATOR', label: 'Лифт' },
  { key: 'HEATING', label: 'Отопление' },
  { key: 'YARD_TERRITORY', label: 'Двор и территория' },
  { key: 'INTERCOM_ACCESS', label: 'Домофон и доступ' },
  { key: 'CLEANING', label: 'Уборка' },
  { key: 'OTHER', label: 'Другое' },
];

const PRIORITIES: Array<{ key: RequestPriority; label: string; desc: string }> = [
  { key: 'LOW', label: 'Низкий', desc: 'Плановые работы без спешки' },
  { key: 'MEDIUM', label: 'Обычный', desc: 'Стандартный срок устранения' },
  { key: 'HIGH', label: 'Высокий', desc: 'Требует внимания в течение суток' },
  { key: 'EMERGENCY', label: 'Аварийный', desc: 'Угроза залива, пожара, застрял лифт' },
];

export default function CabinetRequestsPage() {
  const { t, i18n } = useTranslation();

  const [requests, setRequests] = useState<ServiceRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // New Request Wizard State
  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [unitId, setUnitId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<RequestCategory>('PLUMBING');
  const [priority, setPriority] = useState<RequestPriority>('MEDIUM');
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Selected Request Detail Modal State
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequestItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);

  // Rating Modal State
  const [showRating, setShowRating] = useState(false);
  const [ratingScore, setRatingScore] = useState(5);
  const [ratingFeedback, setRatingFeedback] = useState('');
  const [ratingSubmitting, setRatingSubmitting] = useState(false);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const [reqList, me] = await Promise.all([
        CabinetApi.getRequests(statusFilter),
        CabinetApi.getMe(),
      ]);
      setRequests(reqList || []);
      if (me?.ownerships?.[0]?.unitId) {
        setUnitId(me.ownerships[0].unitId);
      }
    } catch (e) {
      console.warn('Failed to load requests:', e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const openDetails = async (req: ServiceRequestItem) => {
    setSelectedRequest(req);
    setDetailLoading(true);
    try {
      const full = await CabinetApi.getRequestDetails(req.id);
      setSelectedRequest(full);
    } catch (e) {
      console.warn('Failed to load request details:', e);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest || !commentText.trim()) return;
    setCommentLoading(true);
    try {
      await CabinetApi.addRequestComment(selectedRequest.id, commentText.trim());
      const updated = await CabinetApi.getRequestDetails(selectedRequest.id);
      setSelectedRequest(updated);
      setCommentText('');
    } catch (err: any) {
      alert(err?.message || 'Ошибка добавления комментария');
    } finally {
      setCommentLoading(false);
    }
  };

  const handleSubmitRequest = async () => {
    if (!unitId || !title.trim() || !description.trim()) {
      alert(t('common.requiredFields') || 'Заполните обязательные поля');
      return;
    }

    setSubmitting(true);
    try {
      await CabinetApi.createRequest({
        unitId,
        title: title.trim(),
        description: description.trim(),
        category,
        priority,
      });

      setShowWizard(false);
      setStep(1);
      setTitle('');
      setDescription('');
      setCategory('PLUMBING');
      setPriority('MEDIUM');
      setPhotoError(null);
      await loadRequests();
    } catch (err: any) {
      alert(err?.message || t('cabinet.createRequestError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest) return;
    setRatingSubmitting(true);
    try {
      await CabinetApi.rateRequest(selectedRequest.id, ratingScore, ratingFeedback);
      setShowRating(false);
      const updated = await CabinetApi.getRequestDetails(selectedRequest.id);
      setSelectedRequest(updated);
    } catch (err: any) {
      alert(err?.message || 'Ошибка сохранения оценки');
    } finally {
      setRatingSubmitting(false);
    }
  };

  const getStatusBadge = (status: RequestStatus) => {
    switch (status) {
      case 'PENDING':
        return 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300';
      case 'ASSIGNED':
      case 'IN_PROGRESS':
        return 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300';
      case 'RESOLVED':
      case 'CLOSED':
        return 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300';
      case 'REJECTED':
        return 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300';
      default:
        return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300';
    }
  };

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
            {t('navigation.cabinetRequests')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Заявки на ремонт сантехники, электрики, домофона и обслуживание ЖК
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowWizard(true);
            setStep(1);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors self-start sm:self-center"
        >
          <Plus className="w-4 h-4" />
          <span>{t('cabinet.createRequest')}</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {['ALL', 'PENDING', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              statusFilter === st
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
            }`}
          >
            {st === 'ALL'
              ? t('cabinet.allRequests')
              : st === 'PENDING'
              ? 'В ожидании'
              : st === 'IN_PROGRESS'
              ? 'В работе'
              : st === 'RESOLVED'
              ? 'Выполнены'
              : 'Закрыты'}
          </button>
        ))}
      </div>

      {/* Requests List */}
      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center shadow-sm">
          <Wrench className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            {t('cabinet.noRequests')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('cabinet.emptyRequestsDesc')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {requests.map((req) => (
            <div
              key={req.id}
              onClick={() => openDetails(req)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm hover:border-emerald-500 cursor-pointer transition-all flex flex-col justify-between gap-3 group"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getStatusBadge(
                      req.status,
                    )}`}
                  >
                    {getRequestStatusLabel(req.status, t)}
                  </span>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    {formatDate(req.createdAt)}
                  </span>
                </div>

                <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 transition-colors line-clamp-1">
                  {req.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                  {req.description}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[11px]">{getRequestCategoryLabel(req.category, t)}</span>

                <div className="flex items-center gap-3">
                  {req.comments && req.comments.length > 0 && (
                    <span className="flex items-center gap-1 text-[11px]">
                      <MessageSquare className="w-3.5 h-3.5" />
                      {req.comments.length}
                    </span>
                  )}
                  {req.rating && (
                    <span className="flex items-center gap-1 text-amber-500 font-bold text-[11px]">
                      <Star className="w-3.5 h-3.5 fill-current" />
                      {req.rating}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 4-Step Creation Wizard Modal */}
      {showWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl relative animate-in fade-in duration-200">
            <button
              type="button"
              onClick={() => setShowWizard(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label={t('cabinet.close')}
            >
              <X className="w-5 h-5" />
            </button>

            {/* Stepper Header */}
            <div className="mb-5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                <span>{t('cabinet.stepCounter', { step })}</span>
                <span>
                  {step === 1
                    ? t('cabinet.stepCategory')
                    : step === 2
                    ? t('cabinet.stepDescription')
                    : step === 3
                    ? t('cabinet.stepPhoto')
                    : t('cabinet.stepPriority')}
                </span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-emerald-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${(step / 4) * 100}%` }}
                />
              </div>
            </div>

            {/* Step 1: Category */}
            {step === 1 && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {t('cabinet.selectCategory')}
                </h3>
                <div className="grid grid-cols-2 gap-2.5">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => setCategory(cat.key)}
                      className={`p-3 rounded-xl border text-left text-xs font-semibold transition-all ${
                        category === cat.key
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 shadow-sm'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Title & Description */}
            {step === 2 && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {t('cabinet.describeProblem')}
                </h3>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('cabinet.requestTitleLabel')}
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t('cabinet.requestTitlePlaceholder')}
                    className="w-full py-2.5 px-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('cabinet.requestDescLabel')}
                  </label>
                  <textarea
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t('cabinet.requestDescPlaceholder')}
                    className="w-full py-2.5 px-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
              </div>
            )}

            {/* Step 3: Photo (Optional) */}
            {step === 3 && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {t('cabinet.photosOptional')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('cabinet.photosOptionalDesc')}
                </p>

                <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-6 text-center">
                  <ImageIcon className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <label className="cursor-pointer">
                    <span className="text-xs font-semibold text-emerald-600 hover:underline">
                      {t('cabinet.chooseFile')}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={() => {
                        // Notice of mock limit without MinIO as instructed in TASK-021
                        setPhotoError(
                          t('cabinet.minioLocalNotice'),
                        );
                      }}
                    />
                  </label>
                  <p className="text-[11px] text-slate-400 mt-1">{t('cabinet.fileSizeNotice')}</p>
                </div>

                {photoError && (
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200 text-xs">
                    {photoError}
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Priority */}
            {step === 4 && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {t('cabinet.selectPriority')}
                </h3>
                <div className="space-y-2">
                  {PRIORITIES.map((pr) => (
                    <button
                      key={pr.key}
                      type="button"
                      onClick={() => setPriority(pr.key)}
                      className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                        priority === pr.key
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 shadow-sm'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div>
                        <div
                          className={`text-xs font-bold ${
                            pr.key === 'EMERGENCY'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {pr.label}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {pr.desc}
                        </div>
                      </div>
                      {priority === pr.key && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => (s - 1) as any)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>{t('cabinet.prevStep')}</span>
                </button>
              ) : (
                <div />
              )}

              {step < 4 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (step === 2 && (!title.trim() || !description.trim())) {
                      alert('Укажите заголовок и описание проблемы');
                      return;
                    }
                    setStep((s) => (s + 1) as any);
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  <span>{t('cabinet.nextStep')}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmitRequest}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-60"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>{t('cabinet.sendRequest')}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Selected Request Detail & Comments Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl relative max-h-[90vh] flex flex-col animate-in fade-in duration-200">
            <button
              type="button"
              onClick={() => setSelectedRequest(null)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label={t('cabinet.close')}
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-2">
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getStatusBadge(
                  selectedRequest.status,
                )}`}
              >
                {getRequestStatusLabel(selectedRequest.status, t)}
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs font-semibold text-slate-500">{getRequestCategoryLabel(selectedRequest.category, t)}</span>
            </div>

            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              {selectedRequest.title}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-100 dark:border-slate-700/60">
              {selectedRequest.description}
            </p>

            {/* Assignee Card */}
            {selectedRequest.assignee && (
              <div className="mt-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <User className="w-4 h-4 text-emerald-600" />
                  <div>
                    <span className="font-semibold text-emerald-950 dark:text-emerald-200">
                      {t('cabinet.assignedMaster')}:
                    </span>{' '}
                    <span className="text-emerald-800 dark:text-emerald-300">
                      {selectedRequest.assignee.firstName} {selectedRequest.assignee.lastName}
                    </span>
                  </div>
                </div>
                {selectedRequest.assignee.phone && (
                  <a
                    href={`tel:${selectedRequest.assignee.phone}`}
                    className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
                  >
                    {selectedRequest.assignee.phone}
                  </a>
                )}
              </div>
            )}

            {/* Rating Banner if resolved and not rated */}
            {(selectedRequest.status === 'RESOLVED' || selectedRequest.status === 'CLOSED') && (
              <div className="mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-center justify-between text-xs">
                {selectedRequest.rating ? (
                  <div className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300">
                    <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                    <span>{t('cabinet.residentRating', { rating: selectedRequest.rating })}</span>
                  </div>
                ) : (
                  <>
                    <span className="font-medium text-amber-900 dark:text-amber-200">
                      {t('cabinet.ratingTitle')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowRating(true)}
                      className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-colors"
                    >
                      {t('cabinet.rateAction')}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Comments Thread */}
            <div className="mt-4 flex-1 overflow-y-auto border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t('cabinet.commentsTitle', { count: selectedRequest.comments?.length || 0 })}
              </h4>

              {selectedRequest.comments?.length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-400">
                  {t('cabinet.noCommentsYet')}
                </div>
              ) : (
                selectedRequest.comments?.map((com) => (
                  <div
                    key={com.id}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs"
                  >
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {com.author.firstName} {com.author.lastName} ({com.author.role})
                      </span>
                      <span className="text-[10px]">{formatDate(com.createdAt)}</span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300">{com.text}</p>
                  </div>
                ))
              )}
            </div>

            {/* Add Comment Input */}
            <form onSubmit={handleAddComment} className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex gap-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={t('cabinet.commentPlaceholder')}
                className="flex-1 py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="submit"
                disabled={commentLoading || !commentText.trim()}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {commentLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>{t('cabinet.addComment')}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Rating Modal */}
      {showRating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl relative animate-in fade-in duration-200">
            <button
              type="button"
              onClick={() => setShowRating(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label={t('cabinet.close')}
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
              {t('cabinet.ratingTitle')}
            </h3>

            {/* Stars */}
            <div className="flex justify-center gap-2 my-4">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setRatingScore(s)}
                  className="p-1 focus:outline-none"
                >
                  <Star
                    className={`w-7 h-7 ${
                      s <= ratingScore
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-slate-300 dark:text-slate-700'
                    }`}
                  />
                </button>
              ))}
            </div>

            <form onSubmit={handleRateSubmit} className="space-y-4">
              <textarea
                rows={3}
                value={ratingFeedback}
                onChange={(e) => setRatingFeedback(e.target.value)}
                placeholder={t('cabinet.reviewFeedbackPlaceholder')}
                className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />

              <button
                type="submit"
                disabled={ratingSubmitting}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {ratingSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Star className="w-4 h-4 fill-current" />
                )}
                <span>{t('cabinet.ratingSubmit')}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
