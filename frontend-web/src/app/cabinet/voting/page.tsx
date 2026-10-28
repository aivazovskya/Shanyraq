'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Vote,
  Calendar,
  CheckCircle2,
  AlertCircle,
  X,
  Users,
  ChevronRight,
  Loader2,
  FileText,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { CabinetApi, MeetingItem, AgendaItem, ResidentProfile } from '@/lib/cabinet-api';
import { getVotingStatusLabel } from '@/lib/cabinet-labels';

export default function CabinetVotingPage() {
  const { t, i18n } = useTranslation();

  const [profile, setProfile] = useState<ResidentProfile | null>(null);
  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected Meeting Details Modal
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [votingItem, setVotingItem] = useState<AgendaItem | null>(null);
  const [voteChoice, setVoteChoice] = useState<'FOR' | 'AGAINST' | 'ABSTAIN'>('FOR');
  const [voteOtp, setVoteOtp] = useState('0000');
  const [votingSubmitting, setVotingSubmitting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);

  const isOwner = profile?.role === 'RESIDENT_OWNER' || profile?.ownerships?.some((o) => o.ownershipType === 'OWNER' && o.isVerified);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const me = await CabinetApi.getMe();
      setProfile(me);

      const tenantId = me.tenantId || me.ownerships?.[0]?.unit?.building?.tenantId;
      if (tenantId) {
        const list = await CabinetApi.getMeetings(tenantId);
        setMeetings(list || []);
      }
    } catch (e) {
      console.warn('Failed to load votings:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openMeetingDetails = async (meeting: MeetingItem) => {
    setSelectedMeeting(meeting);
    setDetailLoading(true);
    try {
      const full = await CabinetApi.getMeetingDetails(meeting.id);
      setSelectedMeeting(full);
    } catch (e) {
      console.warn('Failed to load meeting details:', e);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCastVote = async (e: React.FormEvent) => {
    e.preventDefault();
    const unitId = profile?.ownerships?.[0]?.unitId;
    if (!votingItem || !unitId) return;

    setVotingSubmitting(true);
    setVoteError(null);

    try {
      await CabinetApi.castVote({
        agendaItemId: votingItem.id,
        unitId,
        choice: voteChoice,
        otpCode: voteOtp,
      });

      alert(t('cabinet.voteSuccess'));
      setVotingItem(null);
      if (selectedMeeting) {
        const updated = await CabinetApi.getMeetingDetails(selectedMeeting.id);
        setSelectedMeeting(updated);
      }
      await loadData();
    } catch (err: any) {
      setVoteError(err?.message || 'Ошибка голосования');
    } finally {
      setVotingSubmitting(false);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      return new Intl.DateTimeFormat(
        i18n.language === 'en' ? 'en-US' : i18n.language === 'kk' ? 'kk-KZ' : 'ru-RU',
        { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Almaty' },
      ).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300';
      case 'COMPLETED':
        return 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300';
      case 'CANCELLED':
        return 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300';
      default:
        return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          {t('cabinet.votingTitle')}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {t('cabinet.votingSubtitle')}
        </p>
      </div>

      {/* Meetings List */}
      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </div>
      ) : meetings.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center shadow-sm">
          <Vote className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            {t('cabinet.noVotings')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('cabinet.votingEmpty')}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {meetings.map((m) => (
            <div
              key={m.id}
              onClick={() => openMeetingDetails(m)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:border-purple-500 cursor-pointer transition-all group"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getStatusBadge(
                      m.status,
                    )}`}
                  >
                    {getVotingStatusLabel(m.status, t)}
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatDate(m.startDate)} — {formatDate(m.endDate)}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-purple-600 dark:text-purple-400 font-semibold">
                  <span>{t('cabinet.votingQuorum')}: {m.quorumPercent}%</span>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>

              <h3 className="text-base font-bold text-slate-900 dark:text-white mt-2 group-hover:text-purple-600 transition-colors">
                {m.title}
              </h3>
              {m.description && (
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                  {m.description}
                </p>
              )}

              {/* Quorum Progress Bar */}
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 text-xs">
                <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-purple-600 h-2 rounded-full"
                    style={{ width: `${Math.min(100, m.quorumPercent)}%` }}
                  />
                </div>
                <span className="font-mono text-slate-500 shrink-0">
                  {m.agendaItems?.length || 0} {t('cabinet.votingQuestionsCount')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Meeting Details Modal */}
      {selectedMeeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl relative max-h-[90vh] overflow-y-auto animate-in fade-in duration-200">
            <button
              type="button"
              onClick={() => setSelectedMeeting(null)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label={t('cabinet.close')}
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-2">
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getStatusBadge(
                  selectedMeeting.status,
                )}`}
              >
                {getVotingStatusLabel(selectedMeeting.status, t)}
              </span>
              <span className="text-xs text-slate-400">
                {formatDate(selectedMeeting.startDate)} — {formatDate(selectedMeeting.endDate)}
              </span>
            </div>

            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {selectedMeeting.title}
            </h2>
            {selectedMeeting.description && (
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                {selectedMeeting.description}
              </p>
            )}

            {!isOwner && (
              <div className="mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 text-xs">
                {t('cabinet.votingOwnersOnlyNotice', 'Голосование на общем собрании собственников доступно только собственникам помещений. Вам доступны повестка и результаты.')}
              </div>
            )}

            {/* Quorum status block */}
            <div className="mt-4 p-3.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-100 dark:border-purple-900/60 flex items-center justify-between text-xs">
              <div>
                <span className="font-semibold text-purple-950 dark:text-purple-200">
                  {t('cabinet.votingQuorum')}: {selectedMeeting.quorumPercent}%
                </span>
                <span className="text-purple-700 dark:text-purple-300 ml-2">
                  ({selectedMeeting.participatedArea} / {selectedMeeting.totalTenantArea} м²)
                </span>
              </div>
              <span
                className={`font-bold px-2 py-0.5 rounded ${
                  selectedMeeting.isQuorumReached
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {selectedMeeting.isQuorumReached ? t('cabinet.votingQuorumReached') : t('cabinet.votingQuorumNotReached')}
              </span>
            </div>

            {/* Agenda items list */}
            <div className="mt-5 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t('cabinet.agendaQuestions')} ({selectedMeeting.agendaItems?.length || 0})
              </h3>

              {selectedMeeting.agendaItems?.map((item, idx) => {
                const voted = item.myVote;

                return (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="font-bold text-purple-600 dark:text-purple-400 mr-2">
                          #{idx + 1}
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {item.title || item.question}
                        </span>
                        {item.description && (
                          <p className="text-slate-600 dark:text-slate-400 mt-1">
                            {item.description}
                          </p>
                        )}
                      </div>

                      {voted ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold shrink-0">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>
                            {t('cabinet.votedBadge')}: {item.myVote?.choice}
                          </span>
                        </div>
                      ) : selectedMeeting.status === 'ACTIVE' ? (
                        isOwner ? (
                          <button
                            type="button"
                            onClick={() => {
                              setVotingItem(item);
                              setVoteChoice('FOR');
                              setVoteError(null);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold shrink-0 shadow-sm transition-colors"
                          >
                            {t('cabinet.votingVoteAction')}
                          </button>
                        ) : (
                          <span
                            className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium text-[11px] shrink-0"
                            title={t('cabinet.votingOwnersOnly', 'Только для собственников')}
                          >
                            {t('cabinet.votingOwnersOnly', 'Только для собственников')}
                          </span>
                        )
                      ) : null}
                    </div>

                    {/* Votes Summary if available */}
                    {item.votesSummary && (
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-[11px] text-center font-semibold">
                        <div className="p-1.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                          {t('cabinet.votingFor')}: {item.votesSummary.forPercent}%
                        </div>
                        <div className="p-1.5 rounded bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300">
                          {t('cabinet.votingAgainst')}: {item.votesSummary.againstPercent}%
                        </div>
                        <div className="p-1.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                          {t('cabinet.votingAbstain')}: {item.votesSummary.abstainPercent}%
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Cast Vote Modal */}
      {votingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl relative animate-in fade-in duration-200">
            <button
              type="button"
              onClick={() => setVotingItem(null)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label={t('cabinet.close')}
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {t('cabinet.votingModalTitle')}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
              {votingItem.title || votingItem.question}
            </p>

            {voteError && (
              <div className="mt-3 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 text-xs">
                {voteError}
              </div>
            )}

            <form onSubmit={handleCastVote} className="mt-4 space-y-4">
              <div className="space-y-2">
                {[
                  { key: 'FOR', label: t('cabinet.voteFor'), color: 'emerald' },
                  { key: 'AGAINST', label: t('cabinet.voteAgainst'), color: 'red' },
                  { key: 'ABSTAIN', label: t('cabinet.voteAbstain'), color: 'slate' },
                ].map((choice) => (
                  <button
                    key={choice.key}
                    type="button"
                    onClick={() => setVoteChoice(choice.key as any)}
                    className={`w-full p-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-between ${
                      voteChoice === choice.key
                        ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/40 text-purple-900 dark:text-purple-200 shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span>{choice.label}</span>
                    {voteChoice === choice.key && (
                      <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                    )}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('cabinet.votingOtpLabel')}
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={voteOtp}
                  onChange={(e) => setVoteOtp(e.target.value)}
                  placeholder="0000"
                  className="w-full text-center tracking-widest font-mono text-base py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={votingSubmitting}
                className="w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {votingSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>{t('cabinet.votingConfirmBtn')}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
