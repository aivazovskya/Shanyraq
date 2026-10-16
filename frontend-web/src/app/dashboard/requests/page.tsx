'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  Wrench,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  MessageSquare,
  Star,
  X,
  Send,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { apiRequest, apiBlob, getStoredSession, getApiErrorMessage } from '@/lib/api';
import { Dialog } from '@/components/Dialog';
import { getRequestActions } from '@/lib/request-workflow';

interface Assignee { id: string; firstName: string; lastName: string; role: string }
interface HistoryItem {
  id: string; action: string; createdAt: string;
  actor?: { firstName: string; lastName: string } | null;
  metadata: { fromStatus: string; toStatus: string; fromAssigneeId?: string | null; toAssigneeId?: string | null; assigneeName?: string | null };
}

function AttachmentPreview({ requestId, id, index }: { requestId: string; id: string; index: number }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [contentType, setContentType] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    const controller = new AbortController();
    setLoadError(false);
    setUrl(null);
    setFailed(false);
    apiBlob(`/service-requests/${encodeURIComponent(requestId)}/attachments/${encodeURIComponent(id)}`, controller.signal)
      .then((blob) => { if (active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); setContentType(blob.type); } })
      .catch(() => { if (active && !controller.signal.aborted) setLoadError(true); });
    return () => { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [requestId, id, attempt]);
  if (loadError) return <div role="alert" className="rounded-xl border border-amber-200 p-3 text-sm text-amber-800"><p>{t('requestFlow.invalidAttachment')}</p><button className="mt-2 min-h-11 underline" onClick={() => setAttempt((value) => value + 1)}>{t('common.refresh')}</button></div>;
  if (!url) return <p role="status" className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">{t('common.loading')}</p>;
  return <a href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
    {contentType.startsWith('image/') && !failed && <img src={url} alt={t('requestFlow.photo', { count: index + 1 })} loading="lazy" onError={() => setFailed(true)} className="h-36 w-full object-cover" />}
    <span className="block p-3 text-sm font-medium text-sky-700">{t(failed ? 'requestFlow.previewFailed' : 'requestFlow.openAttachment', { count: index + 1 })}</span>
  </a>;
}

interface CommentItem {
  id: string;
  text: string;
  isInternal: boolean;
  createdAt: string;
  author?: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  };
}

interface ServiceRequestItem {
  id: string;
  tenantId: string;
  unitId: string;
  creatorId: string;
  assigneeId?: string | null;
  title: string;
  description: string;
  category: string;
  status: 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED' | 'CLOSED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';
  rating?: number | null;
  feedback?: string | null;
  createdAt: string;
  updatedAt: string;
  unit?: {
    id: string;
    unitNumber: string;
    building?: {
      blockName: string;
    };
  };
  creator?: {
    firstName: string;
    lastName: string;
    phone: string;
  };
  assignee?: {
    firstName: string;
    lastName: string;
    phone: string;
  } | null;
  comments?: CommentItem[];
  attachments?: { id: string; fileUrl: string; fileType: string }[];
  history?: HistoryItem[];
  _count?: {
    comments: number;
    attachments: number;
  };
}

function SearchParamsReader({ onQuery }: { onQuery: (q: string) => void }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      onQuery(q);
    }
  }, [searchParams, onQuery]);
  return null;
}

export default function RequestsPage() {
  const { t, i18n } = useTranslation();
  const session = getStoredSession();
  const user = session?.user;
  const canChangeStatus = ['DISPATCHER', 'HOA_ADMIN', 'SUPERADMIN'].includes(user?.role || '');

  const [requests, setRequests] = useState<ServiceRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected request for details modal
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequestItem | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [assigneesError, setAssigneesError] = useState(false);
  const [assigneeId, setAssigneeId] = useState('');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<ServiceRequestItem['status'] | null>(null);
  const detailVersion = useRef(0);
  const closeDetailsModal = () => { detailVersion.current++; setSelectedRequest(null); };
  useEffect(() => () => { detailVersion.current++; }, []);

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiRequest<ServiceRequestItem[]>('/service-requests');
      setRequests(data);
    } catch (err: any) {
      setError(getApiErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const openDetailsModal = useCallback(async (req: ServiceRequestItem, preserveDraft = false) => {
    const version = ++detailVersion.current;
    setSelectedRequest(req);
    setStatusUpdating(false);
    setCommentSubmitting(false);
    setModalError(null);
    setActionSuccess(null);
    setConfirmStatus(null);
    setAssigneeId(req.assigneeId || '');
    setAssignees([]);
    setAssigneesError(false);
    if (!preserveDraft) setCommentText('');
    try {
      setModalLoading(true);
      const [detail, staff] = await Promise.allSettled([
        apiRequest<ServiceRequestItem>(`/service-requests/${req.id}`),
        canChangeStatus ? apiRequest<Assignee[]>(`/service-requests/${req.id}/assignees`) : Promise.resolve([]),
      ]);
      if (version === detailVersion.current) {
        if (staff.status === 'fulfilled') setAssignees(staff.value); else setAssigneesError(true);
        if (detail.status === 'rejected') throw detail.reason;
        setSelectedRequest(detail.value);
        setAssigneeId(detail.value.assigneeId || '');
      }
    } catch (err) {
      if (version === detailVersion.current) setModalError(getApiErrorMessage(err, t));
    } finally {
      if (version === detailVersion.current) setModalLoading(false);
    }
  }, [canChangeStatus, t]);

  const openedFromSearch = useRef('');
  useEffect(() => {
    const target = requests.find((request) => request.id === searchQuery.trim());
    if (!loading && target && openedFromSearch.current !== target.id) {
      openedFromSearch.current = target.id;
      void openDetailsModal(target);
    }
  }, [requests, searchQuery, loading, openDetailsModal]);

  const handleStatusChange = async (newStatus: ServiceRequestItem['status'], nextAssigneeId?: string) => {
    if (!selectedRequest || statusUpdating || commentSubmitting) return;
    const version = detailVersion.current;
    try {
      setStatusUpdating(true);
      setConfirmStatus(null);
      setModalError(null);
      setActionSuccess(null);
      const saved = await apiRequest<ServiceRequestItem>(`/service-requests/${selectedRequest.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus, assigneeId: nextAssigneeId, expectedUpdatedAt: selectedRequest.updatedAt }),
      });
      if (version === detailVersion.current) {
        setSelectedRequest((previous) => previous ? { ...previous, ...saved } : null);
        setActionSuccess(t('requestFlow.saved'));
      }
      // Refresh item and list
      const updated = await apiRequest<ServiceRequestItem>(`/service-requests/${selectedRequest.id}`);
      if (version === detailVersion.current) setSelectedRequest(updated);
      await loadRequests();
    } catch (err: any) {
      if (version === detailVersion.current) setModalError(getApiErrorMessage(err, t));
    } finally {
      if (version === detailVersion.current) setStatusUpdating(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest || !commentText.trim()) return;
    const version = detailVersion.current;
    try {
      setCommentSubmitting(true);
      setModalError(null);
      await apiRequest(`/service-requests/${selectedRequest.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ text: commentText.trim(), isInternal: false }),
      });
      if (version === detailVersion.current) setCommentText('');
      const updated = await apiRequest<ServiceRequestItem>(`/service-requests/${selectedRequest.id}`);
      if (version === detailVersion.current) setSelectedRequest(updated);
      await loadRequests();
    } catch (err: any) {
      if (version === detailVersion.current) setModalError(getApiErrorMessage(err, t));
    } finally {
      if (version === detailVersion.current) setCommentSubmitting(false);
    }
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'PLUMBING':
        return t('requests.catPlumbing');
      case 'ELECTRICAL':
        return t('requests.catElectrical');
      case 'INTERCOM':
      case 'ACCESS':
        return t('requests.catAccess');
      default:
        return cat;
    }
  };

  const formatShortDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(i18n.language, {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const statusFilters = [
    { id: 'ALL', label: t('requests.filterAll') },
    { id: 'PENDING', label: t('requests.filterPending') },
    { id: 'ASSIGNED', label: t('uiPolish.assigned') },
    { id: 'IN_PROGRESS', label: t('requests.filterInProgress') },
    { id: 'RESOLVED', label: t('uiPolish.resolved') },
    { id: 'CLOSED', label: t('uiPolish.closed') },
    { id: 'REJECTED', label: t('uiPolish.rejected') },
  ];

  // Filter requests
  const getStatusLabel = (status: string) => t(`requests.${({ PENDING: 'statusNew', IN_PROGRESS: 'statusInProgress', RESOLVED: 'statusResolved', CLOSED: 'statusClosed', REJECTED: 'statusRejected', ASSIGNED: 'statusAssigned' } as Record<string, string>)[status] || 'statusNew'}`);
  const filteredRequests = requests.filter((req) => {
    if (filterStatus !== 'ALL' && req.status !== filterStatus) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const unitNum = req.unit?.unitNumber?.toLowerCase() || '';
      const block = req.unit?.building?.blockName?.toLowerCase() || '';
      const creatorName = `${req.creator?.firstName || ''} ${req.creator?.lastName || ''}`.toLowerCase();
      const phone = req.creator?.phone?.toLowerCase() || '';
      const title = req.title.toLowerCase();
      const id = req.id.toLowerCase();
      return (
        unitNum.includes(q) ||
        block.includes(q) ||
        creatorName.includes(q) ||
        phone.includes(q) ||
        title.includes(q) ||
        id.includes(q)
      );
    }

    return true;
  });

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <SearchParamsReader onQuery={setSearchQuery} />
      </Suspense>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('requests.title')}</h1>
          <p className="text-sm text-slate-500">{t('requests.subtitle')}</p>
        </div>
        <button
          onClick={loadRequests}
          disabled={loading}
          className="inline-flex min-h-11 items-center gap-2 px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </button>
      </div>

      {error && (
        <div role="alert" className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col xl:flex-row items-stretch xl:items-start justify-between gap-4">
        <div className="relative w-full xl:w-72 xl:shrink-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            aria-label={t('requests.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('requests.searchPlaceholder')}
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-sky-500"
          />
        </div>

        <div className="w-full sm:hidden">
          <label htmlFor="request-status-filter" className="mb-2 block text-xs font-semibold text-slate-600">{t('requests.thStatus')}</label>
          <select id="request-status-filter" value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800">
            {statusFilters.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
        <div className="hidden sm:flex flex-wrap items-center gap-2 w-full xl:w-auto">
          {statusFilters.map((item) => (
            <button
              key={item.id}
              onClick={() => setFilterStatus(item.id)}
              aria-pressed={filterStatus === item.id}
              className={`min-h-11 whitespace-nowrap px-3.5 py-2 rounded-xl text-sm font-semibold transition ${
                filterStatus === item.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {!loading && !error && <p role="status" className="text-sm text-slate-500">{t('uiPolish.requestCount', { count: filteredRequests.length, total: requests.length })}</p>}
      {/* Requests Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading && requests.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-sky-600 mb-3" />
            <p className="text-sm">{t('requests.loadingRequests')}</p>
          </div>
        ) : error && requests.length === 0 ? (
          <div className="p-8 text-center"><p className="text-sm text-slate-600">{t('requestUi.loadFailed')}</p><button className="mt-3 min-h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white" onClick={loadRequests}>{t('common.refresh')}</button></div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Wrench className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-medium">{searchQuery || filterStatus !== 'ALL' ? t('requestUi.noMatches') : t('requests.noRequests')}</p>
            {(searchQuery || filterStatus !== 'ALL') && <button className="mt-3 min-h-11 rounded-xl border border-slate-200 px-4 font-semibold text-sky-700" onClick={() => { setSearchQuery(''); setFilterStatus('ALL'); }}>{t('requestUi.resetFilters')}</button>}
          </div>
        ) : (
          <>
          <div className="divide-y divide-slate-200 md:hidden">
            {filteredRequests.map((req) => <article key={req.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-mono text-slate-500">REQ-{req.id.slice(0, 8).toUpperCase()}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{getStatusLabel(req.status)}</span></div>
              <h2 className="break-words text-base font-semibold text-slate-900">{req.title}</h2>
              <p className="text-sm text-slate-600">{t('common.unitShort')} {req.unit?.unitNumber || '—'}{req.unit?.building?.blockName ? ` · ${req.unit.building.blockName}` : ''}</p>
              {(req.priority === 'EMERGENCY' || req.priority === 'HIGH') && <p className="text-sm font-semibold text-red-700">{t(req.priority === 'EMERGENCY' ? 'requests.prioEmergency' : 'requests.prioHigh')}</p>}
              <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-slate-500">{formatShortDate(req.createdAt)}</span><button onClick={() => openDetailsModal(req)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-sky-700">{t('requests.manageBtn')}</button></div>
            </article>)}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">{t('requests.thNumber')}</th>
                  <th className="py-3 px-4">{t('requests.thObject')}</th>
                  <th className="py-3 px-4">{t('requests.thTopic')}</th>
                  <th className="py-3 px-4">{t('requests.thPriority')}</th>
                  <th className="py-3 px-4">{t('requests.thStatus')}</th>
                  <th className="py-3 px-4">{t('requests.thAssignee')}</th>
                  <th className="py-3 px-4 text-right">{t('requests.thAction')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredRequests.map((req) => {
                  const shortId = req.id.slice(0, 8).toUpperCase();
                  const unitDisplay = req.unit
                    ? `${t('common.unitShort')} ${req.unit.unitNumber} ${req.unit.building?.blockName ? `(${req.unit.building.blockName})` : ''}`
                    : '—';
                  const residentDisplay = req.creator
                    ? `${req.creator.firstName} ${req.creator.lastName} (${req.creator.phone})`
                    : '—';

                  return (
                    <tr key={req.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{shortId}</td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{unitDisplay}</div>
                        <div className="text-[11px] text-slate-400">{residentDisplay}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-800">{req.title}</div>
                        <div className="text-[11px] text-sky-600 font-medium mt-0.5">
                          {getCategoryLabel(req.category)}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {req.priority === 'HIGH' || req.priority === 'EMERGENCY' ? (
                          <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-semibold">
                            {t('requests.prioHigh')}
                          </span>
                        ) : req.priority === 'MEDIUM' ? (
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                            {t('requests.prioMedium')}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                            {t('requests.prioLow')}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {req.status === 'PENDING' && (
                          <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                            <Clock className="w-3.5 h-3.5" /> {t('requests.statusNew')}
                          </span>
                        )}
                        {(req.status === 'IN_PROGRESS' || req.status === 'ASSIGNED') && (
                          <span className="inline-flex items-center gap-1 text-sky-700 font-medium">
                            <Wrench className="w-3.5 h-3.5" /> {getStatusLabel(req.status)}
                          </span>
                        )}
                        {(req.status === 'RESOLVED' || req.status === 'CLOSED') && (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />{' '}
                            {req.status === 'CLOSED' ? t('requests.statusClosed') : t('requests.statusResolved')}
                          </span>
                        )}
                        {req.status === 'REJECTED' && (
                          <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                            <X className="w-3.5 h-3.5" /> {t('requests.statusRejected')}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="text-slate-900 font-medium">
                          {req.assignee
                            ? `${req.assignee.firstName} ${req.assignee.lastName}`
                            : t('requests.unassigned')}
                        </div>
                        {req.rating && (
                          <div className="flex items-center gap-1 text-amber-500 mt-0.5 font-bold">
                            <Star className="w-3 h-3 fill-amber-400" /> {req.rating}.0
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => openDetailsModal(req)}
                          className="px-3 py-1.5 border border-slate-300 hover:bg-slate-100 rounded-lg font-semibold text-slate-700 transition"
                        >
                          {t('requests.manageBtn')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {/* Details & Management Modal */}
      {selectedRequest && (
        <Dialog labelledBy="request-dialog-title" onClose={closeDetailsModal}>
          <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-start justify-between gap-3 bg-slate-50">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-sky-700 bg-sky-100 px-2 py-0.5 rounded">
                    REQ-{selectedRequest.id.slice(0, 8).toUpperCase()}
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatShortDate(selectedRequest.createdAt)}
                  </span>
                </div>
                <h3 id="request-dialog-title" className="break-words text-lg font-bold text-slate-900 mt-1">{selectedRequest.title}</h3>
              </div>
              <button
                onClick={closeDetailsModal}
                aria-label={t('requestUi.close')}
                className="flex h-11 w-11 shrink-0 items-center justify-center text-slate-500 hover:bg-slate-200 rounded-xl transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="min-h-0 p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-sm">
              {modalError && (
                <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 flex flex-wrap items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                  <button type="button" className="font-semibold underline" onClick={() => openDetailsModal(selectedRequest, true)}>{t('common.refresh')}</button>
                </div>
              )}

              {/* Information Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
                <div>
                  <span className="text-slate-400 font-medium">{t('requests.thObject')}:</span>
                  <div className="text-slate-900 font-semibold mt-0.5">
                    {selectedRequest.unit
                      ? `${t('common.unitShort')} ${selectedRequest.unit.unitNumber} ${selectedRequest.unit.building?.blockName ? `(${selectedRequest.unit.building.blockName})` : ''}`
                      : '—'}
                  </div>
                  <div className="text-slate-500 text-[11px] mt-0.5">
                    {selectedRequest.creator
                      ? `${selectedRequest.creator.firstName} ${selectedRequest.creator.lastName} • ${selectedRequest.creator.phone}`
                      : '—'}
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 font-medium">{t('requests.thStatus')}:</span>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-md font-semibold bg-white border border-slate-200 text-slate-800">
                      {selectedRequest.status === 'ASSIGNED' && t('requests.statusAssigned')}
                      {selectedRequest.status === 'PENDING' && t('requests.statusNew')}
                      {selectedRequest.status === 'IN_PROGRESS' && t('requests.statusInProgress')}
                      {selectedRequest.status === 'RESOLVED' && t('requests.statusResolved')}
                      {selectedRequest.status === 'CLOSED' && t('requests.statusClosed')}
                      {selectedRequest.status === 'REJECTED' && t('requests.statusRejected')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <h4 className="font-semibold text-slate-900 mb-1">{t('requests.requestDetailsDesc')}</h4>
                <p className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-700 leading-relaxed text-sm">
                  {selectedRequest.description}
                </p>
              </div>

              {actionSuccess && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{actionSuccess}</p>}

              <section className="space-y-3">
                <h4 className="font-semibold text-slate-900">{t('requestFlow.assignee')}</h4>
                <p className="text-sm text-slate-600">{selectedRequest.assignee ? `${selectedRequest.assignee.firstName} ${selectedRequest.assignee.lastName}` : t('requests.unassigned')}</p>
                {canChangeStatus && !['CLOSED', 'REJECTED', 'RESOLVED'].includes(selectedRequest.status) && <>
                  <p className="text-xs text-slate-500">{t('requestFlow.assigneeHelp')}</p>
                  {assigneesError ? <p role="alert" className="text-sm text-amber-800">{t('requestFlow.staffFailed')} <button className="underline" onClick={() => openDetailsModal(selectedRequest, true)}>{t('common.refresh')}</button></p> : <div className="flex flex-col gap-2 sm:flex-row">
                    <label htmlFor="request-assignee" className="sr-only">{t('requestFlow.assignee')}</label>
                    <select id="request-assignee" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} disabled={modalLoading || statusUpdating || commentSubmitting} className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm">
                      <option value="">{t('requestFlow.chooseAssignee')}</option>
                      {selectedRequest.assigneeId && !assignees.some((person) => person.id === selectedRequest.assigneeId) && <option value={selectedRequest.assigneeId} disabled>{selectedRequest.assignee ? `${selectedRequest.assignee.firstName} ${selectedRequest.assignee.lastName}` : t('requestFlow.currentAssignee')}</option>}
                      {assignees.map((person) => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}
                    </select>
                    <button disabled={modalLoading || statusUpdating || commentSubmitting || !assigneeId || assigneeId === selectedRequest.assigneeId} onClick={() => handleStatusChange(selectedRequest.status === 'PENDING' ? 'ASSIGNED' : selectedRequest.status, assigneeId)} className="min-h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">{t('requestFlow.assign')}</button>
                  </div>}
                  {!modalLoading && !assigneesError && assignees.length === 0 && <p className="text-sm text-slate-500">{t('requestFlow.noAssignees')}</p>}
                </>}
              </section>

              {canChangeStatus && <section className="space-y-3 border-t border-slate-100 pt-4">
                <h4 className="font-semibold text-slate-900">{t('requestFlow.nextAction')}</h4>
                <div className="flex flex-wrap gap-2">{getRequestActions(selectedRequest.status).map((status) => <button key={status}
                  disabled={modalLoading || statusUpdating || commentSubmitting || (status === 'IN_PROGRESS' && !selectedRequest.assigneeId)}
                  onClick={() => ['CLOSED', 'REJECTED'].includes(status) ? setConfirmStatus(status) : handleStatusChange(status)} className={`min-h-11 rounded-xl px-4 text-sm font-semibold disabled:opacity-50 ${status === 'REJECTED' ? 'border border-red-200 text-red-700 hover:bg-red-50' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
                  {t(`requestFlow.${({ IN_PROGRESS: selectedRequest.status === 'RESOLVED' ? 'returnToWork' : 'startWork', RESOLVED: 'resolve', CLOSED: 'close', REJECTED: 'reject', PENDING: 'reopen' } as Record<string, string>)[status]}`)}
                </button>)}</div>
                {confirmStatus && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm text-amber-900">{t('requestFlow.confirmAction')}</p><div className="mt-3 flex flex-wrap gap-2"><button disabled={statusUpdating || commentSubmitting} className="min-h-11 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-50" onClick={() => handleStatusChange(confirmStatus)}>{t(confirmStatus === 'CLOSED' ? 'requestFlow.close' : 'requestFlow.reject')}</button><button className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm" onClick={() => setConfirmStatus(null)}>{t('common.cancel')}</button></div></div>}
                {!selectedRequest.assigneeId && ['PENDING', 'ASSIGNED'].includes(selectedRequest.status) && <p className="text-xs text-slate-500">{t('requestFlow.assignFirst')}</p>}
              </section>}

              <section className="space-y-3 border-t border-slate-100 pt-4">
                <h4 className="font-semibold text-slate-900">{t('requestFlow.attachments')}</h4>
                {modalLoading ? <p className="text-slate-500">{t('common.loading')}</p> : !selectedRequest.attachments ? <p className="text-sm text-slate-500">{t('requestFlow.detailsUnavailable')}</p> : selectedRequest.attachments.length === 0 ? <p className="text-sm text-slate-500">{t('requestFlow.noAttachments')}</p> : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{selectedRequest.attachments.map((attachment, index) => <AttachmentPreview key={attachment.id} requestId={selectedRequest.id} id={attachment.id} index={index} />)}</div>}
              </section>

              <section className="space-y-3 border-t border-slate-100 pt-4">
                <h4 className="font-semibold text-slate-900">{t('requestFlow.history')}</h4>
                <ol className="space-y-3 border-l-2 border-slate-100 pl-4">
                  <li><p className="text-sm font-medium text-slate-800">{t('requestFlow.created')}</p><time className="text-xs text-slate-500">{formatShortDate(selectedRequest.createdAt)}</time></li>
                  {selectedRequest.history?.map((entry) => <li key={entry.id}>
                    <p className="text-sm font-medium text-slate-800">{entry.metadata.fromStatus !== entry.metadata.toStatus ? `${getStatusLabel(entry.metadata.fromStatus)} → ${getStatusLabel(entry.metadata.toStatus)}` : t('requestFlow.assigneeChanged')}</p>
                    {entry.metadata.fromAssigneeId !== entry.metadata.toAssigneeId && <p className="text-sm text-slate-600">{t('requestFlow.assignee')}: {entry.metadata.assigneeName || t('requestFlow.currentAssignee')}</p>}
                    <p className="text-xs text-slate-500">{formatShortDate(entry.createdAt)}{entry.actor ? ` · ${entry.actor.firstName} ${entry.actor.lastName}` : ''}</p>
                  </li>)}
                </ol>
                {!selectedRequest.history && !modalLoading && <p className="text-sm text-slate-500">{t('requestFlow.detailsUnavailable')}</p>}
                <p className="text-xs text-slate-500">{t('requestFlow.historyHelp')}</p>
              </section>
              {/* Comments Section */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <h4 className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-sky-600" />
                  {t('requests.commentsTitle')}
                </h4>

                {modalLoading ? (
                  <div className="py-4 text-center text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  </div>
                ) : modalError ? null : selectedRequest.comments && selectedRequest.comments.length > 0 ? (
                  <div className="space-y-2">
                    {selectedRequest.comments.map((cm) => (
                      <div key={cm.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                        <div className="flex flex-wrap justify-between items-center gap-2 text-xs text-slate-400 mb-1">
                          <span className="font-semibold text-slate-700">
                            {cm.author ? `${cm.author.firstName} ${cm.author.lastName}` : '—'}
                          </span>
                          <span>{formatShortDate(cm.createdAt)}</span>
                        </div>
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">{cm.text}</p>
                        {cm.isInternal && <p className="mt-1 text-xs font-medium text-amber-800">{t('requestFlow.internal')}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400 text-xs italic">{t('requests.noComments')}</p>
                )}

                {/* Add Comment Input */}
                <p className="text-xs text-slate-500">{t('requestFlow.replyResident')}</p>
                <form onSubmit={handleAddComment} className="flex flex-col sm:flex-row gap-2 pt-2">
                  <input
                    type="text"
                    aria-label={t('requests.commentPlaceholder')}
                    disabled={commentSubmitting}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder={t('requests.commentPlaceholder')}
                    className="min-w-0 min-h-11 flex-1 px-3 py-2 border border-slate-300 rounded-xl text-sm focus:border-sky-500"
                  />
                  <button
                    type="submit"
                    disabled={modalLoading || statusUpdating || commentSubmitting || !commentText.trim()}
                    className="min-h-11 justify-center px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-xl font-semibold transition flex items-center gap-1.5 text-sm"
                  >
                    {commentSubmitting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    {t('requests.sendCommentBtn')}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
