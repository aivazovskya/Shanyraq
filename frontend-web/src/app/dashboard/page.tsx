'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
  Loader2,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { apiRequest, getStoredSession, getApiErrorMessage } from '@/lib/api';

interface MeetingItem {
  id: string;
  tenantId: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  quorum: {
    totalEligibleArea: number;
    totalVotedArea: number;
    quorumPercent: number;
    isQuorumAchieved: boolean;
    participatedUnitsCount: number;
  };
}

interface ServiceRequestItem {
  id: string;
  title: string;
  description: string;
  category: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'CANCELLED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';
  createdAt: string;
  unit?: {
    unitNumber: string;
    building?: {
      blockName: string;
    };
  };
  assignee?: {
    firstName: string;
    lastName: string;
  } | null;
}

interface TenantStructure {
  tenantId: string;
  tenantName: string;
  address: string;
  city: string;
  buildings: Array<{
    id: string;
    blockName: string;
    units: Array<{
      id: string;
      unitNumber: string;
      area: number;
    }>;
  }>;
}

interface AccessPointItem {
  id: string;
  name: string;
  isActive: boolean;
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const session = getStoredSession();
  const user = session?.user;
  const tenantId = user?.tenantId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [requests, setRequests] = useState<ServiceRequestItem[]>([]);
  const [totalUnitsCount, setTotalUnitsCount] = useState<number>(0);
  const [totalComplexArea, setTotalComplexArea] = useState<number>(0);
  const [accessPointsCount, setAccessPointsCount] = useState<number>(0);

  const fetchDashboardData = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const [votingsRes, requestsRes, structureRes, accessRes] = await Promise.allSettled([
      apiRequest<MeetingItem[]>(`/votings/tenant/${tenantId}`),
      apiRequest<ServiceRequestItem[]>('/service-requests'),
      apiRequest<TenantStructure>(`/properties/tenants/${tenantId}/structure`),
      apiRequest<AccessPointItem[]>(`/access/tenant/${tenantId}/points`),
    ]);

    if (votingsRes.status === 'fulfilled') {
      setMeetings(votingsRes.value || []);
    }
    if (requestsRes.status === 'fulfilled') {
      setRequests(requestsRes.value || []);
    }
    if (structureRes.status === 'fulfilled' && structureRes.value) {
      let count = 0;
      let area = 0;
      structureRes.value.buildings?.forEach((b) => {
        b.units?.forEach((u) => {
          count += 1;
          area += Number(u.area) || 0;
        });
      });
      setTotalUnitsCount(count);
      setTotalComplexArea(Math.round(area * 10) / 10);
    }
    if (accessRes.status === 'fulfilled') {
      setAccessPointsCount(accessRes.value?.length || 0);
    }

    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Derived metrics
  const activeMeeting = meetings.find((m) => m.status === 'ACTIVE') || meetings[0];
  const quorumPercent = activeMeeting?.quorum?.quorumPercent ?? 0;
  const isQuorumAchieved = activeMeeting?.quorum?.isQuorumAchieved ?? false;

  const activeRequests = requests.filter(
    (r) => r.status === 'PENDING' || r.status === 'IN_PROGRESS',
  );

  // Top urgent / pending requests
  const urgentRequests = [...requests]
    .filter((r) => r.status === 'PENDING' || r.status === 'IN_PROGRESS')
    .sort((a, b) => {
      const pScore = (p: string) =>
        p === 'EMERGENCY' ? 4 : p === 'HIGH' ? 3 : p === 'MEDIUM' ? 2 : 1;
      return pScore(b.priority) - pScore(a.priority);
    })
    .slice(0, 3);

  const getPriorityBadgeClass = (priority: string) => {
    switch (priority) {
      case 'EMERGENCY':
      case 'HIGH':
        return 'text-red-700 font-medium bg-red-100';
      case 'MEDIUM':
        return 'text-amber-700 font-medium bg-amber-100';
      default:
        return 'text-slate-700 font-medium bg-slate-100';
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'EMERGENCY':
      case 'HIGH':
        return t('requests.prioHigh');
      case 'MEDIUM':
        return t('requests.prioMedium');
      default:
        return t('requests.prioLow');
    }
  };

  const canCreateMeeting =
    user?.role === 'SUPERADMIN' || user?.role === 'HOA_ADMIN' || user?.role === 'HOA_CHAIRMAN';

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
        <p className="text-sm font-medium text-slate-500">{t('dashboard.loadingDashboard')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {t('dashboard.summaryTitle', { complex: user?.tenantName || t('dashboard.defaultComplex') })}
          </h1>
          <p className="text-sm text-slate-500">
            {t('dashboard.summarySubtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchDashboardData}
            title={t('common.refresh')}
            className="inline-flex items-center p-2 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {canCreateMeeting && (
            <Link
              href="/dashboard/votings"
              className="inline-flex items-center px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-xl shadow-sm transition"
            >
              {t('dashboard.newMeetingBtn')}
            </Link>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        {/* Quorum Card */}
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
            <div className="text-2xl font-bold text-slate-900">{quorumPercent.toFixed(1)}%</div>
            <div className={`flex items-center gap-1.5 mt-1 text-xs font-medium ${isQuorumAchieved ? 'text-emerald-600' : 'text-amber-600'}`}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isQuorumAchieved ? t('dashboard.quorumAchieved') : t('dashboard.quorumPending')}</span>
            </div>
          </div>
        </div>

        {/* Active Requests Card */}
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
            <div className="text-2xl font-bold text-slate-900">{activeRequests.length}</div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500 font-medium">
              <Clock className="w-3.5 h-3.5" />
              <span>{t('dashboard.avgResponseTime')}</span>
            </div>
          </div>
        </div>

        {/* Access Points Card (replaces hardcoded barrier passes counter per Subtask C) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('dashboard.activePointsLabel')}
            </span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <KeyRound className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">
              {t('dashboard.accessPointsCount', { count: accessPointsCount })}
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-indigo-600 font-medium">
              <span>{t('dashboard.todayNoFails')}</span>
            </div>
          </div>
        </div>

        {/* Housing Stock Card */}
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
            <div className="text-2xl font-bold text-slate-900">
              {t('dashboard.unitsCount', { count: totalUnitsCount || 140 })}
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500 font-medium">
              <span>
                {totalComplexArea > 0
                  ? t('dashboard.totalAreaValue', { area: totalComplexArea.toLocaleString() })
                  : t('dashboard.totalArea')}
              </span>
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
            {activeMeeting ? (
              <span className="px-2.5 py-1 text-xs font-semibold bg-emerald-100 text-emerald-800 rounded-full">
                {t('dashboard.votingUntilDynamic', {
                  date: new Date(activeMeeting.endDate).toLocaleDateString(),
                })}
              </span>
            ) : (
              <span className="px-2.5 py-1 text-xs font-semibold bg-slate-100 text-slate-600 rounded-full">
                {t('dashboard.noActiveVoting')}
              </span>
            )}
          </div>

          {activeMeeting ? (
            <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-3">
              <div className="font-semibold text-slate-800 text-sm">
                {activeMeeting.title}
              </div>
              {activeMeeting.description && (
                <p className="text-xs text-slate-600">
                  {activeMeeting.description}
                </p>
              )}

              {/* Quorum Progress Bar */}
              <div>
                <div className="flex justify-between text-xs font-medium text-slate-700 mb-1.5">
                  <span>
                    {t('dashboard.quorumProgressDynamic', {
                      voted: Math.round(activeMeeting.quorum.totalVotedArea).toLocaleString(),
                      total: Math.round(activeMeeting.quorum.totalEligibleArea).toLocaleString(),
                    })}
                  </span>
                  <span className="font-bold text-sky-700">
                    {t('dashboard.quorumBadgeText', {
                      percent: activeMeeting.quorum.quorumPercent.toFixed(1),
                      status: activeMeeting.quorum.isQuorumAchieved
                        ? t('dashboard.quorumAchieved')
                        : t('dashboard.quorumPending'),
                    })}
                  </span>
                </div>
                <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden flex">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      activeMeeting.quorum.isQuorumAchieved ? 'bg-emerald-500' : 'bg-sky-500'
                    }`}
                    style={{ width: `${Math.min(activeMeeting.quorum.quorumPercent, 100)}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                  <span>0%</span>
                  <span className="font-semibold text-slate-600">{t('dashboard.quorumThreshold')}</span>
                  <span>100%</span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-slate-200/60 text-xs">
                <span className="text-slate-500">
                  {t('dashboard.votedUnitsDynamic', {
                    voted: activeMeeting.quorum.participatedUnitsCount,
                    total: totalUnitsCount || activeMeeting.quorum.participatedUnitsCount,
                  })}
                </span>
                <Link
                  href="/dashboard/votings"
                  className="text-sky-600 hover:text-sky-700 font-semibold inline-flex items-center gap-1"
                >
                  {t('dashboard.protocolDetails')} <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
              {t('dashboard.noActiveVoting')}
            </div>
          )}
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
            {urgentRequests.length === 0 ? (
              <div className="p-6 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl text-xs">
                {t('dashboard.noUrgentRequests')}
              </div>
            ) : (
              urgentRequests.map((req) => (
                <div
                  key={req.id}
                  className={`p-3 rounded-xl border ${
                    req.priority === 'HIGH' || req.priority === 'EMERGENCY'
                      ? 'border-amber-200 bg-amber-50/50'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900">
                      {t('common.unitShort')}{' '}
                      {req.unit?.unitNumber || '—'}{' '}
                      {req.unit?.building?.blockName ? `(${req.unit.building.blockName})` : ''}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[11px] ${getPriorityBadgeClass(req.priority)}`}>
                      {getPriorityLabel(req.priority)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 mt-1 font-medium line-clamp-2">
                    {req.title}
                  </p>
                  <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                    <span>
                      {req.assignee
                        ? t('dashboard.assignedTo', {
                            name: `${req.assignee.firstName} ${req.assignee.lastName}`,
                          })
                        : t('dashboard.unassignedLabel')}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(req.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

