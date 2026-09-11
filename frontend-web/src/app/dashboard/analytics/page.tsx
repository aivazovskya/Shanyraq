'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  TrendingUp,
  CreditCard,
  Wrench,
  Users,
  Calendar,
  AlertCircle,
  Loader2,
  RefreshCw,
  Building,
  CheckCircle2,
  Clock,
  Star,
  ArrowDownRight,
  Vote,
  CalendarDays,
  ShoppingBag,
  MessageSquare,
  Gauge,
  Percent,
  Download,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { apiRequest, apiDownload, getStoredSession, AuthUser } from '@/lib/api';

interface TenantItem {
  id: string;
  name: string;
  address?: string;
}

interface TariffBreakdownItem {
  tariffId: string;
  tariffName: string;
  amount: number;
}

interface TopDebtorItem {
  accountId: string;
  accountNumber: string;
  unitId: string;
  unitNumber: string;
  buildingBlock: string;
  balance: number;
}

interface FinanceAnalyticsData {
  periodMonth: number;
  periodYear: number;
  totalCharged: number;
  totalCollected: number;
  collectionRatePercent: number;
  byTariff: TariffBreakdownItem[];
  topDebtors: TopDebtorItem[];
}

interface RequestStatusCount {
  status: string;
  count: number;
}

interface RequestCategoryCount {
  category: string;
  count: number;
}

interface RequestsAnalyticsData {
  from: string;
  to: string;
  totalRequests: number;
  byStatus: RequestStatusCount[];
  byCategory: RequestCategoryCount[];
  averageResolutionTimeHours: number;
  averageRating: number;
  ratedRequestsCount: number;
}

interface ActivityAnalyticsData {
  totalRegisteredResidentsCount: number;
  verifiedResidentsCount: number;
  adoptionRatePercent: number;
  period: {
    from: string;
    to: string;
  };
  votesCast: number;
  requestsCreated: number;
  bookingsCreated: number;
  listingsCreated: number;
  chatMessagesSent: number;
  meterReadingsSubmitted: number;
}

type PeriodPreset = '7d' | '30d' | '90d';

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#f59e0b',
  IN_PROGRESS: '#0ea5e9',
  RESOLVED: '#10b981',
  CLOSED: '#64748b',
  CANCELLED: '#f43f5e',
};

const CHART_COLORS = [
  '#0284c7',
  '#0d9488',
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f97316',
  '#14b8a6',
  '#84cc16',
];

export default function AnalyticsDashboardPage() {
  const { t } = useTranslation();
  const [isMounted, setIsMounted] = useState(false);

  // Session & Tenant state
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [tenantId, setTenantId] = useState<string>('');
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);

  // View state
  const [activeTab, setActiveTab] = useState<'finance' | 'requests' | 'activity'>('finance');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Finance filters & data
  const currentDate = new Date();
  const [financeMonth, setFinanceMonth] = useState<number>(currentDate.getMonth() + 1);
  const [financeYear, setFinanceYear] = useState<number>(currentDate.getFullYear());
  const [financeData, setFinanceData] = useState<FinanceAnalyticsData | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);

  // Requests filters & data
  const [requestsPreset, setRequestsPreset] = useState<PeriodPreset>('30d');
  const [requestsData, setRequestsData] = useState<RequestsAnalyticsData | null>(null);

  // Activity filters & data
  const [activityPreset, setActivityPreset] = useState<PeriodPreset>('30d');
  const [activityData, setActivityData] = useState<ActivityAnalyticsData | null>(null);
  const [exportingActivityCsv, setExportingActivityCsv] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const getPresetDates = (preset: PeriodPreset) => {
    const to = new Date();
    const days = preset === '7d' ? 7 : preset === '90d' ? 90 : 30;
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
    };
  };

  // 1. Fetch Finance
  const fetchFinance = useCallback(
    async (tId: string, month: number, year: number) => {
      if (!tId) return;
      try {
        setLoading(true);
        setErrorMsg(null);
        const data = await apiRequest<FinanceAnalyticsData>(
          `/analytics/tenants/${tId}/finance?month=${month}&year=${year}`,
        );
        setFinanceData(data);
      } catch (err: any) {
        setErrorMsg(err.message || t('analytics.finance.loadError'));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  const handleExportCsv = async () => {
    if (!tenantId || exportingCsv) return;
    try {
      setExportingCsv(true);
      await apiDownload(
        `/analytics/tenants/${tenantId}/finance/export?month=${financeMonth}&year=${financeYear}`,
        `finance-analytics-${tenantId}-${financeYear}-${String(financeMonth).padStart(2, '0')}.csv`,
      );
    } catch (err: any) {
      console.error('Failed to export finance analytics CSV:', err);
      setErrorMsg(err.message || 'Ошибка экспорта CSV');
    } finally {
      setExportingCsv(false);
    }
  };

  // 2. Fetch Requests
  const fetchRequests = useCallback(
    async (tId: string, preset: PeriodPreset) => {
      if (!tId) return;
      try {
        setLoading(true);
        setErrorMsg(null);
        const { from, to } = getPresetDates(preset);
        const data = await apiRequest<RequestsAnalyticsData>(
          `/analytics/tenants/${tId}/requests?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        );
        setRequestsData(data);
      } catch (err: any) {
        setErrorMsg(err.message || t('analytics.requests.loadError'));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  // 3. Fetch Activity
  const fetchActivity = useCallback(
    async (tId: string, preset: PeriodPreset) => {
      if (!tId) return;
      try {
        setLoading(true);
        setErrorMsg(null);
        const { from, to } = getPresetDates(preset);
        const data = await apiRequest<ActivityAnalyticsData>(
          `/analytics/tenants/${tId}/activity?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        );
        setActivityData(data);
      } catch (err: any) {
        setErrorMsg(err.message || t('analytics.activity.loadError'));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  const handleExportActivityCsv = async () => {
    if (!tenantId || exportingActivityCsv) return;
    try {
      setExportingActivityCsv(true);
      const { from, to } = getPresetDates(activityPreset);
      const fromDateStr = from.split('T')[0];
      const toDateStr = to.split('T')[0];
      await apiDownload(
        `/analytics/tenants/${tenantId}/activity/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        `resident-activity-${tenantId}-${fromDateStr}_${toDateStr}.csv`,
      );
    } catch (err: any) {
      console.error('Failed to export resident activity CSV:', err);
      setErrorMsg(err.message || 'Ошибка экспорта CSV');
    } finally {
      setExportingActivityCsv(false);
    }
  };

  // Session initialization
  useEffect(() => {
    const session = getStoredSession();
    if (!session || !session.user) return;
    setCurrentUser(session.user);

    const isSuper = session.user.role === 'SUPERADMIN';
    if (isSuper) {
      setLoadingTenants(true);
      apiRequest<TenantItem[]>('/properties/tenants')
        .then((data) => {
          setTenants(data || []);
          const defaultTenant = session.user.tenantId || (data && data[0]?.id) || '';
          if (defaultTenant) {
            setTenantId(defaultTenant);
          }
        })
        .catch((err) => {
          console.error('Failed to load tenants for superadmin:', err);
        })
        .finally(() => {
          setLoadingTenants(false);
        });
    } else if (session.user.tenantId) {
      setTenantId(session.user.tenantId);
    }
  }, []);

  // Fetch data on dependency changes
  useEffect(() => {
    if (!tenantId) return;
    if (activeTab === 'finance') {
      fetchFinance(tenantId, financeMonth, financeYear);
    } else if (activeTab === 'requests') {
      fetchRequests(tenantId, requestsPreset);
    } else if (activeTab === 'activity') {
      fetchActivity(tenantId, activityPreset);
    }
  }, [
    tenantId,
    activeTab,
    financeMonth,
    financeYear,
    requestsPreset,
    activityPreset,
    fetchFinance,
    fetchRequests,
    fetchActivity,
  ]);

  const handleRefresh = () => {
    if (!tenantId) return;
    if (activeTab === 'finance') {
      fetchFinance(tenantId, financeMonth, financeYear);
    } else if (activeTab === 'requests') {
      fetchRequests(tenantId, requestsPreset);
    } else if (activeTab === 'activity') {
      fetchActivity(tenantId, activityPreset);
    }
  };

  const isSuperadmin = currentUser?.role === 'SUPERADMIN';

  // Years for picker (last 3 years)
  const years = [currentDate.getFullYear(), currentDate.getFullYear() - 1, currentDate.getFullYear() - 2];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-100 text-sky-700">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{t('analytics.pageTitle')}</h1>
              <p className="text-sm text-slate-500">{t('analytics.pageSubtitle')}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Superadmin Tenant Selector */}
          {isSuperadmin && (
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-slate-400" />
              <select
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                disabled={loadingTenants}
                className="bg-white border border-slate-200 text-slate-700 text-sm rounded-xl px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-sm"
              >
                {tenants.map((ten) => (
                  <option key={ten.id} value={ten.id}>
                    {ten.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={handleRefresh}
            disabled={loading || !tenantId}
            className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>{t('common.refresh')}</span>
          </button>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          onClick={() => setActiveTab('finance')}
          className={`flex items-center gap-2 py-3 px-4 font-semibold text-sm border-b-2 transition-all ${
            activeTab === 'finance'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>{t('analytics.tabs.finance')}</span>
        </button>

        <button
          onClick={() => setActiveTab('requests')}
          className={`flex items-center gap-2 py-3 px-4 font-semibold text-sm border-b-2 transition-all ${
            activeTab === 'requests'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Wrench className="w-4 h-4" />
          <span>{t('analytics.tabs.requests')}</span>
        </button>

        <button
          onClick={() => setActiveTab('activity')}
          className={`flex items-center gap-2 py-3 px-4 font-semibold text-sm border-b-2 transition-all ${
            activeTab === 'activity'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>{t('analytics.tabs.activity')}</span>
        </button>
      </div>

      {/* Error Alert */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-center gap-3 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Superadmin Prompt if no tenant selected */}
      {isSuperadmin && !tenantId && !loadingTenants && (
        <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 shadow-sm">
          <Building className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <h3 className="font-semibold text-slate-800 mb-1">{t('analytics.selectTenantPromptTitle')}</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">{t('analytics.selectTenantPromptSub')}</p>
        </div>
      )}

      {/* TAB 1: FINANCE */}
      {activeTab === 'finance' && tenantId && (
        <div className="space-y-6">
          {/* Controls bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span>{t('analytics.filters.month')}:</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={financeMonth}
                onChange={(e) => setFinanceMonth(Number(e.target.value))}
                className="bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-xl px-3 py-1.5 font-medium focus:ring-2 focus:ring-sky-500 outline-none"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {t(`analytics.months.${m}`)}
                  </option>
                ))}
              </select>

              <select
                value={financeYear}
                onChange={(e) => setFinanceYear(Number(e.target.value))}
                className="bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-xl px-3 py-1.5 font-medium focus:ring-2 focus:ring-sky-500 outline-none"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleExportCsv}
                disabled={exportingCsv || !financeData}
                className="flex items-center gap-2 px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm font-medium rounded-xl border border-emerald-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ml-2"
                title={t('analytics.finance.exportCsv')}
              >
                {exportingCsv ? (
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                ) : (
                  <Download className="w-4 h-4 text-emerald-600" />
                )}
                <span>
                  {exportingCsv
                    ? t('analytics.finance.exporting')
                    : t('analytics.finance.exportCsv')}
                </span>
              </button>
            </div>
          </div>

          {/* Loading Skeleton */}
          {loading && !financeData && (
            <div className="p-12 flex justify-center items-center">
              <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
            </div>
          )}

          {financeData && (
            <>
              {/* Stat Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    {t('analytics.finance.totalCharged')}
                  </div>
                  <div className="text-2xl font-bold text-slate-900">
                    {financeData.totalCharged.toLocaleString('ru-RU')} ₸
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {t(`analytics.months.${financeData.periodMonth}`)} {financeData.periodYear}
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    {t('analytics.finance.totalCollected')}
                  </div>
                  <div className="text-2xl font-bold text-emerald-600">
                    {financeData.totalCollected.toLocaleString('ru-RU')} ₸
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {t(`analytics.months.${financeData.periodMonth}`)} {financeData.periodYear}
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    {t('analytics.finance.collectionRate')}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`text-2xl font-bold ${
                        financeData.collectionRatePercent >= 90
                          ? 'text-emerald-600'
                          : financeData.collectionRatePercent >= 70
                          ? 'text-amber-600'
                          : 'text-rose-600'
                      }`}
                    >
                      {financeData.collectionRatePercent}%
                    </span>
                    <Percent className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {financeData.totalCharged > 0
                      ? t('analytics.finance.percentOfCharges', {
                          percent: Math.round(
                            (financeData.totalCollected / financeData.totalCharged) * 100,
                          ),
                        })
                      : t('analytics.finance.noCharges')}
                  </div>
                </div>
              </div>

              {/* Tariff Breakdown Chart */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h2 className="text-base font-bold text-slate-900 mb-4">
                  {t('analytics.finance.tariffBreakdown')}
                </h2>
                {financeData.byTariff.length === 0 ? (
                  <div className="py-12 text-center text-sm text-slate-400">
                    {t('analytics.finance.noTariffData')}
                  </div>
                ) : (
                  <div className="h-72 w-full">
                    {isMounted && (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={financeData.byTariff}
                          margin={{ top: 10, right: 30, left: 20, bottom: 25 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis
                            dataKey="tariffName"
                            tick={{ fontSize: 12, fill: '#64748b' }}
                            interval={0}
                            angle={-15}
                            textAnchor="end"
                          />
                          <YAxis
                            tick={{ fontSize: 12, fill: '#64748b' }}
                            tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                          />
                          <Tooltip
                            formatter={(value: any) => [
                              `${Number(value).toLocaleString('ru-RU')} ₸`,
                              t('analytics.finance.amount'),
                            ]}
                            contentStyle={{
                              borderRadius: '12px',
                              border: '1px solid #e2e8f0',
                              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                            }}
                          />
                          <Bar dataKey="amount" fill="#0284c7" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                )}
              </div>

              {/* Top Debtors Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-200">
                  <h2 className="text-base font-bold text-slate-900">
                    {t('analytics.finance.topDebtors')}
                  </h2>
                </div>

                {financeData.topDebtors.length === 0 ? (
                  <div className="py-12 text-center text-sm text-slate-500">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                    <p>{t('analytics.finance.noDebtors')}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600">
                      <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="px-6 py-3.5">#</th>
                          <th className="px-6 py-3.5">{t('analytics.finance.debtorUnit')}</th>
                          <th className="px-6 py-3.5">{t('analytics.finance.debtorAccount')}</th>
                          <th className="px-6 py-3.5 text-right">{t('analytics.finance.debtorBalance')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {financeData.topDebtors.map((debtor, index) => (
                          <tr key={debtor.accountId} className="hover:bg-slate-50/80 transition">
                            <td className="px-6 py-4 font-semibold text-slate-400">{index + 1}</td>
                            <td className="px-6 py-4 font-medium text-slate-900">
                              {debtor.buildingBlock}, {t('common.unitShort')} {debtor.unitNumber}
                            </td>
                            <td className="px-6 py-4 font-mono text-xs text-slate-500">
                              {debtor.accountNumber}
                            </td>
                            <td className="px-6 py-4 text-right font-bold text-rose-600">
                              {debtor.balance.toLocaleString('ru-RU')} ₸
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: REQUESTS */}
      {activeTab === 'requests' && tenantId && (
        <div className="space-y-6">
          {/* Preset Buttons */}
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-sm font-medium text-slate-700">{t('analytics.filters.periodLabel')}</span>
            <div className="inline-flex rounded-xl bg-slate-100 p-1">
              {(['7d', '30d', '90d'] as PeriodPreset[]).map((preset) => (
                <button
                  key={preset}
                  onClick={() => setRequestsPreset(preset)}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
                    requestsPreset === preset
                      ? 'bg-white text-sky-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t(`analytics.filters.period${preset}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Loading Skeleton */}
          {loading && !requestsData && (
            <div className="p-12 flex justify-center items-center">
              <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
            </div>
          )}

          {requestsData && (
            <>
              {/* Stat Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    {t('analytics.requests.totalRequests')}
                  </div>
                  <div className="text-2xl font-bold text-slate-900">
                    {requestsData.totalRequests}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {t('analytics.requests.periodSummary', {
                      period: t(`analytics.filters.period${requestsPreset}`),
                    })}
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    {t('analytics.requests.avgResolutionTime')}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-sky-600">
                      {requestsData.averageResolutionTimeHours}
                    </span>
                    <span className="text-sm font-medium text-slate-500">
                      {t('analytics.requests.hours')}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {t('analytics.requests.forResolvedAndClosed')}
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    {t('analytics.requests.avgRating')}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-amber-500">
                      {requestsData.averageRating > 0 ? requestsData.averageRating : '—'}
                    </span>
                    <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {requestsData.ratedRequestsCount > 0
                      ? `${requestsData.ratedRequestsCount} ${t('analytics.requests.ratedRequestsCount')}`
                      : t('analytics.requests.noRatings')}
                  </div>
                </div>
              </div>

              {/* Status & Category Charts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Status Breakdown */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h2 className="text-base font-bold text-slate-900 mb-4">
                    {t('analytics.requests.statusBreakdown')}
                  </h2>
                  {requestsData.byStatus.length === 0 ? (
                    <div className="py-12 text-center text-sm text-slate-400">
                      {t('analytics.requests.noRequestsData')}
                    </div>
                  ) : (
                    <div className="h-64 w-full">
                      {isMounted && (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={requestsData.byStatus.map((s) => ({
                              statusName: t(`analytics.statuses.${s.status}`) || s.status,
                              status: s.status,
                              count: s.count,
                            }))}
                            margin={{ top: 10, right: 20, left: 10, bottom: 20 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="statusName" tick={{ fontSize: 12, fill: '#64748b' }} />
                            <YAxis tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                            <Tooltip
                              formatter={(val: any) => [val, t('analytics.requests.count')]}
                              contentStyle={{
                                borderRadius: '12px',
                                border: '1px solid #e2e8f0',
                              }}
                            />
                            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                              {requestsData.byStatus.map((entry) => (
                                <Cell
                                  key={`cell-${entry.status}`}
                                  fill={STATUS_COLORS[entry.status] || '#0ea5e9'}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  )}
                </div>

                {/* Category Breakdown */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h2 className="text-base font-bold text-slate-900 mb-4">
                    {t('analytics.requests.categoryBreakdown')}
                  </h2>
                  {requestsData.byCategory.length === 0 ? (
                    <div className="py-12 text-center text-sm text-slate-400">
                      {t('analytics.requests.noRequestsData')}
                    </div>
                  ) : (
                    <div className="h-64 w-full">
                      {isMounted && (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={requestsData.byCategory.map((c) => ({
                              categoryName: t(`analytics.categories.${c.category}`) || c.category,
                              count: c.count,
                            }))}
                            layout="vertical"
                            margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                            <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                            <YAxis
                              type="category"
                              dataKey="categoryName"
                              tick={{ fontSize: 11, fill: '#64748b' }}
                              width={110}
                            />
                            <Tooltip
                              formatter={(val: any) => [val, t('analytics.requests.count')]}
                              contentStyle={{
                                borderRadius: '12px',
                                border: '1px solid #e2e8f0',
                              }}
                            />
                            <Bar dataKey="count" fill="#6366f1" radius={[0, 6, 6, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 3: RESIDENT ACTIVITY */}
      {activeTab === 'activity' && tenantId && (
        <div className="space-y-6">
          {/* Preset Buttons & Export */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-sm font-medium text-slate-700">{t('analytics.filters.periodLabel')}</span>
            <div className="flex items-center gap-3">
              <div className="inline-flex rounded-xl bg-slate-100 p-1">
                {(['7d', '30d', '90d'] as PeriodPreset[]).map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setActivityPreset(preset)}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
                      activityPreset === preset
                        ? 'bg-white text-sky-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t(`analytics.filters.period${preset}`)}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleExportActivityCsv}
                disabled={exportingActivityCsv || !activityData}
                className="flex items-center gap-2 px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm font-medium rounded-xl border border-emerald-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={t('analytics.activity.exportCsv')}
              >
                {exportingActivityCsv ? (
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                ) : (
                  <Download className="w-4 h-4 text-emerald-600" />
                )}
                <span>
                  {exportingActivityCsv
                    ? t('analytics.activity.exporting')
                    : t('analytics.activity.exportCsv')}
                </span>
              </button>
            </div>
          </div>

          {/* Loading Skeleton */}
          {loading && !activityData && (
            <div className="p-12 flex justify-center items-center">
              <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
            </div>
          )}

          {activityData && (
            <>
              {/* Adoption Stat Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    {t('analytics.activity.totalRegistered')}
                  </div>
                  <div className="text-2xl font-bold text-slate-900">
                    {activityData.totalRegisteredResidentsCount}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {t('analytics.activity.registeredSub')}
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    {t('analytics.activity.verifiedResidents')}
                  </div>
                  <div className="text-2xl font-bold text-emerald-600">
                    {activityData.verifiedResidentsCount}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {t('analytics.activity.verifiedSub')}
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    {t('analytics.activity.adoptionRate')}
                  </div>
                  <div className="text-2xl font-bold text-sky-600">
                    {activityData.adoptionRatePercent}%
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {t('analytics.activity.adoptionRateSub')}
                  </div>
                </div>
              </div>

              {/* Interaction Bar Chart */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h2 className="text-base font-bold text-slate-900 mb-4">
                  {t('analytics.activity.activityCounts')}
                </h2>

                <div className="h-72 w-full">
                  {isMounted && (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[
                          { name: t('analytics.activity.votesCast'), count: activityData.votesCast, fill: '#6366f1' },
                          { name: t('analytics.activity.requestsCreated'), count: activityData.requestsCreated, fill: '#0ea5e9' },
                          { name: t('analytics.activity.bookingsCreated'), count: activityData.bookingsCreated, fill: '#14b8a6' },
                          { name: t('analytics.activity.listingsCreated'), count: activityData.listingsCreated, fill: '#f59e0b' },
                          { name: t('analytics.activity.chatMessagesSent'), count: activityData.chatMessagesSent, fill: '#ec4899' },
                          { name: t('analytics.activity.meterReadingsSubmitted'), count: activityData.meterReadingsSubmitted, fill: '#10b981' },
                        ]}
                        margin={{ top: 10, right: 30, left: 20, bottom: 25 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 12, fill: '#64748b' }}
                          interval={0}
                          angle={-15}
                          textAnchor="end"
                        />
                        <YAxis tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                        <Tooltip
                          formatter={(val: any) => [val, t('analytics.activity.actionsCount')]}
                          contentStyle={{
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                          }}
                        />
                        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                          {[
                            '#6366f1',
                            '#0ea5e9',
                            '#14b8a6',
                            '#f59e0b',
                            '#ec4899',
                            '#10b981',
                          ].map((color, index) => (
                            <Cell key={`cell-${index}`} fill={color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Grid of Interaction Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-2">
                    <Vote className="w-4 h-4" />
                  </div>
                  <div className="text-xl font-bold text-slate-900">{activityData.votesCast}</div>
                  <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                    {t('analytics.activity.votesCast')}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
                  <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center mx-auto mb-2">
                    <Wrench className="w-4 h-4" />
                  </div>
                  <div className="text-xl font-bold text-slate-900">{activityData.requestsCreated}</div>
                  <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                    {t('analytics.activity.requestsCreated')}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center mx-auto mb-2">
                    <CalendarDays className="w-4 h-4" />
                  </div>
                  <div className="text-xl font-bold text-slate-900">{activityData.bookingsCreated}</div>
                  <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                    {t('analytics.activity.bookingsCreated')}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-2">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <div className="text-xl font-bold text-slate-900">{activityData.listingsCreated}</div>
                  <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                    {t('analytics.activity.listingsCreated')}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
                  <div className="w-8 h-8 rounded-lg bg-pink-50 text-pink-600 flex items-center justify-center mx-auto mb-2">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div className="text-xl font-bold text-slate-900">{activityData.chatMessagesSent}</div>
                  <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                    {t('analytics.activity.chatMessagesSent')}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                    <Gauge className="w-4 h-4" />
                  </div>
                  <div className="text-xl font-bold text-slate-900">{activityData.meterReadingsSubmitted}</div>
                  <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                    {t('analytics.activity.meterReadingsSubmitted')}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
