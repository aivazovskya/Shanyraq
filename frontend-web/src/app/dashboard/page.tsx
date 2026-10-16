'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, AlertTriangle, Building2, Clock, CreditCard, KeyRound, Loader2, MessageSquare, RefreshCw, Shield, Vote, Wrench } from 'lucide-react';
import { apiRequest, getStoredSession } from '@/lib/api';
import { DashboardRequest, DashboardSection, getDashboardPlan, getRequestQueues, getWorkspace, overdueSince } from '@/lib/dashboard-model';

interface SosAlert {
  id: string; status: string; createdAt: string;
  acceptedById?: string | null;
  acceptedBy?: { firstName: string; lastName: string } | null;
  unit?: { unitNumber: string; building?: { blockName: string } } | null;
  triggeredBy?: { firstName: string; lastName: string } | null;
}
interface AccessPoint { id: string; name: string; type: string; isActive: boolean }
interface FinanceSummary { periodMonth: number; periodYear: number; totalCharged: number; totalCollected: number; collectionRatePercent: number }
interface Meeting { id: string; title: string; status: string; endDate: string; quorum: { quorumPercent: number } }
interface Structure { buildings: { units: { id: string; area: number }[] }[] }
type DashboardData = { requests: DashboardRequest[]; sos: SosAlert[]; points: AccessPoint[]; finance: FinanceSummary; meetings: Meeting[]; structure: Structure };
type SectionState<T> = { status: 'loading' | 'ready' | 'error'; data?: T; updating?: boolean };
type DashboardStates = { [K in DashboardSection]?: SectionState<DashboardData[K]> };

function Metric({ title, value, icon: Icon, danger = false }: { title: string; value: React.ReactNode; icon: typeof Wrench; danger?: boolean }) {
  return <div className={`rounded-2xl border bg-white p-5 ${danger ? 'border-red-200' : 'border-slate-200'}`}>
    <div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-slate-600">{title}</p><Icon aria-hidden="true" className={`h-5 w-5 shrink-0 ${danger ? 'text-red-600' : 'text-sky-600'}`} /></div>
    <p className={`mt-3 break-words text-2xl font-semibold tracking-tight tabular-nums ${danger ? 'text-red-700' : 'text-slate-900'}`}>{value}</p>
  </div>;
}

function Panel({ title, href, state, retry, children, hint }: {
  title: string; href?: string; state?: SectionState<unknown>; retry: () => void; children: React.ReactNode; hint?: string;
}) {
  const { t } = useTranslation();
  return <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6" aria-busy={!state || state.status === 'loading' || state.updating}>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-slate-900">{title}</h2>{hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}</div>
      <div className="flex items-center gap-2">{state?.updating && <Loader2 size={16} className="animate-spin text-slate-400" aria-label={t('common.loading')} />}{href && <Link href={href} className="inline-flex min-h-8 items-center gap-1 text-sm font-semibold text-sky-700 hover:underline">{t('roleHome.openSection')}<ArrowUpRight size={16} aria-hidden="true" /></Link>}</div>
    </div>
    {!state || state.status === 'loading' ? <div role="status" className="flex min-h-24 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" />{t('common.loading')}</div>
      : state.status === 'error' ? <div role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><p>{t('roleHome.loadError')}</p><button onClick={retry} className="mt-2 min-h-11 font-semibold underline">{t('common.refresh')}</button></div>
        : children}
  </section>;
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const user = getStoredSession()?.user;
  const tenantId = user?.tenantId;
  const workspace = getWorkspace(user?.role);
  const plan = useMemo(() => getDashboardPlan(user?.role, tenantId), [user?.role, tenantId]);
  const [states, setStates] = useState<DashboardStates>({});
  const [now, setNow] = useState(Date.now());
  const controllers = useRef(new Map<DashboardSection, AbortController>());
  const loadSection = useCallback(async (key: DashboardSection, path: string) => {
    controllers.current.get(key)?.abort();
    const controller = new AbortController();
    controllers.current.set(key, controller);
    setStates((previous) => ({ ...previous, [key]: previous[key]?.status === 'ready' ? { ...previous[key], updating: true } : { status: 'loading' } }));
    try {
      const data = await apiRequest(path, { signal: controller.signal });
      if (!controller.signal.aborted) setStates((previous) => ({ ...previous, [key]: { status: 'ready', data } }));
    } catch {
      if (!controller.signal.aborted) setStates((previous) => ({ ...previous, [key]: { status: 'error' } }));
    }
  }, []);
  const refresh = useCallback(() => {
    setNow(Date.now());
    plan.forEach(({ key, path }) => { void loadSection(key, path); });
  }, [plan, loadSection]);
  useEffect(() => {
    setStates({});
    refresh();
    const timer = setInterval(() => setNow(Date.now()), 30000);
    const activeControllers = controllers.current;
    return () => { clearInterval(timer); activeControllers.forEach((controller) => controller.abort()); };
  }, [refresh]);
  useEffect(() => {
    if (workspace !== 'security' && workspace !== 'dispatcher') return;
    const timer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 30000);
    return () => clearInterval(timer);
  }, [workspace, refresh]);

  const retry = (key: DashboardSection) => { const item = plan.find((entry) => entry.key === key); if (item) void loadSection(item.key, item.path); };
  const ready = (key: DashboardSection) => states[key]?.status === 'ready';
  const queues = getRequestQueues(states.requests?.data || [], tenantId || '', now);
  const alerts = (states.sos?.data || []).filter((alert) => alert.status === 'ACTIVE').sort((a, b) => Number(!!a.acceptedById) - Number(!!b.acceptedById) || Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const points = (states.points?.data || []).filter((point) => point.isActive);
  const finance = states.finance?.data;
  const meetings = (states.meetings?.data || []).filter((meeting) => meeting.status === 'ACTIVE');
  const units = states.structure?.data?.buildings.flatMap((building) => building.units) || [];
  const loading = plan.some(({ key }) => !states[key] || states[key]?.status === 'loading' || states[key]?.updating);
  const number = (value: number) => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }).format(value);
  const money = (value: number) => `${number(value)} ₸`;
  const date = (value: string | number) => new Date(value).toLocaleString(i18n.language, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const empty = (key: string) => <p className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">{t(`roleHome.${key}`)}</p>;
  const requestList = (items: DashboardRequest[], overdue = false) => items.length === 0 ? empty(overdue ? 'noOverdue' : 'noUrgent') : <ul className="divide-y divide-slate-100">{items.slice(0, 5).map((request) =>
    <li key={request.id}><Link href={`/dashboard/requests?q=${encodeURIComponent(request.id)}`} className="block rounded-xl py-4 hover:bg-slate-50 sm:px-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-medium text-slate-500">{t('common.unitShort')} {request.unit?.unitNumber || '—'}{request.unit?.building?.blockName ? ` · ${request.unit.building.blockName}` : ''}</span>
        <span className="rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">{t(`requests.${{ EMERGENCY: 'prioEmergency', HIGH: 'prioHigh', MEDIUM: 'prioMedium', LOW: 'prioLow' }[request.priority]}`)}</span></div>
      <p className="mt-2 break-words text-sm font-semibold text-slate-900">{request.title}</p><p className="mt-1 text-xs text-slate-500">{request.assignee ? `${request.assignee.firstName} ${request.assignee.lastName}` : t('dashboard.unassignedLabel')}</p>
      {overdue && <p className="mt-2 text-xs font-medium text-red-700">{t('roleHome.overdueSince', { date: date(overdueSince(request)) })}</p>}
    </Link></li>)}</ul>;
  const quickLink = (href: string, label: string, Icon: typeof Wrench) => <Link key={href} href={href} className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:border-sky-300 hover:bg-sky-50"><span className="flex items-center gap-3"><Icon size={19} className="shrink-0 text-sky-600" aria-hidden="true" />{label}</span><ArrowUpRight size={16} aria-hidden="true" /></Link>;

  if (workspace === 'unsupported') return <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">{t('roleHome.unsupported')}</p>;
  if (!tenantId) return <div className="space-y-4"><h1 className="text-2xl font-bold text-slate-900">{t(`roleHome.${workspace}Title`)}</h1><p className="text-slate-600">{t('roleHome.noTenant')}</p>{user?.role === 'SUPERADMIN' && quickLink('/dashboard/tenants', t('navigation.tenants'), Building2)}</div>;

  return <div className="space-y-6">
    <div className="flex flex-col items-start justify-between gap-4 sm:flex-row"><div><p className="mb-1 text-sm font-medium text-sky-700">{user?.tenantName || t('dashboard.defaultComplex')}</p><h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{t(`roleHome.${workspace}Title`)}</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">{t(`roleHome.${workspace}Subtitle`)}</p></div>
      <button onClick={refresh} disabled={loading} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"><RefreshCw size={17} className={loading ? 'animate-spin' : ''} aria-hidden="true" />{t('common.refresh')}</button></div>
    {workspace === 'dispatcher' && <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric title={t('roleHome.urgent')} value={ready('requests') ? queues.urgent.length : '—'} icon={AlertTriangle} danger={ready('requests') && queues.urgent.length > 0} /><Metric title={t('roleHome.overdue')} value={ready('requests') ? queues.overdue.length : '—'} icon={Clock} danger={ready('requests') && queues.overdue.length > 0} /><Metric title={t('roleHome.unassigned')} value={ready('requests') ? queues.unassigned.length : '—'} icon={Wrench} /><Metric title={t('dashboard.activeRequests')} value={ready('requests') ? queues.open.length : '—'} icon={Wrench} /></div>
      <div className="grid gap-6 xl:grid-cols-2"><Panel title={t('roleHome.urgent')} hint={t('roleHome.urgentHint')} href="/dashboard/requests" state={states.requests} retry={() => retry('requests')}>{requestList(queues.urgent)}</Panel><Panel title={t('roleHome.overdue')} hint={t('roleHome.slaHint')} href="/dashboard/requests" state={states.requests} retry={() => retry('requests')}>{requestList(queues.overdue, true)}</Panel></div>
      <div className="grid gap-3 sm:grid-cols-3">{quickLink('/dashboard/requests', t('dashboard.allRequests'), Wrench)}{quickLink('/dashboard/chat', t('navigation.chat'), MessageSquare)}{quickLink('/dashboard/shift-handover', t('navigation.shiftHandover'), Clock)}</div>
    </>}
    {workspace === 'security' && <>
      <div className="grid gap-4 sm:grid-cols-3"><Metric title={t('roleHome.activeSos')} value={ready('sos') ? alerts.length : '—'} icon={Shield} danger={ready('sos') && alerts.length > 0} /><Metric title={t('roleHome.entryPoints')} value={ready('points') ? points.filter((point) => point.type !== 'CAMERA').length : '—'} icon={KeyRound} /><Metric title={t('roleHome.cameras')} value={ready('points') ? points.filter((point) => point.type === 'CAMERA').length : '—'} icon={KeyRound} /></div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title={t('roleHome.activeSos')} hint={t('roleHome.sosHint')} href="/dashboard/sos" state={states.sos} retry={() => retry('sos')}>
          {alerts.length === 0 ? empty('noSos') : <ul className="space-y-3">{alerts.slice(0, 5).map((alert) => <li key={alert.id}><Link href="/dashboard/sos" className={`block rounded-xl border p-4 transition-colors ${alert.acceptedById ? 'border-amber-200 bg-amber-50 hover:bg-amber-100' : 'border-red-200 bg-red-50 hover:bg-red-100'}`}><p className="mb-2 text-xs font-semibold text-slate-700">{t(alert.acceptedById ? 'sosFlow.inProgress' : 'sosFlow.waiting')}</p><p className="font-semibold text-slate-900">{t('common.unitShort')} {alert.unit?.unitNumber || '—'}{alert.unit?.building?.blockName ? ` · ${alert.unit.building.blockName}` : ''}</p>{alert.triggeredBy && <p className="mt-1 break-words text-sm text-slate-700">{alert.triggeredBy.firstName} {alert.triggeredBy.lastName}</p>}<p className="mt-2 text-xs text-slate-600">{date(alert.createdAt)}</p>{alert.acceptedBy && <p className="mt-2 break-words text-xs text-slate-600">{t('sosFlow.acceptedBy')}: {alert.acceptedBy.firstName} {alert.acceptedBy.lastName}</p>}</Link></li>)}</ul>}
        </Panel>
        <Panel title={t('roleHome.access')} hint={t('roleHome.configuredHint')} href="/dashboard/access" state={states.points} retry={() => retry('points')}>
          {points.length === 0 ? empty('noPoints') : <ul className="divide-y divide-slate-100">{points.slice(0, 6).map((point) => <li key={point.id} className="flex items-center justify-between gap-3 py-3"><span className="break-words text-sm font-medium text-slate-800">{point.name}</span><span className="shrink-0 text-xs text-slate-500">{t('roleHome.configured')}</span></li>)}</ul>}
        </Panel>
      </div><div className="grid gap-3 sm:grid-cols-3">{quickLink('/dashboard/access/guest-passes', t('roleHome.guestPasses'), KeyRound)}{quickLink('/dashboard/access', t('roleHome.accessLog'), KeyRound)}{quickLink('/dashboard/shift-handover', t('navigation.shiftHandover'), Clock)}</div>
    </>}
    {workspace === 'management' && <>
      <Panel title={t('roleHome.finance')} href="/dashboard/finance" state={states.finance} retry={() => retry('finance')} hint={finance ? t('roleHome.financePeriod', { month: String(finance.periodMonth).padStart(2, '0'), year: finance.periodYear }) : undefined}>
        {finance && <div className="grid gap-4 sm:grid-cols-3"><Metric title={t('roleHome.charged')} value={money(finance.totalCharged)} icon={CreditCard} /><Metric title={t('roleHome.collected')} value={money(finance.totalCollected)} icon={CreditCard} /><Metric title={t('roleHome.collectionRate')} value={finance.totalCharged > 0 ? `${number(finance.collectionRatePercent)}%` : '—'} icon={CreditCard} /></div>}{finance && finance.totalCharged === 0 && <p className="mt-3 text-sm text-slate-500">{t('roleHome.noCharges')}</p>}
      </Panel>
      <div className="grid gap-4 sm:grid-cols-3"><Metric title={t('dashboard.activeRequests')} value={ready('requests') ? queues.open.length : '—'} icon={Wrench} /><Metric title={t('roleHome.overdue')} value={ready('requests') ? queues.overdue.length : '—'} icon={Clock} danger={ready('requests') && queues.overdue.length > 0} /><Metric title={t('dashboard.housingStock')} value={ready('structure') ? units.length : '—'} icon={Building2} /></div>
      {states.structure?.status === 'error' && <Panel title={t('dashboard.housingStock')} state={states.structure} retry={() => retry('structure')}>{null}</Panel>}
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title={t('roleHome.attention')} href="/dashboard/requests" state={states.requests} retry={() => retry('requests')}>{requestList(Array.from(new Map([...queues.overdue, ...queues.urgent].map((request) => [request.id, request])).values()))}</Panel>
        <Panel title={t('navigation.votings')} href="/dashboard/votings" state={states.meetings} retry={() => retry('meetings')}>
          {meetings.length === 0 ? empty('noMeetings') : <ul className="space-y-4">{meetings.slice(0, 3).map((meeting) => <li key={meeting.id} className="rounded-xl border border-slate-200 p-4"><p className="break-words text-sm font-semibold text-slate-900">{meeting.title}</p><p className="mt-2 text-xs text-slate-500">{t('roleHome.votingEnds', { date: date(meeting.endDate) })}</p><p className="mt-2 text-sm font-semibold text-sky-700">{t('dashboard.ossQuorum')}: {number(meeting.quorum.quorumPercent)}%</p><progress max={100} value={Math.min(100, Math.max(0, meeting.quorum.quorumPercent))} aria-label={t('dashboard.ossQuorum')} className="mt-2 h-2 w-full accent-sky-600" /></li>)}</ul>}
        </Panel>
      </div><div className="grid gap-3 sm:grid-cols-3">{quickLink('/dashboard/analytics', t('navigation.analytics'), CreditCard)}{quickLink('/dashboard/finance/expenses', t('roleHome.expenses'), CreditCard)}{quickLink('/dashboard/votings', t('dashboard.newMeetingBtn'), Vote)}</div>
    </>}
    {(workspace === 'security' || workspace === 'dispatcher') && <p className="text-xs text-slate-500">{t('roleHome.autoRefresh')}</p>}
  </div>;
}
