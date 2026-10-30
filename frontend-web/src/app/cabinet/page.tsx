'use client';

import ChargesRing, { RING_COLORS, buildRingSegments } from '@/components/ChargesRing';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  CreditCard,
  AlertTriangle,
  Wrench,
  KeyRound,
  Gauge,
  MessageSquare,
  ShoppingBag,
  Bell,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldCheck,
  ChevronRight,
  Loader2,
  FileText,
  Lock,
  Unlock,
  AlertCircle,
  X,
  Printer,
  Download,
  Calendar,
  Vote,
} from 'lucide-react';
import {
  CabinetApi,
  ResidentProfile,
  PersonalAccount,
  ServiceRequestItem,
  MeetingItem,
  AnnouncementItem,
} from '@/lib/cabinet-api';
import {
  getRequestStatusLabel,
  getRequestCategoryLabel,
  getVotingStatusLabel,
  getRoleLabel,
} from '@/lib/cabinet-labels';

export default function CabinetHomePage() {
  const { t, i18n } = useTranslation();

  const [profile, setProfile] = useState<ResidentProfile | null>(null);
  const [account, setAccount] = useState<PersonalAccount | null>(null);
  const [requests, setRequests] = useState<ServiceRequestItem[]>([]);
  const [votings, setVotings] = useState<MeetingItem[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showPayModal, setShowPayModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showBarrierModal, setShowBarrierModal] = useState(false);
  const [barrierPin, setBarrierPin] = useState('');
  const [barrierLoading, setBarrierLoading] = useState(false);
  const [barrierSuccess, setBarrierSuccess] = useState<string | null>(null);
  const [barrierError, setBarrierError] = useState<string | null>(null);

  // SOS button press-and-hold logic (~1.5 seconds)
  const [sosProgress, setSosProgress] = useState(0);
  const [isHoldingSos, setIsHoldingSos] = useState(false);
  const [sosSuccess, setSosSuccess] = useState(false);
  const [sosError, setSosError] = useState<string | null>(null);
  const sosTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sosIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const me = await CabinetApi.getMe();
      setProfile(me);

      const tenantId = me.tenantId || me.ownerships?.[0]?.unit?.building?.tenantId;

      const [accountsRes, requestsRes, votingsRes, announcementsRes] = await Promise.allSettled([
        CabinetApi.getMyAccounts(),
        CabinetApi.getRequests(),
        tenantId ? CabinetApi.getMeetings(tenantId) : Promise.resolve([]),
        tenantId ? CabinetApi.getAnnouncements(tenantId) : Promise.resolve([]),
      ]);

      if (accountsRes.status === 'fulfilled' && accountsRes.value?.length > 0) {
        setAccount(accountsRes.value[0]);
      }
      if (requestsRes.status === 'fulfilled') {
        setRequests(requestsRes.value || []);
      }
      if (votingsRes.status === 'fulfilled') {
        setVotings(votingsRes.value || []);
      }
      if (announcementsRes.status === 'fulfilled') {
        setAnnouncements(announcementsRes.value || []);
      }
    } catch (e) {
      console.warn('Failed to load cabinet home data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // SOS hold handlers
  const startSosHold = () => {
    setIsHoldingSos(true);
    setSosProgress(0);
    setSosError(null);
    setSosSuccess(false);

    const startTime = Date.now();
    const duration = 1500; // 1.5 seconds

    sosIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      setSosProgress(pct);
    }, 30);

    sosTimerRef.current = setTimeout(async () => {
      // Trigger SOS!
      if (sosIntervalRef.current) clearInterval(sosIntervalRef.current);
      setSosProgress(100);
      try {
        await CabinetApi.triggerSos();
        setSosSuccess(true);
      } catch (err: any) {
        setSosError(err?.message || 'Не удалось отправить сигнал SOS');
      } finally {
        setIsHoldingSos(false);
      }
    }, duration);
  };

  const cancelSosHold = () => {
    if (sosTimerRef.current) clearTimeout(sosTimerRef.current);
    if (sosIntervalRef.current) clearInterval(sosIntervalRef.current);
    setIsHoldingSos(false);
    setSosProgress(0);
  };

  // Barrier open handler
  const handleOpenBarrier = async (e: React.FormEvent) => {
    e.preventDefault();
    const tenantId = profile?.tenantId || profile?.ownerships?.[0]?.unit?.building?.tenantId;
    if (!tenantId) return;

    setBarrierLoading(true);
    setBarrierError(null);
    setBarrierSuccess(null);

    try {
      const points = await CabinetApi.getAccessPoints(tenantId);
      const barrier = points.find((p) => p.type === 'BARRIER' || p.type === 'GATE') || points[0];
      if (!barrier) {
        throw new Error('Точки доступа типа шлагбаум не найдены');
      }

      await CabinetApi.openBarrier(barrier.id, barrierPin, profile?.ownerships?.[0]?.unitId);
      setBarrierSuccess(t('cabinet.barrierOpened'));
      setTimeout(() => {
        setShowBarrierModal(false);
        setBarrierSuccess(null);
        setBarrierPin('');
      }, 1500);
    } catch (err: any) {
      setBarrierError(err?.message || 'Ошибка открытия шлагбаума');
    } finally {
      setBarrierLoading(false);
    }
  };

  const primaryOwnership = profile?.ownerships?.[0];
  const unitNumber = primaryOwnership?.unit?.unitNumber;
  const balance = account?.balance ?? 0;
  const ringSegments = buildRingSegments(account?.charges);
  const urgentAnnouncement = announcements.find((a) => a.isUrgent) || announcements[0];
  const activeVotings = votings.filter((v) => v.status === 'ACTIVE');

  // Format currency
  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'KZT',
      maximumFractionDigits: 0,
    })
      .format(val)
      .replace('KZT', '₸');
  };

  // Format date
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      return new Intl.DateTimeFormat(
        i18n.language === 'en' ? 'en-US' : i18n.language === 'kk' ? 'kk-KZ' : 'ru-RU',
        { day: 'numeric', month: 'short', timeZone: 'Asia/Almaty' },
      ).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white p-5 sm:p-6 rounded-2xl shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
            {t('cabinet.welcome', { name: profile?.firstName || t('dashboard.defaultResident') })}
          </h1>
          <p className="text-emerald-100 text-xs sm:text-sm mt-1">
            {profile?.tenant?.name || profile?.tenantName} •{' '}
            {unitNumber ? t('cabinet.apartment', { number: unitNumber }) : t('cabinet.claimUnit')}
          </p>
        </div>

        {primaryOwnership?.isVerified ? (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-md text-white text-xs font-semibold self-start sm:self-center">
            <ShieldCheck className="w-4 h-4 text-emerald-300" />
            <span>{t('profile.verified') || 'Подтверждён'}</span>
          </div>
        ) : (
          <Link
            href="/cabinet/claim-unit"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-400 text-slate-900 text-xs font-bold self-start sm:self-center hover:bg-amber-300 transition-colors"
          >
            <span>{t('cabinet.claimUnit')}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>

      {/* Grid: Balance Card & SOS Emergency Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Balance Card (2 cols) */}
        <div className="md:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t('cabinet.balance')}
              </span>
              {account?.accountNumber && (
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                  {t('cabinet.accountNumber')} {account.accountNumber}
                </span>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between gap-4">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span
                className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${
                  balance < 0
                    ? 'text-red-600 dark:text-red-400'
                    : balance > 0
                    ? 'text-steppe-600 dark:text-steppe-400'
                    : 'text-slate-900 dark:text-white'
                }`}
              >
                {formatMoney(balance)}
              </span>

              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {balance < 0
                  ? t('cabinet.currentDebt')
                  : balance > 0
                  ? t('cabinet.advanceCredit')
                  : t('cabinet.noDebt')}
              </span>
            </div>
            {ringSegments.length > 0 && (
              <div className="shrink-0 hidden sm:block">
                <ChargesRing segments={ringSegments} />
              </div>
            )}
            </div>
            {ringSegments.length > 0 && (
              <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                {ringSegments.map((seg, i) => (
                  <li key={seg.label + i} className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: RING_COLORS[i % RING_COLORS.length] }} />
                    <span className="truncate">{seg.label}</span>
                    <span className="ml-auto font-semibold tabular-nums">{formatMoney(seg.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setShowPayModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors"
            >
              <CreditCard className="w-4 h-4" />
              <span>{t('cabinet.pay')}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowReceiptModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors"
            >
              <FileText className="w-4 h-4" />
              <span>{t('cabinet.receipt')}</span>
            </button>

            <Link
              href="/cabinet/finance"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline ml-auto"
            >
              <span>{t('navigation.cabinetFinance')}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* SOS Card (1 col) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between items-center text-center">
          <div>
            <div className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400 font-extrabold text-xs uppercase tracking-wider">
              <AlertTriangle className="w-4 h-4" />
              <span>{t('cabinet.sos')}</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              {t('cabinet.sosHint')}
            </p>
          </div>

          {/* Press and hold button with circular progress */}
          <div className="my-3 relative flex items-center justify-center">
            {/* Background ring */}
            <svg className="w-24 h-24 transform -rotate-90">
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="6"
                className="text-slate-200 dark:text-slate-800"
                fill="transparent"
              />
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="6"
                className="text-red-500 transition-all duration-75"
                fill="transparent"
                strokeDasharray={251.2}
                strokeDashoffset={251.2 - (251.2 * sosProgress) / 100}
                strokeLinecap="round"
              />
            </svg>

            <button
              type="button"
              onMouseDown={startSosHold}
              onMouseUp={cancelSosHold}
              onMouseLeave={cancelSosHold}
              onTouchStart={startSosHold}
              onTouchEnd={cancelSosHold}
              className={`absolute w-16 h-16 rounded-full font-black text-lg transition-transform shadow-lg flex items-center justify-center select-none ${
                isHoldingSos
                  ? 'bg-red-700 text-white scale-95'
                  : 'bg-red-600 hover:bg-red-500 text-white hover:scale-105 active:scale-95'
              }`}
              aria-label={t('cabinet.sos')}
            >
              SOS
            </button>
          </div>

          <div className="text-[11px]">
            {sosSuccess && (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                {t('cabinet.sosSent')}
              </span>
            )}
            {sosError && (
              <span className="text-red-600 dark:text-red-400 font-semibold">{sosError}</span>
            )}
            {!sosSuccess && !sosError && (
              <Link
                href="/cabinet/sos"
                className="text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 underline"
              >
                {t('navigation.cabinetSos')}
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions Grid */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
          {t('cabinet.quickActions')}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          <Link
            href="/cabinet/requests"
            className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm hover:border-emerald-500 hover:shadow-md transition-all flex flex-col items-center text-center gap-2 group"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Wrench className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {t('cabinet.createRequest')}
            </span>
          </Link>

          <Link
            href="/cabinet/access"
            className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm hover:border-emerald-500 hover:shadow-md transition-all flex flex-col items-center text-center gap-2 group"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <KeyRound className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {t('cabinet.guestPass')}
            </span>
          </Link>

          <Link
            href="/cabinet/meters"
            className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm hover:border-emerald-500 hover:shadow-md transition-all flex flex-col items-center text-center gap-2 group"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Gauge className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {t('cabinet.meterReadings')}
            </span>
          </Link>

          <button
            type="button"
            onClick={() => setShowBarrierModal(true)}
            className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm hover:border-emerald-500 hover:shadow-md transition-all flex flex-col items-center text-center gap-2 group"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Unlock className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {t('cabinet.openBarrier')}
            </span>
          </button>

          <Link
            href="/cabinet/chat"
            className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm hover:border-emerald-500 hover:shadow-md transition-all flex flex-col items-center text-center gap-2 group"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <MessageSquare className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {t('cabinet.chatWithHoa')}
            </span>
          </Link>

          <Link
            href="/cabinet/community"
            className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm hover:border-emerald-500 hover:shadow-md transition-all flex flex-col items-center text-center gap-2 group"
          >
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {t('cabinet.communityBoard')}
            </span>
          </Link>
        </div>
      </div>

      {/* Announcements & Voting Banner */}
      {urgentAnnouncement && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 flex items-start gap-3">
          <Bell className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                {t('cabinet.announcements')}
              </span>
              <span className="text-[10px] text-amber-700 dark:text-amber-400">
                {formatDate(urgentAnnouncement.createdAt)}
              </span>
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 truncate">
              {urgentAnnouncement.title}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">
              {urgentAnnouncement.content}
            </p>
          </div>
          <Link
            href="/cabinet/announcements"
            className="self-center px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shrink-0 transition-colors"
          >
            {t('common.details')}
          </Link>
        </div>
      )}

      {/* Two columns: Recent Requests & Active Votings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recent Requests Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Wrench className="w-4 h-4 text-emerald-600" />
              <span>{t('cabinet.recentRequests')}</span>
            </h3>
            <Link
              href="/cabinet/requests"
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
            >
              <span>{t('cabinet.allRequests')}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {requests.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              {t('cabinet.noRequests')}
            </div>
          ) : (
            <div className="space-y-3">
              {requests.slice(0, 3).map((req) => (
                <Link
                  key={req.id}
                  href={`/cabinet/requests`}
                  className="block p-3 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[200px]">
                      {req.title}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {formatDate(req.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        req.status === 'RESOLVED' || req.status === 'CLOSED'
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                          : req.status === 'IN_PROGRESS'
                          ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                          : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {getRequestStatusLabel(req.status, t)}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">{getRequestCategoryLabel(req.category, t)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Active Votings Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Vote className="w-4 h-4 text-emerald-600" />
              <span>{t('cabinet.votings')}</span>
            </h3>
            <Link
              href="/cabinet/voting"
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
            >
              <span>{t('common.all')}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {activeVotings.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              {t('cabinet.noVotings')}
            </div>
          ) : (
            <div className="space-y-3">
              {activeVotings.slice(0, 2).map((vote) => (
                <Link
                  key={vote.id}
                  href="/cabinet/voting"
                  className="block p-3 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                >
                  <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                    {vote.title}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span>
                      {t('cabinet.votingQuorum')}: {vote.quorumPercent}%
                    </span>
                    <span>
                      {formatDate(vote.startDate)} — {formatDate(vote.endDate)}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 mt-1.5 overflow-hidden">
                    <div
                      className="bg-emerald-600 h-1.5 rounded-full"
                      style={{ width: `${Math.min(100, vote.quorumPercent)}%` }}
                    />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pay Modal */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl relative animate-in fade-in duration-200">
            <button
              type="button"
              onClick={() => setShowPayModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label={t('cabinet.close')}
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {t('cabinet.payModalTitle')}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {t('cabinet.payModalDesc')}
            </p>

            <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <span className="text-xs text-slate-600 dark:text-slate-400">
                {balance < 0 ? t('cabinet.totalPayable') : t('cabinet.advanceCredit')}
              </span>
              <span className="text-base font-extrabold text-slate-900 dark:text-white">
                {balance < 0 ? formatMoney(Math.abs(balance)) : `+${formatMoney(balance)}`}
              </span>
            </div>
            {balance >= 0 && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-2 font-medium">
                {t('cabinet.balanceCreditNotice')}
              </p>
            )}

            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => {
                  alert(t('cabinet.paySuccess'));
                  setShowPayModal(false);
                }}
                className="w-full p-3 rounded-xl border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 text-xs font-bold flex items-center justify-between transition-colors"
              >
                <span>{t('cabinet.payKaspi')}</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  alert(t('cabinet.paySuccess'));
                  setShowPayModal(false);
                }}
                className="w-full p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center justify-between transition-colors"
              >
                <span>{t('cabinet.payHalyk')}</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  alert(t('cabinet.paySuccess'));
                  setShowPayModal(false);
                }}
                className="w-full p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center justify-between transition-colors"
              >
                <span>{t('cabinet.payCard')}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {showReceiptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl relative max-h-[90vh] overflow-y-auto animate-in fade-in duration-200">
            <button
              type="button"
              onClick={() => setShowReceiptModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label={t('cabinet.close')}
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-5 h-5 text-emerald-600" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t('cabinet.receiptTitle')}
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('cabinet.receiptDesc')}
            </p>

            {/* Receipt document mockup */}
            <div className="mt-4 p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 font-mono text-xs space-y-2">
              <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-2 font-bold text-slate-900 dark:text-white">
                <span>{profile?.tenant?.name || 'ЖК Шаңырақ'}</span>
                <span>№ {account?.accountNumber || '101-001'}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Адрес / Квартира:</span>
                <span>Кв. {unitNumber || '101'}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Плательщик:</span>
                <span>{profile?.firstName} {profile?.lastName}</span>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                <div className="font-bold text-slate-900 dark:text-white mb-1">
                  Начисления по тарифам:
                </div>
                {account?.charges && account.charges.length > 0 ? (
                  account.charges.slice(0, 4).map((c) => (
                    <div key={c.id} className="flex justify-between py-0.5 text-slate-700 dark:text-slate-300">
                      <span>{c.tariffItem?.name || 'Услуга'}</span>
                      <span>{formatMoney(c.amount)}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-400 py-1">Текущих начислений нет</div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between font-bold text-sm text-slate-900 dark:text-white">
                <span>{balance < 0 ? t('cabinet.totalPayable') : t('cabinet.advanceCredit')}</span>
                <span>{balance < 0 ? formatMoney(Math.abs(balance)) : `+${formatMoney(balance)}`}</span>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5 transition-colors"
              >
                <Printer className="w-4 h-4" />
                <span>{t('cabinet.printReceipt')}</span>
              </button>
              <button
                type="button"
                onClick={() => alert('PDF квитанция сформирована')}
                className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 flex items-center justify-center gap-1.5 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>{t('cabinet.downloadPdf')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barrier Modal */}
      {showBarrierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl relative animate-in fade-in duration-200">
            <button
              type="button"
              onClick={() => {
                setShowBarrierModal(false);
                setBarrierError(null);
                setBarrierSuccess(null);
              }}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label={t('cabinet.close')}
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-2">
              <Unlock className="w-5 h-5 text-emerald-600" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t('cabinet.openBarrier')}
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('cabinet.enterPin')}
            </p>

            {barrierError && (
              <div className="mt-3 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs">
                {barrierError}
              </div>
            )}

            {barrierSuccess && (
              <div className="mt-3 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>{barrierSuccess}</span>
              </div>
            )}

            <form onSubmit={handleOpenBarrier} className="mt-4 space-y-4">
              <div>
                <input
                  type="password"
                  inputMode="numeric"
                  value={barrierPin}
                  onChange={(e) => setBarrierPin(e.target.value)}
                  placeholder="••••"
                  maxLength={6}
                  className="w-full text-center tracking-widest text-xl font-mono py-2.5 px-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={barrierLoading || !barrierPin}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {barrierLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Unlock className="w-4 h-4" />
                )}
                <span>{t('cabinet.openBarrier')}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
