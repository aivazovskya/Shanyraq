'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
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
import { apiRequest, getStoredSession, getApiErrorMessage } from '@/lib/api';

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
  status: 'PENDING' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'CANCELLED';
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
  const { t } = useTranslation();
  const session = getStoredSession();
  const user = session?.user;
  const canChangeStatus = ['DISPATCHER', 'HOA_ADMIN', 'HOA_CHAIRMAN', 'SUPERADMIN'].includes(user?.role || '');

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

  const openDetailsModal = async (req: ServiceRequestItem) => {
    setSelectedRequest(req);
    setModalError(null);
    setCommentText('');
    try {
      setModalLoading(true);
      const full = await apiRequest<ServiceRequestItem>(`/service-requests/${req.id}`);
      setSelectedRequest(full);
    } catch {
      // Fallback to basic item if detail call fails
    } finally {
      setModalLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: 'PENDING' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'CANCELLED') => {
    if (!selectedRequest) return;
    try {
      setStatusUpdating(true);
      setModalError(null);
      await apiRequest(`/service-requests/${selectedRequest.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      // Refresh item and list
      const updated = await apiRequest<ServiceRequestItem>(`/service-requests/${selectedRequest.id}`);
      setSelectedRequest(updated);
      await loadRequests();
    } catch (err: any) {
      setModalError(getApiErrorMessage(err, t));
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest || !commentText.trim()) return;
    try {
      setCommentSubmitting(true);
      setModalError(null);
      await apiRequest(`/service-requests/${selectedRequest.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ text: commentText.trim(), isInternal: false }),
      });
      setCommentText('');
      const updated = await apiRequest<ServiceRequestItem>(`/service-requests/${selectedRequest.id}`);
      setSelectedRequest(updated);
      await loadRequests();
    } catch (err: any) {
      setModalError(getApiErrorMessage(err, t));
    } finally {
      setCommentSubmitting(false);
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
      return d.toLocaleDateString(undefined, {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  // Filter requests
  const filteredRequests = requests.filter((req) => {
    if (filterStatus === 'PENDING' && req.status !== 'PENDING') return false;
    if (filterStatus === 'IN_PROGRESS' && req.status !== 'IN_PROGRESS') return false;
    if (filterStatus === 'CLOSED' && req.status !== 'CLOSED' && req.status !== 'RESOLVED') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('requests.title')}</h1>
          <p className="text-sm text-slate-500">{t('requests.subtitle')}</p>
        </div>
        <button
          onClick={loadRequests}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('requests.searchPlaceholder')}
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-sky-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
          {[
            { id: 'ALL', label: t('requests.filterAll') },
            { id: 'PENDING', label: t('requests.filterPending') },
            { id: 'IN_PROGRESS', label: t('requests.filterInProgress') },
            { id: 'CLOSED', label: t('requests.filterClosed') },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setFilterStatus(item.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
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

      {/* Requests Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading && requests.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-sky-600 mb-3" />
            <p className="text-sm">{t('requests.loadingRequests')}</p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Wrench className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-medium">{t('requests.noRequests')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
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
                        {req.status === 'IN_PROGRESS' && (
                          <span className="inline-flex items-center gap-1 text-sky-700 font-medium">
                            <Wrench className="w-3.5 h-3.5" /> {t('requests.statusInProgress')}
                          </span>
                        )}
                        {(req.status === 'RESOLVED' || req.status === 'CLOSED') && (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />{' '}
                            {req.status === 'CLOSED' ? t('requests.statusClosed') : t('requests.statusResolved')}
                          </span>
                        )}
                        {req.status === 'CANCELLED' && (
                          <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                            <X className="w-3.5 h-3.5" /> {t('requests.statusCancelled')}
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
        )}
      </div>

      {/* Details & Management Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-sky-700 bg-sky-100 px-2 py-0.5 rounded">
                    REQ-{selectedRequest.id.slice(0, 8).toUpperCase()}
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatShortDate(selectedRequest.createdAt)}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mt-1">{selectedRequest.title}</h3>
              </div>
              <button
                onClick={() => setSelectedRequest(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              {modalError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Information Grid */}
              <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
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
                      {selectedRequest.status === 'PENDING' && t('requests.statusNew')}
                      {selectedRequest.status === 'IN_PROGRESS' && t('requests.statusInProgress')}
                      {selectedRequest.status === 'RESOLVED' && t('requests.statusResolved')}
                      {selectedRequest.status === 'CLOSED' && t('requests.statusClosed')}
                      {selectedRequest.status === 'CANCELLED' && t('requests.statusCancelled')}
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

              {/* Change Status Action (Staff only) */}
              {canChangeStatus && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <h4 className="font-semibold text-slate-900">{t('requests.changeStatusLabel')}</h4>
                  <div className="flex flex-wrap gap-2">
                    {(['PENDING', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        disabled={statusUpdating || selectedRequest.status === st}
                        onClick={() => handleStatusChange(st)}
                        className={`px-3 py-1.5 rounded-lg font-medium transition text-xs ${
                          selectedRequest.status === st
                            ? 'bg-sky-600 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50'
                        }`}
                      >
                        {st === 'PENDING' && t('requests.statusNew')}
                        {st === 'IN_PROGRESS' && t('requests.statusInProgress')}
                        {st === 'RESOLVED' && t('requests.statusResolved')}
                        {st === 'CLOSED' && t('requests.statusClosed')}
                        {st === 'CANCELLED' && t('requests.statusCancelled')}
                      </button>
                    ))}
                  </div>
                </div>
              )}

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
                ) : selectedRequest.comments && selectedRequest.comments.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {selectedRequest.comments.map((cm) => (
                      <div key={cm.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                        <div className="flex justify-between items-center text-[11px] text-slate-400 mb-1">
                          <span className="font-semibold text-slate-700">
                            {cm.author ? `${cm.author.firstName} ${cm.author.lastName}` : '—'}
                          </span>
                          <span>{formatShortDate(cm.createdAt)}</span>
                        </div>
                        <p className="text-slate-800 text-xs">{cm.text}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400 text-xs italic">{t('requests.noComments')}</p>
                )}

                {/* Add Comment Input */}
                <form onSubmit={handleAddComment} className="flex gap-2 pt-2">
                  <input
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder={t('requests.commentPlaceholder')}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-sky-500"
                  />
                  <button
                    type="submit"
                    disabled={commentSubmitting || !commentText.trim()}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-xl font-semibold transition flex items-center gap-1.5 text-xs"
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
        </div>
      )}
    </div>
  );
}
