'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  Vote,
  CheckCircle2,
  FileText,
  Calendar,
  ShieldCheck,
  Download,
  AlertCircle,
  Plus,
  Trash2,
  X,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { apiRequest, apiDownload, getStoredSession, getApiErrorMessage } from '@/lib/api';

function SearchParamsReader({ onQuery }: { onQuery: (q: string) => void }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    const q = searchParams.get('q') || searchParams.get('search');
    if (q) {
      onQuery(q);
    }
  }, [searchParams, onQuery]);
  return null;
}

interface AgendaItemResult {
  areaFor: number;
  areaAgainst: number;
  areaAbstain: number;
  totalItemVotedArea: number;
  forPercentFromVoted: number;
  forPercentFromTotalHOA: number;
  isApproved: boolean;
}

interface AgendaItem {
  id: string;
  orderIndex: number;
  question: string;
  description?: string;
  decisionType: 'SIMPLE_MAJORITY' | 'QUALIFIED_MAJORITY';
  results?: AgendaItemResult;
}

interface MeetingQuorum {
  totalEligibleArea: number;
  totalVotedArea: number;
  quorumPercent: number;
  isQuorumAchieved: boolean;
  participatedUnitsCount: number;
}

interface MeetingItem {
  id: string;
  tenantId: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  quorum: MeetingQuorum;
  agendaItems: AgendaItem[];
  protocol?: {
    protocolNumber: string;
    pdfUrl: string;
    isSigned: boolean;
  } | null;
}

export default function VotingsPage() {
  const { t } = useTranslation();
  const session = getStoredSession();
  const user = session?.user;
  const tenantId = user?.tenantId;
  const canWrite = ['HOA_CHAIRMAN', 'HOA_ADMIN', 'SUPERADMIN'].includes(user?.role || '');

  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'COMPLETED'>('ACTIVE');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Close meeting action
  const [closing, setClosing] = useState(false);

  // CSV Export state
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExportCsv = async () => {
    if (!selectedMeeting) return;
    setExportingCsv(true);
    setExportError(null);
    try {
      await apiDownload(
        `/votings/${selectedMeeting.id}/votes/export`,
        `voting-results-${selectedMeeting.id}.csv`,
      );
    } catch (err: any) {
      setExportError(err.message || t('votings.exportError'));
      setTimeout(() => setExportError(null), 5000);
    } finally {
      setExportingCsv(false);
    }
  };

  // Create meeting modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newAgendaItems, setNewAgendaItems] = useState<
    { question: string; description: string; decisionType: 'SIMPLE_MAJORITY' | 'QUALIFIED_MAJORITY' }[]
  >([
    { question: '', description: '', decisionType: 'SIMPLE_MAJORITY' },
  ]);

  const loadMeetings = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await apiRequest<MeetingItem[]>(`/votings/tenant/${tenantId}`);
      setMeetings(data);
      if (data.length > 0) {
        // Keep current selected if valid, otherwise pick first active or first meeting
        setSelectedMeetingId((prev) => {
          if (prev && data.some((m) => m.id === prev)) return prev;
          const firstActive = data.find((m) => m.status === 'ACTIVE');
          return firstActive ? firstActive.id : data[0].id;
        });
      } else {
        setSelectedMeetingId(null);
      }
    } catch (err: any) {
      setError(getApiErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  }, [tenantId, t]);

  useEffect(() => {
    loadMeetings();
  }, [loadMeetings]);

  const filteredMeetings = meetings.filter((m) => {
    if (activeTab === 'ACTIVE' && m.status !== 'ACTIVE') return false;
    if (activeTab === 'COMPLETED' && m.status !== 'COMPLETED') return false;

    if (!searchQuery.trim()) return true;

    const q = searchQuery.toLowerCase().trim();
    const titleMatch = m.title?.toLowerCase().includes(q);
    const descMatch = m.description?.toLowerCase().includes(q);
    const protocolMatch = m.protocol?.protocolNumber?.toLowerCase().includes(q);

    return Boolean(titleMatch || descMatch || protocolMatch);
  });

  const selectedMeeting =
    filteredMeetings.find((m) => m.id === selectedMeetingId) ||
    filteredMeetings[0] ||
    null;

  const handleCloseMeeting = async () => {
    if (!selectedMeeting) return;
    try {
      setClosing(true);
      setError(null);
      await apiRequest(`/votings/${selectedMeeting.id}/close`, {
        method: 'POST',
      });
      setSuccessMessage(t('votings.meetingClosedSuccess'));
      await loadMeetings();
      setActiveTab('COMPLETED');
    } catch (err: any) {
      setError(getApiErrorMessage(err, t));
    } finally {
      setClosing(false);
    }
  };

  const handleOpenCreateModal = () => {
    const now = new Date();
    const inTwoWeeks = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    setNewTitle('');
    setNewDescription('');
    setNewStartDate(now.toISOString().slice(0, 16));
    setNewEndDate(inTwoWeeks.toISOString().slice(0, 16));
    setNewAgendaItems([{ question: '', description: '', decisionType: 'SIMPLE_MAJORITY' }]);
    setCreateError(null);
    setIsCreateOpen(true);
  };

  const handleAddAgendaQuestion = () => {
    setNewAgendaItems([
      ...newAgendaItems,
      { question: '', description: '', decisionType: 'SIMPLE_MAJORITY' },
    ]);
  };

  const handleRemoveAgendaQuestion = (index: number) => {
    if (newAgendaItems.length <= 1) return;
    setNewAgendaItems(newAgendaItems.filter((_, i) => i !== index));
  };

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;

    if (!newTitle.trim()) {
      setCreateError(t('votings.meetingTitleLabel'));
      return;
    }

    const invalidItem = newAgendaItems.find((it) => !it.question.trim());
    if (invalidItem) {
      setCreateError(t('votings.questionPlaceholder'));
      return;
    }

    try {
      setIsCreating(true);
      setCreateError(null);
      const created = await apiRequest<MeetingItem>('/votings/meetings', {
        method: 'POST',
        body: JSON.stringify({
          tenantId,
          title: newTitle.trim(),
          description: newDescription.trim(),
          startDate: new Date(newStartDate).toISOString(),
          endDate: new Date(newEndDate).toISOString(),
          agendaItems: newAgendaItems.map((it, idx) => ({
            orderIndex: idx + 1,
            question: it.question.trim(),
            description: it.description.trim() || undefined,
            decisionType: it.decisionType,
          })),
        }),
      });

      setIsCreateOpen(false);
      setSuccessMessage(t('votings.meetingCreateSuccess'));
      await loadMeetings();
      if (created?.id) {
        setSelectedMeetingId(created.id);
        setActiveTab('ACTIVE');
      }
    } catch (err: any) {
      setCreateError(getApiErrorMessage(err, t));
    } finally {
      setIsCreating(false);
    }
  };

  const formatMeetingDates = (start: string, end: string) => {
    try {
      const s = new Date(start).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
      const e = new Date(end).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
      return `${s} — ${e}`;
    } catch {
      return `${start} — ${end}`;
    }
  };

  const calculateDaysLeft = (endStr: string) => {
    try {
      const diffMs = new Date(endStr).getTime() - Date.now();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays <= 0) return t('votings.daysLeftDynamic', { count: 0 });
      return t('votings.daysLeftDynamic', { count: diffDays });
    } catch {
      return '—';
    }
  };

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <SearchParamsReader onQuery={setSearchQuery} />
      </Suspense>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('votings.title')}</h1>
          <p className="text-sm text-slate-500">{t('votings.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadMeetings}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </button>
          {canWrite && (
            <button
              onClick={handleOpenCreateModal}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-xl shadow-sm transition inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              {t('votings.newMeetingBtn')}
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Legal Banner */}
      <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-sky-700 shrink-0 mt-0.5" />
        <div className="text-xs text-sky-900 leading-relaxed">
          <strong>{t('votings.legalBannerTitle')}</strong> {t('votings.legalBannerText')}
        </div>
      </div>

      {/* Tab and Meeting Selector */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => setActiveTab('ACTIVE')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'ACTIVE'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t('votings.tabActive')} (
            {meetings.filter((m) => m.status === 'ACTIVE').length})
          </button>
          <button
            onClick={() => setActiveTab('COMPLETED')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'COMPLETED'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t('votings.tabCompleted')} (
            {meetings.filter((m) => m.status === 'COMPLETED').length})
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          {/* Search box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('votings.searchPlaceholder')}
              className="w-full pl-9 pr-8 py-1.5 border border-slate-300 rounded-xl text-xs bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-sky-500 transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {filteredMeetings.length > 0 && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
                {t('votings.selectMeetingLabel')}
              </span>
              <select
                value={selectedMeetingId || ''}
                onChange={(e) => setSelectedMeetingId(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-xl text-xs bg-white text-slate-800 font-medium focus:outline-none focus:border-sky-500 max-w-xs w-full sm:w-auto"
              >
                {filteredMeetings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {loading && meetings.length === 0 ? (
        <div className="p-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-sky-600 mb-3" />
          <p className="text-sm">{t('votings.loadingMeetings')}</p>
        </div>
      ) : !selectedMeeting ? (
        <div className="p-16 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <Vote className="w-10 h-10 mx-auto text-slate-300 mb-3" />
          <p className="text-base font-semibold text-slate-800">
            {searchQuery
              ? t('votings.noSearchResults')
              : activeTab === 'ACTIVE'
              ? t('votings.noActiveMeeting')
              : t('votings.noMeetings')}
          </p>
        </div>
      ) : (
        /* Selected Meeting View */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${
                    selectedMeeting.status === 'ACTIVE'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-200 text-slate-800'
                  }`}
                >
                  {selectedMeeting.status === 'ACTIVE'
                    ? t('votings.activeVotingBadge')
                    : t('votings.completedVotingBadge')}
                </span>
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatMeetingDates(selectedMeeting.startDate, selectedMeeting.endDate)}
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 mt-1">{selectedMeeting.title}</h2>
              {selectedMeeting.description && (
                <p className="text-xs text-slate-600 mt-1 max-w-3xl">{selectedMeeting.description}</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {canWrite && (
                <button
                  onClick={handleExportCsv}
                  disabled={exportingCsv}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold rounded-xl transition flex items-center gap-2 disabled:opacity-50 shadow-sm"
                >
                  {exportingCsv ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-sky-600" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>{exportingCsv ? t('votings.exportingCsv') : t('votings.exportCsvBtn')}</span>
                </button>
              )}

              {selectedMeeting.protocol?.pdfUrl && (
                <a
                  href={selectedMeeting.protocol.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold rounded-xl transition flex items-center gap-2"
                >
                  <Download className="w-4 h-4" /> {t('votings.downloadProtocolBtn')}
                </a>
              )}

              {canWrite && selectedMeeting.status === 'ACTIVE' && (
                <button
                  onClick={handleCloseMeeting}
                  disabled={closing}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition flex items-center gap-2 shadow-sm"
                >
                  {closing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                  {t('votings.finishProtocolBtn')}
                </button>
              )}
            </div>
          </div>

          {exportError && (
            <div className="p-3 mx-6 mt-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{exportError}</span>
              </div>
              <button onClick={() => setExportError(null)} className="text-rose-400 hover:text-rose-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Quorum Stats Panel */}
          <div className="p-6 border-b border-slate-100 bg-white grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <div className="text-xs text-slate-500">{t('votings.totalAreaLabel')}</div>
              <div className="text-lg font-bold text-slate-900 mt-0.5">
                {selectedMeeting.quorum?.totalEligibleArea?.toLocaleString() || 0} {t('common.sqm')}
              </div>
              <div className="text-[11px] text-slate-400">{t('votings.totalAreaUnits')}</div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <div className="text-xs text-slate-500">{t('votings.participatingAreaLabel')}</div>
              <div className="text-lg font-bold text-slate-900 mt-0.5">
                {selectedMeeting.quorum?.totalVotedArea?.toLocaleString() || 0} {t('common.sqm')}
              </div>
              <div className="text-[11px] text-slate-500">
                {selectedMeeting.quorum?.participatedUnitsCount || 0} {t('common.unitShort')}
              </div>
            </div>

            <div
              className={`p-4 rounded-xl border ${
                selectedMeeting.quorum?.isQuorumAchieved
                  ? 'bg-emerald-50 border-emerald-100'
                  : 'bg-amber-50 border-amber-100'
              }`}
            >
              <div
                className={`text-xs font-medium ${
                  selectedMeeting.quorum?.isQuorumAchieved ? 'text-emerald-800' : 'text-amber-800'
                }`}
              >
                {t('votings.currentQuorumLabel')}
              </div>
              <div
                className={`text-2xl font-black mt-0.5 ${
                  selectedMeeting.quorum?.isQuorumAchieved ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {selectedMeeting.quorum?.quorumPercent || 0}%
              </div>
              <div
                className={`text-[11px] font-semibold flex items-center gap-1 ${
                  selectedMeeting.quorum?.isQuorumAchieved ? 'text-emerald-600' : 'text-amber-600'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {selectedMeeting.quorum?.isQuorumAchieved
                  ? t('votings.quorumThresholdPassed')
                  : t('votings.quorumNotAchieved')}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <div className="text-xs text-slate-500">{t('votings.timeLeftLabel')}</div>
              <div className="text-lg font-bold text-slate-900 mt-0.5">
                {selectedMeeting.status === 'ACTIVE'
                  ? calculateDaysLeft(selectedMeeting.endDate)
                  : t('votings.completedVotingBadge')}
              </div>
              <div className="text-[11px] text-slate-400">{t('votings.autoCloseNotice')}</div>
            </div>
          </div>

          {/* Agenda Questions */}
          <div className="p-6 space-y-6">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              {t('votings.agendaHeader')}
            </h3>

            {selectedMeeting.agendaItems?.map((item, idx) => {
              const res = item.results;
              const forPercent = res ? res.forPercentFromVoted : 0;
              const againstPercent =
                res && res.totalItemVotedArea > 0 ? (res.areaAgainst / res.totalItemVotedArea) * 100 : 0;
              const abstainPercent =
                res && res.totalItemVotedArea > 0 ? (res.areaAbstain / res.totalItemVotedArea) * 100 : 0;

              return (
                <div key={item.id} className="border border-slate-200 rounded-xl p-5 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded">
                        {t('votings.questionOrderDynamic', { order: item.orderIndex || idx + 1 })}
                      </span>
                      <h4 className="text-base font-semibold text-slate-900 mt-1">{item.question}</h4>
                      {item.description && (
                        <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
                      )}
                      <p className="text-xs text-slate-600 mt-1">
                        {item.decisionType === 'SIMPLE_MAJORITY'
                          ? t('votings.simpleMajorityOption')
                          : t('votings.qualifiedMajorityOption')}
                      </p>
                    </div>
                    {res && (
                      <span
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md ${
                          res.isApproved
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {res.isApproved ? t('votings.decisionPassing') : t('votings.decisionNotPassing')}
                      </span>
                    )}
                  </div>

                  {res && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-slate-600 font-medium">
                        <span>
                          {t('votings.forLabel')} {res.areaFor} {t('common.sqm')} ({forPercent.toFixed(1)}%)
                        </span>
                        <span>
                          {t('votings.againstLabel')} {res.areaAgainst} {t('common.sqm')} (
                          {againstPercent.toFixed(1)}%)
                        </span>
                        <span>
                          {t('votings.abstainLabel')} {res.areaAbstain} {t('common.sqm')} (
                          {abstainPercent.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
                        <div
                          className="bg-emerald-500 h-full transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.max(0, forPercent))}%` }}
                          title={t('votings.forLabel')}
                        ></div>
                        <div
                          className="bg-red-500 h-full transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.max(0, againstPercent))}%` }}
                          title={t('votings.againstLabel')}
                        ></div>
                        <div
                          className="bg-slate-400 h-full transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.max(0, abstainPercent))}%` }}
                          title={t('votings.abstainLabel')}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create Meeting Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-base font-bold text-slate-900">
                {t('votings.createMeetingModalTitle')}
              </h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMeeting} className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
              {createError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {t('votings.meetingTitleLabel')} *
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={t('votings.meetingTitlePlaceholder')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {t('votings.meetingDescLabel')}
                </label>
                <textarea
                  rows={2}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder={t('votings.meetingDescPlaceholder')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    {t('votings.startDateLabel')} *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    {t('votings.endDateLabel')} *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={newEndDate}
                    onChange={(e) => setNewEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Agenda Items */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-slate-900">{t('votings.agendaItemsSection')}</h4>
                  <button
                    type="button"
                    onClick={handleAddAgendaQuestion}
                    className="text-sky-600 hover:text-sky-700 font-semibold text-xs inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('votings.addAgendaItemBtn')}
                  </button>
                </div>

                {newAgendaItems.map((item, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700 text-[11px]">
                        {t('votings.questionOrderDynamic', { order: idx + 1 })}
                      </span>
                      {newAgendaItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveAgendaQuestion(idx)}
                          className="text-red-500 hover:text-red-700 p-0.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      value={item.question}
                      onChange={(e) => {
                        const updated = [...newAgendaItems];
                        updated[idx].question = e.target.value;
                        setNewAgendaItems(updated);
                      }}
                      placeholder={t('votings.questionPlaceholder')}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-sky-500"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => {
                          const updated = [...newAgendaItems];
                          updated[idx].description = e.target.value;
                          setNewAgendaItems(updated);
                        }}
                        placeholder={t('votings.questionDescPlaceholder')}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-sky-500"
                      />
                      <select
                        value={item.decisionType}
                        onChange={(e) => {
                          const updated = [...newAgendaItems];
                          updated[idx].decisionType = e.target.value as any;
                          setNewAgendaItems(updated);
                        }}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-sky-500"
                      >
                        <option value="SIMPLE_MAJORITY">{t('votings.simpleMajorityOption')}</option>
                        <option value="QUALIFIED_MAJORITY">{t('votings.qualifiedMajorityOption')}</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-100 rounded-xl font-medium text-slate-700 transition"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-xl font-semibold transition inline-flex items-center gap-1.5"
                >
                  {isCreating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
