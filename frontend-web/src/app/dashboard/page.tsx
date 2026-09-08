'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Vote,
  Wrench,
  KeyRound,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  AlertTriangle,
  Building,
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {t('dashboard.summaryTitle', { complex: t('dashboard.defaultComplex') })}
          </h1>
          <p className="text-sm text-slate-500">
            {t('dashboard.summarySubtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard/votings"
            className="inline-flex items-center px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-xl shadow-sm transition"
          >
            {t('dashboard.newMeetingBtn')}
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('dashboard.ossQuorum')}
            </span>
            <div className="p-2 bg-sky-50 text-sky-600 rounded-xl">
              <Vote className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">54.8%</div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-emerald-600 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{t('dashboard.quorumAchieved')}</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('dashboard.activeRequests')}
            </span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Wrench className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">3</div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500 font-medium">
              <Clock className="w-3.5 h-3.5" />
              <span>{t('dashboard.avgResponseTime')}</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('dashboard.barrierPasses')}
            </span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <KeyRound className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">182</div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-indigo-600 font-medium">
              <span>{t('dashboard.todayNoFails')}</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('dashboard.housingStock')}
            </span>
            <div className="p-2 bg-slate-100 text-slate-600 rounded-xl">
              <Building className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">{t('dashboard.unitsCount', { count: 140 })}</div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500 font-medium">
              <span>{t('dashboard.totalArea')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Two Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Active ОСС Voting */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">{t('dashboard.currentVotingTitle')}</h2>
              <p className="text-xs text-slate-500">{t('dashboard.currentVotingSub')}</p>
            </div>
            <span className="px-2.5 py-1 text-xs font-semibold bg-emerald-100 text-emerald-800 rounded-full">
              {t('dashboard.votingUntil')}
            </span>
          </div>

          <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-3">
            <div className="font-semibold text-slate-800 text-sm">
              {t('dashboard.annualMeetingTitle')}
            </div>
            <p className="text-xs text-slate-600">
              {t('dashboard.annualMeetingDesc')}
            </p>

            {/* Quorum Progress Bar */}
            <div>
              <div className="flex justify-between text-xs font-medium text-slate-700 mb-1.5">
                <span>{t('dashboard.quorumProgress')}</span>
                <span className="font-bold text-sky-700">{t('dashboard.quorumPercentBadge')}</span>
              </div>
              <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden flex">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: '54.8%' }}
                ></div>
              </div>
              <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                <span>0%</span>
                <span className="font-semibold text-slate-600">{t('dashboard.quorumThreshold')}</span>
                <span>100%</span>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-slate-200/60 text-xs">
              <span className="text-slate-500">{t('dashboard.votedUnits')}</span>
              <Link
                href="/dashboard/votings"
                className="text-sky-600 hover:text-sky-700 font-semibold inline-flex items-center gap-1"
              >
                {t('dashboard.protocolDetails')} <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Right Column: Pending Service Requests */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900">{t('dashboard.urgentRequests')}</h2>
            <Link href="/dashboard/requests" className="text-xs text-sky-600 font-semibold hover:underline">
              {t('dashboard.allRequests')}
            </Link>
          </div>

          <div className="space-y-3">
            <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/50">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-amber-900">{t('common.unitShort')} 101 ({t('requests.unitA', 'Блок А')})</span>
                <span className="text-red-700 font-medium bg-red-100 px-2 py-0.5 rounded">{t('dashboard.urgentBadge')}</span>
              </div>
              <p className="text-xs text-slate-700 mt-1 font-medium">
                {t('requests.sampleRequest1', 'Слабый напор горячей воды в ванной')}
              </p>
              <div className="text-[11px] text-slate-500 mt-1">
                {t('dashboard.assignedPlumber')}
              </div>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800">{t('common.unitShort')} 42 ({t('requests.unitA', 'Блок А')})</span>
                <span className="text-sky-700 font-medium bg-sky-100 px-2 py-0.5 rounded">{t('dashboard.inProgressBadge')}</span>
              </div>
              <p className="text-xs text-slate-700 mt-1 font-medium">
                {t('requests.sampleRequest2', 'Сбой связи домофонной панели подъезда 1')}
              </p>
              <div className="text-[11px] text-slate-500 mt-1">
                {t('dashboard.assignedAccess')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
