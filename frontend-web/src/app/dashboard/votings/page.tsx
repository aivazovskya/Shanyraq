'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Vote,
  CheckCircle2,
  FileText,
  Calendar,
  ShieldCheck,
  Download,
  AlertCircle,
} from 'lucide-react';

export default function VotingsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('current');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('votings.title')}</h1>
          <p className="text-sm text-slate-500">
            {t('votings.subtitle')}
          </p>
        </div>
        <button className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-xl shadow-sm transition">
          {t('votings.newMeetingBtn')}
        </button>
      </div>

      {/* Legal Banner */}
      <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-sky-700 shrink-0 mt-0.5" />
        <div className="text-xs text-sky-900 leading-relaxed">
          <strong>{t('votings.legalBannerTitle')}</strong> {t('votings.legalBannerText')}
        </div>
      </div>

      {/* Active Meeting Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800 rounded-full">
                {t('votings.activeVotingBadge')}
              </span>
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> {t('votings.dates')}
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-1">
              {t('votings.sampleMeetingTitle')}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <button className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-xl transition flex items-center gap-2">
              <Download className="w-4 h-4" /> {t('votings.interimRegistryBtn')}
            </button>
            <button className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition flex items-center gap-2">
              <FileText className="w-4 h-4" /> {t('votings.finishProtocolBtn')}
            </button>
          </div>
        </div>

        {/* Quorum Stats Panel */}
        <div className="p-6 border-b border-slate-100 bg-white grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
            <div className="text-xs text-slate-500">{t('votings.totalAreaLabel')}</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">12 500.0 {t('common.sqm')}</div>
            <div className="text-[11px] text-slate-400">{t('votings.totalAreaUnits')}</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
            <div className="text-xs text-slate-500">{t('votings.participatingAreaLabel')}</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">6 850.0 {t('common.sqm')}</div>
            <div className="text-[11px] text-slate-500">{t('votings.participatingUnits')}</div>
          </div>

          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
            <div className="text-xs text-emerald-800 font-medium">{t('votings.currentQuorumLabel')}</div>
            <div className="text-2xl font-black text-emerald-700 mt-0.5">54.8%</div>
            <div className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> {t('votings.quorumThresholdPassed')}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
            <div className="text-xs text-slate-500">{t('votings.timeLeftLabel')}</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">{t('votings.daysLeft')}</div>
            <div className="text-[11px] text-slate-400">{t('votings.autoCloseNotice')}</div>
          </div>
        </div>

        {/* Agenda Questions with detailed calculation */}
        <div className="p-6 space-y-6">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            {t('votings.agendaHeader')}
          </h3>

          {/* Question 1 */}
          <div className="border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded">
                  {t('votings.question1Order')}
                </span>
                <h4 className="text-base font-semibold text-slate-900 mt-1">
                  {t('votings.question1Title')}
                </h4>
                <p className="text-xs text-slate-600 mt-1">
                  {t('votings.question1Type')}
                </p>
              </div>
              <span className="px-2.5 py-1 text-xs font-semibold bg-emerald-100 text-emerald-800 rounded-md">
                {t('votings.decisionPassing')}
              </span>
            </div>

            {/* Voting distribution bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-600 font-medium">
                <span>{t('votings.forLabel')} 5 210 {t('common.sqm')} (76.1%)</span>
                <span>{t('votings.againstLabel')} 1 240 {t('common.sqm')} (18.1%)</span>
                <span>{t('votings.abstainLabel')} 400 {t('common.sqm')} (5.8%)</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
                <div className="bg-emerald-500 h-full" style={{ width: '76.1%' }} title={t('votings.forLabel')}></div>
                <div className="bg-red-500 h-full" style={{ width: '18.1%' }} title={t('votings.againstLabel')}></div>
                <div className="bg-slate-400 h-full" style={{ width: '5.8%' }} title={t('votings.abstainLabel')}></div>
              </div>
            </div>
          </div>

          {/* Question 2 */}
          <div className="border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded">
                  {t('votings.question2Order')}
                </span>
                <h4 className="text-base font-semibold text-slate-900 mt-1">
                  {t('votings.question2Title')}
                </h4>
                <p className="text-xs text-slate-600 mt-1">
                  {t('votings.question2Type')}
                </p>
              </div>
              <span className="px-2.5 py-1 text-xs font-semibold bg-emerald-100 text-emerald-800 rounded-md">
                {t('votings.decisionPassing')}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-600 font-medium">
                <span>{t('votings.forLabel')} 6 120 {t('common.sqm')} (89.3%)</span>
                <span>{t('votings.againstLabel')} 480 {t('common.sqm')} (7.0%)</span>
                <span>{t('votings.abstainLabel')} 250 {t('common.sqm')} (3.7%)</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
                <div className="bg-emerald-500 h-full" style={{ width: '89.3%' }}></div>
                <div className="bg-red-500 h-full" style={{ width: '7.0%' }}></div>
                <div className="bg-slate-400 h-full" style={{ width: '3.7%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
