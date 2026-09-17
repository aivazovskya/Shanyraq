'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  Building2,
  Plus,
  UserPlus,
  KeyRound,
  Copy,
  Check,
  AlertTriangle,
  Search,
  RefreshCw,
  Loader2,
  X,
  AlertCircle,
  CheckCircle2,
  Users,
  Wrench,
  CreditCard,
  Pencil,
  UserCheck,
  UserX,
} from 'lucide-react';
import { apiRequest, getStoredSession, getApiErrorMessage } from '@/lib/api';

interface StaffItem {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  role: 'HOA_ADMIN' | 'HOA_CHAIRMAN' | 'DISPATCHER' | 'SECURITY';
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

interface TenantItem {
  id: string;
  name: string;
  address: string;
  city: string;
  totalArea: number;
  totalUnitsCount: number;
  createdAt: string;
  buildings?: Array<{
    id: string;
    blockName: string;
    _count?: { units: number };
  }>;
}

interface PlatformTenantSummary {
  tenantId: string;
  tenantName: string;
  totalResidentsCount: number;
  verifiedResidentsCount: number;
  activeSosAlertsCount: number;
  openServiceRequestsCount: number;
  outstandingDebt: number;
}

interface PlatformOverview {
  tenantsCount: number;
  totalResidentsCount: number;
  verifiedResidentsCount: number;
  activeSosAlertsCount: number;
  openServiceRequestsCount: number;
  totalOutstandingDebt: number;
  tenants: PlatformTenantSummary[];
}

interface CreatedStaffResult {
  tenantName: string;
  userName: string;
  phone: string;
  role: string;
  tempPassword: string;
}

export default function TenantsPage() {
  const router = useRouter();
  const { t } = useTranslation();

  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [platformOverview, setPlatformOverview] = useState<PlatformOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Modals state
  const [isCreateTenantOpen, setIsCreateTenantOpen] = useState(false);
  const [tenantName, setTenantName] = useState('');
  const [tenantAddress, setTenantAddress] = useState('');
  const [tenantCity, setTenantCity] = useState('Астана');
  const [isCreatingTenant, setIsCreatingTenant] = useState(false);

  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<TenantItem | null>(null);
  const [staffFirstName, setStaffFirstName] = useState('');
  const [staffLastName, setStaffLastName] = useState('');
  const [staffPhone, setStaffPhone] = useState('+7');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffRole, setStaffRole] = useState<'HOA_ADMIN' | 'HOA_CHAIRMAN' | 'DISPATCHER' | 'SECURITY'>('HOA_ADMIN');
  const [isCreatingStaff, setIsCreatingStaff] = useState(false);

  // One-time temporary password display modal
  const [tempPasswordResult, setTempPasswordResult] = useState<CreatedStaffResult | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // Staff list modal
  const [isStaffListOpen, setIsStaffListOpen] = useState(false);
  const [staffListTenant, setStaffListTenant] = useState<TenantItem | null>(null);
  const [staffList, setStaffList] = useState<StaffItem[]>([]);
  const [loadingStaffList, setLoadingStaffList] = useState(false);

  // Edit staff modal
  const [editingStaff, setEditingStaff] = useState<StaffItem | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [isUpdatingStaff, setIsUpdatingStaff] = useState(false);

  // Deactivate confirmation modal
  const [deactivatingStaff, setDeactivatingStaff] = useState<StaffItem | null>(null);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  // Gated to SUPERADMIN
  useEffect(() => {
    const session = getStoredSession();
    if (!session || !session.user) {
      router.push('/');
      return;
    }
    if (session.user.role !== 'SUPERADMIN') {
      router.push('/dashboard');
      return;
    }
  }, [router]);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tenantsData, overviewData] = await Promise.all([
        apiRequest<TenantItem[]>('/properties/tenants'),
        apiRequest<PlatformOverview>('/analytics/platform/overview').catch((err) => {
          console.error('Failed to load platform overview:', err);
          return null;
        }),
      ]);
      setTenants(tenantsData);
      if (overviewData) {
        setPlatformOverview(overviewData);
      }
    } catch (err: any) {
      setError(getApiErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const overviewMap = React.useMemo(() => {
    const map = new Map<string, PlatformTenantSummary>();
    if (platformOverview?.tenants) {
      for (const item of platformOverview.tenants) {
        map.set(item.tenantId, item);
      }
    }
    return map;
  }, [platformOverview]);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantName.trim() || !tenantAddress.trim()) return;

    setIsCreatingTenant(true);
    setError(null);

    try {
      await apiRequest('/properties/tenants', {
        method: 'POST',
        body: JSON.stringify({
          name: tenantName.trim(),
          address: tenantAddress.trim(),
          city: tenantCity.trim() || 'Астана',
        }),
      });

      setIsCreateTenantOpen(false);
      setTenantName('');
      setTenantAddress('');
      setTenantCity('Астана');

      setActionMessage({
        type: 'success',
        text: t('tenants.createTenantSuccess'),
      });
      setTimeout(() => setActionMessage(null), 5000);

      await fetchTenants();
    } catch (err: any) {
      setError(getApiErrorMessage(err, t));
    } finally {
      setIsCreatingTenant(false);
    }
  };

  const handleOpenAddStaff = (tenant: TenantItem) => {
    setSelectedTenant(tenant);
    setStaffFirstName('');
    setStaffLastName('');
    setStaffPhone('+7');
    setStaffEmail('');
    setStaffRole('HOA_ADMIN');
    setIsAddStaffOpen(true);
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenant) return;

    setIsCreatingStaff(true);
    setError(null);

    try {
      const result = await apiRequest<{
        id: string;
        firstName: string;
        lastName: string;
        phone: string;
        role: string;
        tempPassword: string;
      }>(`/properties/tenants/${selectedTenant.id}/staff`, {
        method: 'POST',
        body: JSON.stringify({
          firstName: staffFirstName.trim(),
          lastName: staffLastName.trim(),
          phone: staffPhone.trim(),
          email: staffEmail.trim() ? staffEmail.trim() : undefined,
          role: staffRole,
        }),
      });

      setIsAddStaffOpen(false);

      // Open one-time temporary password display modal
      setTempPasswordResult({
        tenantName: selectedTenant.name,
        userName: `${result.firstName} ${result.lastName}`,
        phone: result.phone,
        role: result.role,
        tempPassword: result.tempPassword,
      });
      setIsCopied(false);

      setActionMessage({
        type: 'success',
        text: t('tenants.addStaffSuccess'),
      });
      setTimeout(() => setActionMessage(null), 5000);
      if (staffListTenant && staffListTenant.id === selectedTenant.id) {
        fetchStaffList(selectedTenant);
      }
    } catch (err: any) {
      setError(getApiErrorMessage(err, t));
    } finally {
      setIsCreatingStaff(false);
    }
  };

  const handleCopyPassword = async () => {
    if (!tempPasswordResult) return;
    try {
      await navigator.clipboard.writeText(tempPasswordResult.tempPassword);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 3000);
    } catch {
      // Fallback if clipboard API is restricted
      const textarea = document.createElement('textarea');
      textarea.value = tempPasswordResult.tempPassword;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 3000);
    }
  };

  const fetchStaffList = async (tItem: TenantItem) => {
    setLoadingStaffList(true);
    try {
      const data = await apiRequest<StaffItem[]>(`/properties/tenants/${tItem.id}/staff`);
      setStaffList(data || []);
    } catch (err: any) {
      setError(getApiErrorMessage(err, t));
    } finally {
      setLoadingStaffList(false);
    }
  };

  const handleOpenStaffList = (tItem: TenantItem) => {
    setStaffListTenant(tItem);
    setIsStaffListOpen(true);
    fetchStaffList(tItem);
  };

  const handleOpenEditStaff = (staff: StaffItem) => {
    setEditingStaff(staff);
    setEditFirstName(staff.firstName);
    setEditLastName(staff.lastName);
    setEditEmail(staff.email || '');
  };

  const handleSaveEditStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff || !staffListTenant) return;
    setIsUpdatingStaff(true);
    setError(null);
    try {
      const updated = await apiRequest<StaffItem>(
        `/properties/tenants/${staffListTenant.id}/staff/${editingStaff.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            firstName: editFirstName.trim(),
            lastName: editLastName.trim(),
            email: editEmail.trim() ? editEmail.trim() : null,
          }),
        },
      );
      setStaffList((prev) =>
        prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)),
      );
      setEditingStaff(null);
      setActionMessage({
        type: 'success',
        text: t('tenants.editStaffSuccess'),
      });
      setTimeout(() => setActionMessage(null), 5000);
    } catch (err: any) {
      setError(getApiErrorMessage(err, t));
    } finally {
      setIsUpdatingStaff(false);
    }
  };

  const handleToggleStaffStatus = async (staff: StaffItem) => {
    if (!staffListTenant) return;
    if (staff.isActive) {
      setDeactivatingStaff(staff);
      return;
    }

    setIsTogglingStatus(true);
    try {
      const updated = await apiRequest<StaffItem>(
        `/properties/tenants/${staffListTenant.id}/staff/${staff.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ isActive: true }),
        },
      );
      setStaffList((prev) =>
        prev.map((s) => (s.id === updated.id ? { ...s, isActive: true } : s)),
      );
      setActionMessage({
        type: 'success',
        text: t('tenants.staffStatusUpdated'),
      });
      setTimeout(() => setActionMessage(null), 5000);
    } catch (err: any) {
      setError(getApiErrorMessage(err, t));
    } finally {
      setIsTogglingStatus(false);
    }
  };

  const handleConfirmDeactivateStaff = async () => {
    if (!staffListTenant || !deactivatingStaff) return;
    setIsTogglingStatus(true);
    try {
      const updated = await apiRequest<StaffItem>(
        `/properties/tenants/${staffListTenant.id}/staff/${deactivatingStaff.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ isActive: false }),
        },
      );
      setStaffList((prev) =>
        prev.map((s) => (s.id === updated.id ? { ...s, isActive: false } : s)),
      );
      setDeactivatingStaff(null);
      setActionMessage({
        type: 'success',
        text: t('tenants.staffStatusUpdated'),
      });
      setTimeout(() => setActionMessage(null), 5000);
    } catch (err: any) {
      setError(getApiErrorMessage(err, t));
    } finally {
      setIsTogglingStatus(false);
    }
  };

  const filteredTenants = tenants.filter((tItem) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      tItem.name.toLowerCase().includes(q) ||
      tItem.address.toLowerCase().includes(q) ||
      tItem.city.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                {t('tenants.title')}
              </h1>
              <p className="text-sm text-slate-500">
                {t('tenants.subtitle')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchTenants()}
            disabled={loading}
            className="p-2 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
            title={t('common.refresh')}
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsCreateTenantOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-medium text-sm transition-all shadow-sm shadow-sky-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>{t('tenants.createTenant')}</span>
          </button>
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Platform Overview Stat Cards (SUPERADMIN cross-tenant summary) */}
      {platformOverview && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t('tenants.platformOverviewTitle')}
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Total ЖК */}
            <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {t('tenants.totalTenants')}
                </span>
                <div className="p-2 bg-sky-50 text-sky-600 rounded-xl">
                  <Building2 className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-slate-900">
                  {platformOverview.tenantsCount}
                </div>
                <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500 font-medium">
                  <span>{t('tenants.activeComplexes')}</span>
                </div>
              </div>
            </div>

            {/* Total Residents */}
            <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {t('tenants.totalResidents')}
                </span>
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Users className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-slate-900">
                  {platformOverview.totalResidentsCount}
                </div>
                <div className="flex items-center gap-1.5 mt-1 text-xs text-indigo-600 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    {t('tenants.verifiedResidents', {
                      verified: platformOverview.verifiedResidentsCount,
                    })}
                  </span>
                </div>
              </div>
            </div>

            {/* Active SOS Alerts */}
            <div
              className={`p-4.5 rounded-2xl border shadow-sm transition-all ${
                platformOverview.activeSosAlertsCount > 0
                  ? 'bg-red-50/90 border-red-200 shadow-red-500/10'
                  : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-semibold uppercase tracking-wider ${
                    platformOverview.activeSosAlertsCount > 0
                      ? 'text-red-700'
                      : 'text-slate-500'
                  }`}
                >
                  {t('tenants.activeSosAlerts')}
                </span>
                <div
                  className={`p-2 rounded-xl ${
                    platformOverview.activeSosAlertsCount > 0
                      ? 'bg-red-100 text-red-600 animate-pulse'
                      : 'bg-slate-50 text-slate-400'
                  }`}
                >
                  <AlertTriangle className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <div
                  className={`text-2xl font-bold ${
                    platformOverview.activeSosAlertsCount > 0
                      ? 'text-red-700'
                      : 'text-slate-900'
                  }`}
                >
                  {platformOverview.activeSosAlertsCount}
                </div>
                <div
                  className={`flex items-center gap-1.5 mt-1 text-xs font-medium ${
                    platformOverview.activeSosAlertsCount > 0
                      ? 'text-red-600'
                      : 'text-emerald-600'
                  }`}
                >
                  {platformOverview.activeSosAlertsCount > 0 ? (
                    <>
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{t('tenants.attentionNeeded')}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{t('tenants.allServicesNormal')}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Open Service Requests */}
            <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {t('tenants.openRequests')}
                </span>
                <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                  <Wrench className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-slate-900">
                  {platformOverview.openServiceRequestsCount}
                </div>
                <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500 font-medium">
                  <span>{t('tenants.openRequestsSub')}</span>
                </div>
              </div>
            </div>

            {/* Total Outstanding Debt */}
            <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {t('tenants.totalOutstandingDebt')}
                </span>
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                  <CreditCard className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-slate-900">
                  {platformOverview.totalOutstandingDebt.toLocaleString('ru-RU')} ₸
                </div>
                <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500 font-medium">
                  <span>{t('tenants.debtorsBalance')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('tenants.searchPlaceholder')}
          className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-900 placeholder-slate-400 shadow-sm"
        />
      </div>

      {/* Tenants List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-slate-200">
          <Loader2 className="w-8 h-8 animate-spin text-sky-600 mb-2" />
          <p className="text-sm text-slate-500">{t('common.loading')}</p>
        </div>
      ) : filteredTenants.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-6">
          <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-900 mb-1">
            {t('tenants.emptyList')}
          </h3>
          <p className="text-sm text-slate-500 mb-4 max-w-md mx-auto">
            {searchQuery ? t('common.search') : t('tenants.subtitle')}
          </p>
          {!searchQuery && (
            <button
              onClick={() => setIsCreateTenantOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-xl text-sm font-medium hover:bg-sky-700"
            >
              <Plus className="w-4 h-4" />
              <span>{t('tenants.createTenant')}</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredTenants.map((tItem) => {
            const blocksCount = tItem.buildings?.length || 0;
            const unitsCount =
              tItem.buildings?.reduce(
                (sum, b) => sum + (b._count?.units || 0),
                0,
              ) || tItem.totalUnitsCount || 0;
            const tenantOverview = overviewMap.get(tItem.id);

            return (
              <div
                key={tItem.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div className="flex items-center gap-2">
                      {tenantOverview && tenantOverview.activeSosAlertsCount > 0 && (
                        <span className="text-xs px-2.5 py-1 rounded-full bg-red-100 border border-red-200 text-red-700 font-bold flex items-center gap-1 animate-pulse">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {t('tenants.activeSosBadge', {
                              count: tenantOverview.activeSosAlertsCount,
                            })}
                          </span>
                        </span>
                      )}
                      <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-medium">
                        {tItem.city || 'Астана'}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 mb-1">
                    {tItem.name}
                  </h3>
                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                    {tItem.address}
                  </p>

                  <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 text-xs text-slate-600 mb-2">
                    <div>
                      <span className="text-slate-400 block">{t('tenants.buildingsCount')}</span>
                      <span className="font-semibold text-slate-800">{blocksCount}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">{t('tenants.unitsCount')}</span>
                      <span className="font-semibold text-slate-800">{unitsCount}</span>
                    </div>
                  </div>

                  {tenantOverview && (
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs text-slate-600 mb-4">
                      <div>
                        <span className="text-slate-400 block">{t('tenants.residentsCount')}</span>
                        <span className="font-semibold text-slate-800">
                          {tenantOverview.verifiedResidentsCount} / {tenantOverview.totalResidentsCount}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">{t('tenants.openRequestsCount')}</span>
                        <span className="font-semibold text-slate-800">
                          {tenantOverview.openServiceRequestsCount}
                        </span>
                      </div>
                      <div className="col-span-2 pt-1">
                        <span className="text-slate-400 block">{t('tenants.outstandingDebt')}</span>
                        <span
                          className={`font-semibold ${
                            tenantOverview.outstandingDebt > 0 ? 'text-amber-700 font-bold' : 'text-slate-800'
                          }`}
                        >
                          {tenantOverview.outstandingDebt.toLocaleString('ru-RU')} ₸
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    {new Date(tItem.createdAt).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenStaffList(tItem)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>{t('tenants.viewStaff')}</span>
                    </button>
                    <button
                      onClick={() => handleOpenAddStaff(tItem)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sky-600 hover:text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg transition-colors"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>{t('tenants.addStaff')}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create Tenant */}
      {isCreateTenantOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-lg">
                <Building2 className="w-5 h-5 text-sky-600" />
                <h3>{t('tenants.createTenantModalTitle')}</h3>
              </div>
              <button
                onClick={() => setIsCreateTenantOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTenant} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('tenants.tenantNameLabel')} *
                </label>
                <input
                  type="text"
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  placeholder={t('tenants.tenantNamePlaceholder')}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('tenants.tenantAddressLabel')} *
                </label>
                <input
                  type="text"
                  value={tenantAddress}
                  onChange={(e) => setTenantAddress(e.target.value)}
                  placeholder={t('tenants.tenantAddressPlaceholder')}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('tenants.tenantCityLabel')}
                </label>
                <input
                  type="text"
                  value={tenantCity}
                  onChange={(e) => setTenantCity(e.target.value)}
                  placeholder={t('tenants.tenantCityPlaceholder')}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateTenantOpen(false)}
                  className="px-4 py-2.5 text-slate-600 hover:text-slate-800 text-sm font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isCreatingTenant}
                  className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60"
                >
                  {isCreatingTenant && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{t('tenants.createTenant')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Staff */}
      {isAddStaffOpen && selectedTenant && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-lg">
                <UserPlus className="w-5 h-5 text-sky-600" />
                <h3>{t('tenants.addStaffModalTitle')}</h3>
              </div>
              <button
                onClick={() => setIsAddStaffOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <span className="text-slate-500 block mb-0.5">{t('tenants.staffTargetTenant')}</span>
                <span className="font-semibold text-slate-900 text-sm">{selectedTenant.name}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('tenants.firstNameLabel')} *
                  </label>
                  <input
                    type="text"
                    value={staffFirstName}
                    onChange={(e) => setStaffFirstName(e.target.value)}
                    placeholder={t('tenants.firstNamePlaceholder')}
                    required
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('tenants.lastNameLabel')} *
                  </label>
                  <input
                    type="text"
                    value={staffLastName}
                    onChange={(e) => setStaffLastName(e.target.value)}
                    placeholder={t('tenants.lastNamePlaceholder')}
                    required
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('tenants.phoneLabel')} *
                </label>
                <input
                  type="text"
                  value={staffPhone}
                  onChange={(e) => setStaffPhone(e.target.value)}
                  placeholder={t('tenants.phonePlaceholder')}
                  required
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('tenants.emailLabel')}
                </label>
                <input
                  type="email"
                  value={staffEmail}
                  onChange={(e) => setStaffEmail(e.target.value)}
                  placeholder={t('tenants.emailPlaceholder')}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('tenants.roleLabel')} *
                </label>
                <select
                  value={staffRole}
                  onChange={(e) => setStaffRole(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white"
                >
                  <option value="HOA_ADMIN">{t('tenants.roleHoaAdmin')}</option>
                  <option value="HOA_CHAIRMAN">{t('tenants.roleHoaChairman')}</option>
                  <option value="DISPATCHER">{t('tenants.roleDispatcher')}</option>
                  <option value="SECURITY">{t('tenants.roleSecurity')}</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddStaffOpen(false)}
                  className="px-4 py-2.5 text-slate-600 hover:text-slate-800 text-sm font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isCreatingStaff}
                  className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60"
                >
                  {isCreatingStaff && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{t('tenants.addStaff')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* One-Time Temporary Password Display Modal */}
      {tempPasswordResult && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center mb-5">
              <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-3">
                <KeyRound className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-1">
                {t('tenants.tempPasswordModalTitle')}
              </h3>
              <p className="text-xs text-slate-500">
                {tempPasswordResult.tenantName} • {tempPasswordResult.userName} ({tempPasswordResult.phone})
              </p>
            </div>

            {/* Warning Box */}
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs mb-5 flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold text-amber-950">
                  {t('tenants.tempPasswordWarningTitle')}
                </div>
                <div className="text-amber-800 leading-relaxed">
                  {t('tenants.tempPasswordWarningText')}
                </div>
              </div>
            </div>

            {/* Password Display Box */}
            <div className="bg-slate-900 rounded-xl p-4 mb-5 text-center">
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2">
                {t('tenants.tempPasswordLabel')}
              </div>
              <div className="font-mono text-2xl font-bold text-sky-400 tracking-wider select-all py-1">
                {tempPasswordResult.tempPassword}
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={handleCopyPassword}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-sm font-semibold transition-colors"
              >
                {isCopied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-700">{t('tenants.passwordCopied')}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-slate-600" />
                    <span>{t('tenants.copyPassword')}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setTempPasswordResult(null)}
                className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
              >
                {t('tenants.closeAndConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Staff List */}
      {isStaffListOpen && staffListTenant && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-xl border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-lg">
                <Users className="w-5 h-5 text-sky-600" />
                <h3>
                  {t('tenants.staffListTitle')} — {staffListTenant.name}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenAddStaff(staffListTenant)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors shadow-sm"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{t('tenants.addStaff')}</span>
                </button>
                <button
                  onClick={() => {
                    setIsStaffListOpen(false);
                    setStaffListTenant(null);
                  }}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 pr-1">
              {loadingStaffList ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500">
                  <Loader2 className="w-7 h-7 animate-spin text-sky-600" />
                  <span className="text-sm">{t('common.loading')}</span>
                </div>
              ) : staffList.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm">
                  <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="font-medium text-slate-700">{t('tenants.noStaffFound')}</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {staffList.map((staff) => (
                    <div
                      key={staff.id}
                      className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 px-2 rounded-xl transition"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-slate-900">
                            {staff.firstName} {staff.lastName}
                          </span>
                          <span className="text-[11px] px-2 py-0.5 rounded-md font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            {staff.role}
                          </span>
                          <span
                            className={`text-[11px] px-2 py-0.5 rounded-md font-semibold ${
                              staff.isActive
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {staff.isActive
                              ? t('tenants.activeStatus')
                              : t('tenants.inactiveStatus')}
                          </span>
                          {staff.mustChangePassword && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                              {t('tenants.mustChangePasswordBadge')}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-3">
                          <span>{staff.phone}</span>
                          {staff.email && <span>• {staff.email}</span>}
                          <span>• {new Date(staff.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          onClick={() => handleOpenEditStaff(staff)}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>{t('tenants.editStaff')}</span>
                        </button>
                        <button
                          onClick={() => handleToggleStaffStatus(staff)}
                          disabled={isTogglingStatus}
                          className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition border ${
                            staff.isActive
                              ? 'text-rose-700 bg-rose-50 hover:bg-rose-100 border-rose-200'
                              : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
                          }`}
                        >
                          {staff.isActive ? (
                            <>
                              <UserX className="w-3 h-3" />
                              <span>{t('tenants.deactivate')}</span>
                            </>
                          ) : (
                            <>
                              <UserCheck className="w-3 h-3" />
                              <span>{t('tenants.activate')}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Staff */}
      {editingStaff && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
                <Pencil className="w-4 h-4 text-sky-600" />
                <h3>{t('tenants.editStaffModalTitle')}</h3>
              </div>
              <button
                onClick={() => setEditingStaff(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditStaff} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('tenants.firstNameLabel')} *
                  </label>
                  <input
                    type="text"
                    value={editFirstName}
                    onChange={(e) => setEditFirstName(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('tenants.lastNameLabel')} *
                  </label>
                  <input
                    type="text"
                    value={editLastName}
                    onChange={(e) => setEditLastName(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('tenants.emailLabel')}
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="staff@shanyraq.kz"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingStaff(null)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-semibold transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingStaff}
                  className="flex items-center gap-1.5 px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 transition"
                >
                  {isUpdatingStaff && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{t('common.save')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Deactivate Staff Confirmation */}
      {deactivatingStaff && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center gap-3 text-amber-600 mb-3">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-slate-900">
                {t('tenants.deactivateStaffTitle')}
              </h3>
            </div>
            <p className="text-sm text-slate-600 mb-5 leading-relaxed">
              {t('tenants.deactivateStaffPrompt', {
                name: `${deactivatingStaff.firstName} ${deactivatingStaff.lastName}`,
              })}
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeactivatingStaff(null)}
                disabled={isTogglingStatus}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-semibold transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmDeactivateStaff}
                disabled={isTogglingStatus}
                className="flex items-center gap-1.5 px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 transition"
              >
                {isTogglingStatus && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{t('tenants.confirmDeactivate')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
