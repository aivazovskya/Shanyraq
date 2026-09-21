'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Download,
  RefreshCw,
  Search,
  Calendar,
  Ticket,
  Car,
  User,
  Building,
  Clock,
  AlertCircle,
  X,
  Shield,
  CheckCircle2,
} from 'lucide-react';
import { apiRequest, apiDownload, getStoredSession, AuthUser } from '@/lib/api';

const GUEST_PASS_ROLES = [
  'HOA_ADMIN',
  'HOA_CHAIRMAN',
  'DISPATCHER',
  'SECURITY',
  'SUPERADMIN',
];

export interface GuestPassItem {
  id: string;
  tenantId?: string;
  guestName: string;
  guestPlateNumber: string | null;
  accessCode: string;
  validFrom: string;
  validTo: string;
  isUsed: boolean;
  usedAt?: string | null;
  isRevoked: boolean;
  revokedAt: string | null;
  createdAt: string;
  status: 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED';
  creator?: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  } | null;
  revokedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  } | null;
  unit?: {
    id: string;
    unitNumber: string;
    building?: {
      id: string;
      blockName: string;
    } | null;
  } | null;
}

export default function GuestPassesHistoryPage() {
  const { t, i18n } = useTranslation();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [tenantId, setTenantId] = useState<string>('');

  const [passes, setPasses] = useState<GuestPassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED'>('ALL');

  // Export State
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Redemption State
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [redeemSuccessMsg, setRedeemSuccessMsg] = useState<string | null>(null);
  const [redeemErrorMsg, setRedeemErrorMsg] = useState<string | null>(null);

  const isAuthorized = currentUser && GUEST_PASS_ROLES.includes(currentUser.role);

  const loadPasses = useCallback(async (tId: string) => {
    if (!tId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<GuestPassItem[]>(`/access/tenant/${tId}/guest-passes`);
      setPasses(data || []);
    } catch (err: any) {
      setError(err.message || t('access.guestPassHistory.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const session = getStoredSession();
    if (session?.user) {
      setCurrentUser(session.user);
      if (session.user.tenantId) {
        setTenantId(session.user.tenantId);
        loadPasses(session.user.tenantId);
      } else {
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, [loadPasses]);

  const handleExportCsv = async () => {
    if (!tenantId) return;
    setExportingCsv(true);
    setExportError(null);
    try {
      const queryParams = new URLSearchParams();
      if (dateFrom) queryParams.set('from', dateFrom);
      if (dateTo) queryParams.set('to', dateTo);
      const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
      await apiDownload(
        `/access/tenant/${tenantId}/guest-passes/export${queryString}`,
        `guest-passes-${tenantId}.csv`,
      );
    } catch (err: any) {
      setExportError(err.message || t('access.guestPassHistory.exportError'));
      setTimeout(() => setExportError(null), 5000);
    } finally {
      setExportingCsv(false);
    }
  };

  const handleRedeemPass = async (pass: GuestPassItem) => {
    if (!window.confirm(t('access.guestPassHistory.redeemConfirm', { name: pass.guestName }))) {
      return;
    }
    setRedeemingId(pass.id);
    setRedeemErrorMsg(null);
    try {
      await apiRequest<GuestPassItem>(`/access/guest-passes/${pass.id}/redeem`, {
        method: 'PATCH',
      });
      setRedeemSuccessMsg(t('access.guestPassHistory.redeemSuccess'));
      setTimeout(() => setRedeemSuccessMsg(null), 4000);
      if (tenantId) {
        await loadPasses(tenantId);
      }
    } catch (err: any) {
      setRedeemErrorMsg(err.message || t('access.guestPassHistory.redeemError'));
      setTimeout(() => setRedeemErrorMsg(null), 5000);
    } finally {
      setRedeemingId(null);
    }
  };

  const filteredPasses = useMemo(() => {
    return passes.filter((pass) => {
      // Date filter by pass.createdAt
      const passDate = new Date(pass.createdAt);
      if (dateFrom) {
        const fromD = new Date(dateFrom);
        fromD.setHours(0, 0, 0, 0);
        if (passDate < fromD) return false;
      }
      if (dateTo) {
        const toD = new Date(dateTo);
        toD.setHours(23, 59, 59, 999);
        if (passDate > toD) return false;
      }

      // Status pill filter
      if (statusFilter !== 'ALL' && pass.status !== statusFilter) {
        return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = pass.guestName?.toLowerCase().includes(q);
        const matchPlate = pass.guestPlateNumber?.toLowerCase().includes(q);
        const matchCode = pass.accessCode?.toLowerCase().includes(q);
        const matchUnit = pass.unit?.unitNumber?.toLowerCase().includes(q);
        const matchBlock = pass.unit?.building?.blockName?.toLowerCase().includes(q);
        const creatorFullName = pass.creator
          ? `${pass.creator.firstName || ''} ${pass.creator.lastName || ''}`.trim().toLowerCase()
          : '';
        const matchCreator = creatorFullName.includes(q);
        if (!matchName && !matchPlate && !matchCode && !matchUnit && !matchBlock && !matchCreator) {
          return false;
        }
      }

      return true;
    });
  }, [passes, dateFrom, dateTo, statusFilter, searchQuery]);

  const getStatusBadge = (status: GuestPassItem['status']) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            {t('access.guestPassHistory.statusActive')}
          </span>
        );
      case 'USED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 border border-sky-200">
            {t('access.guestPassHistory.statusUsed')}
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            {t('access.guestPassHistory.statusExpired')}
          </span>
        );
      case 'REVOKED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
            {t('access.guestPassHistory.statusRevoked')}
          </span>
        );
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString(i18n.language === 'en' ? 'en-US' : 'ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getRoleLabel = (role?: string) => {
    if (!role) return '';
    switch (role) {
      case 'SUPERADMIN':
        return t('roles.superadmin');
      case 'HOA_ADMIN':
        return t('roles.management_company');
      case 'HOA_CHAIRMAN':
        return t('roles.hoa_chairman');
      case 'DISPATCHER':
        return t('roles.dispatcher');
      case 'SECURITY':
        return t('roles.security');
      case 'RESIDENT':
        return t('roles.resident');
      default:
        return role;
    }
  };

  if (!loading && currentUser && !isAuthorized) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">
          {t('access.guestPassHistory.unauthorized')}
        </h2>
        <Link
          href="/dashboard/access"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('access.guestPassHistory.backToAccess')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb / Nav */}
      <div>
        <Link
          href="/dashboard/access"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800 transition mb-2"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('access.guestPassHistory.backToAccess')}
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
              <Ticket className="w-6 h-6 text-slate-700" />
              {t('access.guestPassHistory.title')}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {t('access.guestPassHistory.subtitle')}
            </p>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            <button
              onClick={() => tenantId && loadPasses(tenantId)}
              disabled={loading}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium flex items-center gap-2 transition shadow-sm disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-slate-400' : ''}`} />
              {t('access.refreshBtn')}
            </button>

            <button
              onClick={handleExportCsv}
              disabled={exportingCsv || !tenantId}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold flex items-center gap-2 shadow-sm transition active:scale-95 disabled:opacity-60"
            >
              {exportingCsv ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{t('access.guestPassHistory.exportingCsv')}</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>{t('access.guestPassHistory.exportCsvBtn')}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Export Error Alert */}
      {exportError && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{exportError}</span>
          </div>
          <button onClick={() => setExportError(null)} className="text-rose-400 hover:text-rose-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Load Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => tenantId && loadPasses(tenantId)}
            className="px-3 py-1 bg-rose-600 text-white text-xs font-semibold rounded-lg hover:bg-rose-700 transition"
          >
            {t('common.refresh')}
          </button>
        </div>
      )}

      {/* Redemption Alerts */}
      {redeemSuccessMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{redeemSuccessMsg}</span>
          </div>
          <button onClick={() => setRedeemSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {redeemErrorMsg && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{redeemErrorMsg}</span>
          </div>
          <button onClick={() => setRedeemErrorMsg(null)} className="text-rose-400 hover:text-rose-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Date range filters */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
            <span>{t('access.guestPassHistory.dateFrom')}</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-transparent text-slate-800 text-xs font-medium focus:outline-none"
            />
            <span>{t('access.guestPassHistory.dateTo')}</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-transparent text-slate-800 text-xs font-medium focus:outline-none"
            />
          </div>

          {/* Search box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('access.guestPassHistory.searchPlaceholder')}
              className="w-full pl-9 pr-8 py-2 border border-slate-200 rounded-xl text-xs bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
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
        </div>

        {/* Status Pill Filters */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
          {(['ALL', 'ACTIVE', 'USED', 'EXPIRED', 'REVOKED'] as const).map((st) => {
            const isActive = statusFilter === st;
            const label =
              st === 'ALL'
                ? t('access.guestPassHistory.statusAll')
                : st === 'ACTIVE'
                ? t('access.guestPassHistory.statusActive')
                : st === 'USED'
                ? t('access.guestPassHistory.statusUsed')
                : st === 'EXPIRED'
                ? t('access.guestPassHistory.statusExpired')
                : t('access.guestPassHistory.statusRevoked');

            const count = passes.filter((p) => {
              if (st === 'ALL') return true;
              return p.status === st;
            }).length;

            return (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Passes Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">{t('access.guestPassHistory.thGuest')}</th>
                <th className="py-3 px-4">{t('access.guestPassHistory.thPlate')}</th>
                <th className="py-3 px-4">{t('access.guestPassHistory.thCode')}</th>
                <th className="py-3 px-4">{t('access.guestPassHistory.thUnit')}</th>
                <th className="py-3 px-4">{t('access.guestPassHistory.thValid')}</th>
                <th className="py-3 px-4">{t('access.guestPassHistory.thStatus')}</th>
                <th className="py-3 px-4">{t('access.guestPassHistory.thCreator')}</th>
                <th className="py-3 px-4">{t('access.guestPassHistory.thRevoked')}</th>
                <th className="py-3 px-4 text-right">{t('access.guestPassHistory.thCreatedAt')}</th>
                <th className="py-3 px-4 text-right">{t('access.guestPassHistory.thActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading && passes.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-slate-500" />
                      <span>{t('access.guestPassHistory.loading')}</span>
                    </div>
                  </td>
                </tr>
              ) : filteredPasses.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Ticket className="w-8 h-8 text-slate-300" />
                      <div className="font-semibold text-slate-700">
                        {t('access.guestPassHistory.emptyList')}
                      </div>
                      <div className="text-xs text-slate-400 max-w-sm">
                        {t('access.guestPassHistory.emptyListDesc')}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredPasses.map((pass) => {
                  const unitLabel = pass.unit
                    ? `${pass.unit.building?.blockName ? `${pass.unit.building.blockName}, ` : ''}${t('common.unitShort')} ${pass.unit.unitNumber}`
                    : '—';

                  const creatorName = pass.creator
                    ? `${pass.creator.firstName || ''} ${pass.creator.lastName || ''}`.trim() || pass.creator.role
                    : '—';

                  const creatorRoleLabel = pass.creator?.role ? getRoleLabel(pass.creator.role) : '';

                  const revokedByName = pass.revokedBy
                    ? `${pass.revokedBy.firstName || ''} ${pass.revokedBy.lastName || ''}`.trim() || pass.revokedBy.role
                    : null;

                  return (
                    <tr key={pass.id} className="hover:bg-slate-50/80 transition">
                      {/* Guest name */}
                      <td className="py-3.5 px-4 font-semibold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-xs shrink-0">
                            {pass.guestName ? pass.guestName.charAt(0).toUpperCase() : 'G'}
                          </div>
                          <span>{pass.guestName}</span>
                        </div>
                      </td>

                      {/* Plate number */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {pass.guestPlateNumber ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-100 font-mono font-semibold text-slate-800 text-[11px]">
                            <Car className="w-3 h-3 text-slate-500" />
                            {pass.guestPlateNumber}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">
                            {t('access.guestPassHistory.noPlate')}
                          </span>
                        )}
                      </td>

                      {/* Access code */}
                      <td className="py-3.5 px-4 whitespace-nowrap font-mono font-bold text-slate-900 tracking-wider">
                        {pass.accessCode}
                      </td>

                      {/* Unit & Block */}
                      <td className="py-3.5 px-4 whitespace-nowrap font-medium text-slate-700">
                        {unitLabel}
                      </td>

                      {/* Valid period */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-600">
                        <div className="text-[11px]">
                          <div>{formatDate(pass.validFrom)}</div>
                          <div className="text-slate-400">→ {formatDate(pass.validTo)}</div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {getStatusBadge(pass.status)}
                      </td>

                      {/* Creator */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-medium text-slate-900">{creatorName}</div>
                        {creatorRoleLabel && (
                          <div className="text-[11px] text-slate-400">{creatorRoleLabel}</div>
                        )}
                      </td>

                      {/* Revoked info */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {pass.isRevoked ? (
                          <div className="text-[11px] text-rose-700">
                            <div className="font-semibold">{revokedByName || 'Staff'}</div>
                            {pass.revokedAt && (
                              <div className="text-rose-500">{formatDate(pass.revokedAt)}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Created at */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono text-slate-500 text-[11px]">
                        {formatDate(pass.createdAt)}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {pass.status === 'ACTIVE' && (
                          <button
                            onClick={() => handleRedeemPass(pass)}
                            disabled={redeemingId === pass.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-sm transition disabled:opacity-50"
                          >
                            <CheckCircle2 className={`w-3.5 h-3.5 ${redeemingId === pass.id ? 'animate-spin' : ''}`} />
                            <span>{redeemingId === pass.id ? t('access.guestPassHistory.redeeming') : t('access.guestPassHistory.redeemBtn')}</span>
                          </button>
                        )}
                        {pass.status === 'USED' && pass.usedAt && (
                          <span className="text-[11px] text-slate-400 font-mono">
                            {formatDate(pass.usedAt)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
