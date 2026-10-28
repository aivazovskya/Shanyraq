'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  Users,
  UserPlus,
  Phone,
  Calendar,
  Clock,
  ShieldCheck,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  ArrowLeft,
  RefreshCw,
  Home,
  UserCheck,
  Edit3,
} from 'lucide-react';
import {
  CabinetApi,
  ResidentProfile,
  UnitResidentItem,
  UnitInvitationItem,
} from '@/lib/cabinet-api';
import { getRoleLabel, getInvitationStatusLabel } from '@/lib/cabinet-labels';

export default function CabinetResidentsPage() {
  const { t, i18n } = useTranslation();

  const [profile, setProfile] = useState<ResidentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');

  const [residents, setResidents] = useState<UnitResidentItem[]>([]);
  const [invitations, setInvitations] = useState<UnitInvitationItem[]>([]);
  const [unitInfo, setUnitInfo] = useState<any>(null);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [maxAllowed, setMaxAllowed] = useState<number>(5);
  const [loadingResidents, setLoadingResidents] = useState(false);

  // Invite Modal State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteType, setInviteType] = useState<'TENANT' | 'FAMILY_MEMBER'>('TENANT');
  const [inviteLeaseEnd, setInviteLeaseEnd] = useState('');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Extend Lease Modal State
  const [editingResident, setEditingResident] = useState<UnitResidentItem | null>(null);
  const [newLeaseEndDate, setNewLeaseEndDate] = useState('');
  const [leaseSubmitting, setLeaseSubmitting] = useState(false);
  const [leaseError, setLeaseError] = useState<string | null>(null);

  // Revoke Confirm Modal State
  const [revokingResident, setRevokingResident] = useState<UnitResidentItem | null>(null);
  const [revokeSubmitting, setRevokeSubmitting] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  // Global action alert
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const isOwner =
    profile?.role === 'RESIDENT_OWNER' ||
    profile?.ownerships?.some((o) => o.ownershipType === 'OWNER' && o.isVerified);

  const ownedUnits =
    profile?.ownerships?.filter((o) => o.ownershipType === 'OWNER' && o.isVerified) || [];

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const me = await CabinetApi.getMe();
      setProfile(me);
      const verifiedOwnerUnit = me.ownerships?.find(
        (o) => o.ownershipType === 'OWNER' && o.isVerified,
      );
      if (verifiedOwnerUnit) {
        setSelectedUnitId(verifiedOwnerUnit.unitId);
      }
    } catch (e) {
      console.warn('Failed to load profile:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const loadResidents = useCallback(async (unitId: string) => {
    if (!unitId) return;
    setLoadingResidents(true);
    try {
      const res = await CabinetApi.getUnitResidents(unitId);
      setResidents(res.residents || []);
      setInvitations(res.invitations || []);
      setUnitInfo(res.unit || null);
      setTotalCount(res.totalCount ?? 0);
      setMaxAllowed(res.maxAllowed ?? 5);
    } catch (e: any) {
      console.warn('Failed to load residents:', e);
      setActionMessage({
        type: 'error',
        text: e.message || t('cabinet.residentsLoadError', 'Не удалось загрузить жильцов'),
      });
    } finally {
      setLoadingResidents(false);
    }
  }, [t]);

  useEffect(() => {
    if (selectedUnitId) {
      loadResidents(selectedUnitId);
    }
  }, [selectedUnitId, loadResidents]);

  const tomorrowDateString = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const handlePhoneChange = (val: string) => {
    let raw = val.trim();
    if (raw && !raw.startsWith('+')) {
      if (raw.startsWith('7') || raw.startsWith('8')) {
        raw = '+7' + raw.slice(1);
      } else {
        raw = '+7' + raw;
      }
    }
    setInvitePhone(raw);
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUnitId) return;

    const trimmedPhone = invitePhone.trim();
    const digitsOnly = trimmedPhone.replace(/\D/g, '');
    let normalizedPhone = trimmedPhone;
    if (digitsOnly.length === 11 && (digitsOnly.startsWith('7') || digitsOnly.startsWith('8'))) {
      normalizedPhone = '+7' + digitsOnly.slice(1);
    } else if (digitsOnly.length === 10) {
      normalizedPhone = '+7' + digitsOnly;
    } else {
      setInviteError(t('cabinet.invalidPhoneFormat', 'Укажите корректный номер телефона (+7...)'));
      return;
    }

    if (profile?.phone && normalizedPhone === profile.phone) {
      setInviteError(t('cabinet.cannotInviteSelf', 'Собственник не может пригласить самого себя'));
      return;
    }

    if (residents.some((r) => r.phone === normalizedPhone || r.user.phone === normalizedPhone)) {
      setInviteError(
        t('cabinet.phoneAlreadyResident', 'Пользователь с этим номером телефона уже является жильцом квартиры'),
      );
      return;
    }

    if (invitations.some((i) => i.phone === normalizedPhone && i.status === 'PENDING')) {
      setInviteError(
        t('cabinet.invitationAlreadyPending', 'Приглашение для этого номера уже ожидает входа'),
      );
      return;
    }

    if (inviteLeaseEnd) {
      const selectedDate = new Date(inviteLeaseEnd);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate <= today) {
        setInviteError(t('cabinet.leaseDatePastError', 'Дата окончания аренды должна быть в будущем'));
        return;
      }
    }

    setInviteSubmitting(true);
    setInviteError(null);
    try {
      await CabinetApi.inviteResident(selectedUnitId, {
        phone: normalizedPhone,
        fullName: inviteName.trim() || undefined,
        ownershipType: inviteType,
        leaseEndDate: inviteLeaseEnd ? new Date(inviteLeaseEnd).toISOString() : undefined,
      });

      setShowInviteModal(false);
      setInvitePhone('');
      setInviteName('');
      setInviteType('TENANT');
      setInviteLeaseEnd('');
      setActionMessage({
        type: 'success',
        text: t('cabinet.inviteSentSuccess', 'Приглашение успешно отправлено!'),
      });
      loadResidents(selectedUnitId);
    } catch (err: any) {
      setInviteError(err.message || t('cabinet.inviteFailed', 'Ошибка при отправке приглашения'));
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleRevokeResident = async () => {
    if (!selectedUnitId || !revokingResident) return;
    setRevokeSubmitting(true);
    setRevokeError(null);
    try {
      await CabinetApi.revokeResident(selectedUnitId, revokingResident.id);
      setRevokingResident(null);
      setActionMessage({
        type: 'success',
        text: t('cabinet.residentRevokedSuccess', 'Доступ жильца успешно отозван'),
      });
      loadResidents(selectedUnitId);
    } catch (err: any) {
      setRevokeError(err.message || t('cabinet.revokeFailed', 'Ошибка при отзыве доступа'));
    } finally {
      setRevokeSubmitting(false);
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    if (!selectedUnitId) return;
    try {
      await CabinetApi.revokeInvitation(selectedUnitId, invitationId);
      setActionMessage({
        type: 'success',
        text: t('cabinet.invitationRevokedSuccess', 'Приглашение отозвано'),
      });
      loadResidents(selectedUnitId);
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || t('cabinet.revokeFailed', 'Ошибка при отзыве приглашения'),
      });
    }
  };

  const handleUpdateLease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUnitId || !editingResident) return;
    setLeaseSubmitting(true);
    setLeaseError(null);
    try {
      await CabinetApi.extendLease(selectedUnitId, editingResident.id, {
        leaseEndDate: newLeaseEndDate ? new Date(newLeaseEndDate).toISOString() : null,
      });
      setEditingResident(null);
      setActionMessage({
        type: 'success',
        text: t('cabinet.leaseUpdatedSuccess', 'Срок аренды успешно обновлен'),
      });
      loadResidents(selectedUnitId);
    } catch (err: any) {
      setLeaseError(err.message || t('cabinet.leaseUpdateFailed', 'Ошибка при обновлении срока'));
    } finally {
      setLeaseSubmitting(false);
    }
  };

  const currentUnit = ownedUnits.find((o) => o.unitId === selectedUnitId)?.unit;
  const activeUnitNumber = unitInfo?.unitNumber || currentUnit?.unitNumber;
  const activeBlockName = unitInfo?.blockName || currentUnit?.building?.blockName;
  const activeArea = unitInfo?.area || currentUnit?.area;

  if (loading) {
    return (
      <div className="py-20 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          {t('cabinet.residentsOwnerOnlyTitle', 'Доступ ограничено')}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
          {t(
            'cabinet.residentsOwnerOnlySubtitle',
            'Управление жильцами доступно только подтвержденному собственнику помещения.',
          )}
        </p>
        <div className="mt-6">
          <Link
            href="/cabinet"
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t('cabinet.backToCabinet', 'Вернуться в кабинет')}</span>
          </Link>
        </div>
      </div>
    );
  }

  const isLimitReached = totalCount >= maxAllowed;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header & Unit Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/cabinet"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label={t('cabinet.back', 'Назад')}
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-6 h-6 text-emerald-600" />
              <span>{t('navigation.cabinetResidents', 'Жильцы квартиры')}</span>
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 ml-8">
            {t(
              'cabinet.residentsSubtitle',
              'Управление доступом квартирантов и членов семьи к сервисам дома',
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {ownedUnits.length > 1 && (
            <select
              value={selectedUnitId}
              onChange={(e) => setSelectedUnitId(e.target.value)}
              className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            >
              {ownedUnits.map((o) => (
                <option key={o.unitId} value={o.unitId}>
                  {t('cabinet.apartment', {
                    number: o.unit.unitNumber,
                    defaultValue: `Квартира ${o.unit.unitNumber}`,
                  })}{' '}
                  ({o.unit.building?.blockName})
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => loadResidents(selectedUnitId)}
            disabled={loadingResidents}
            className="p-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            title={t('common.refresh', 'Обновить')}
          >
            <RefreshCw className={`w-4 h-4 ${loadingResidents ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => {
              setShowInviteModal(true);
              setInviteError(null);
            }}
            disabled={isLimitReached}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition-all ${
              isLimitReached
                ? 'bg-slate-400 cursor-not-allowed opacity-60'
                : 'bg-emerald-600 hover:bg-emerald-700 active:scale-95'
            }`}
            title={
              isLimitReached
                ? t('cabinet.residentLimitReached', 'Достигнут лимит (максимум 5 жильцов)')
                : undefined
            }
          >
            <UserPlus className="w-4 h-4" />
            <span>{t('cabinet.inviteResidentBtn', 'Пригласить жильца')}</span>
          </button>
        </div>
      </div>

      {/* Global alert */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl flex items-start gap-3 border text-xs ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">{actionMessage.text}</div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-slate-400 hover:text-slate-600 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Apartment info & Limit Badge card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center shrink-0">
            <Home className="w-6 h-6" />
          </div>
          <div>
            <div className="font-bold text-base text-slate-900 dark:text-white">
              {activeUnitNumber
                ? `${t('cabinet.apartment', {
                    number: activeUnitNumber,
                    defaultValue: `Квартира ${activeUnitNumber}`,
                  })} • ${activeBlockName || t('common.block', { defaultValue: 'Блок' })}`
                : t('cabinet.property', 'Помещение')}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {activeArea ? `${activeArea} м² • ` : ''}
              {t('cabinet.maxResidentsPerUnit', 'Лимит до {{max}} жильцов на квартиру', {
                max: maxAllowed,
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-center">
          <div
            className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
              isLimitReached
                ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                : 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
            }`}
          >
            {t('cabinet.residentCounter', 'Занято: {{count}} из {{max}} мест', {
              count: totalCount,
              max: maxAllowed,
            })}
          </div>
        </div>
      </div>

      {/* Section 1: Текущие жильцы */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t('cabinet.verifiedResidentsTitle', 'Текущие жильцы')} ({residents.length})
          </h2>
        </div>

        {loadingResidents ? (
          <div className="p-10 flex justify-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
          </div>
        ) : residents.length === 0 ? (
          <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            <UserCheck className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-xs text-slate-500">{t('cabinet.noResidentsYet', 'Жильцов пока нет')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {residents.map((r) => {
              const isResidentOwner = r.ownershipType === 'OWNER';
              const isExpired = r.isLeaseExpired;

              return (
                <div
                  key={r.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-base flex items-center justify-center shrink-0">
                      {(r.user.firstName || 'Ж').charAt(0).toUpperCase()}
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          {r.user.firstName} {r.user.lastName}
                        </span>

                        {/* Role badge */}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            r.ownershipType === 'OWNER'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                              : r.ownershipType === 'TENANT'
                              ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                              : 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                          }`}
                        >
                          {getRoleLabel(r.ownershipType, t)}
                        </span>

                        {isExpired && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                            {t('cabinet.leaseExpired', 'Срок истек')}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5" />
                          <span>{r.user.phone}</span>
                        </span>

                        {r.leaseEndDate ? (
                          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>
                              {t('cabinet.leaseUntil', 'Срок:')}{' '}
                              {new Date(r.leaseEndDate).toLocaleDateString(
                                i18n.language === 'kk' ? 'kk-KZ' : i18n.language === 'en' ? 'en-US' : 'ru-RU',
                              )}
                            </span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-slate-400">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{t('cabinet.leaseIndefinite', 'Бессрочно')}</span>
                          </span>
                        )}

                        {r.invitedBy && (
                          <span className="text-slate-400">
                            • {t('cabinet.invitedBy', 'Пригласил')}: {r.invitedBy.firstName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions for non-owner */}
                  {!isResidentOwner && (
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingResident(r);
                          setNewLeaseEndDate(
                            r.leaseEndDate ? r.leaseEndDate.substring(0, 10) : '',
                          );
                          setLeaseError(null);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                        <span>{t('cabinet.changeLeaseBtn', 'Срок')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setRevokingResident(r);
                          setRevokeError(null);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/60 text-xs font-semibold transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{t('cabinet.revokeAccessBtn', 'Отозвать')}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 2: Ожидающие приглашения */}
      <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {t('cabinet.pendingInvitationsTitle', 'Ожидающие приглашения')} ({invitations.length})
        </h2>

        {invitations.length === 0 ? (
          <div className="p-6 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
            {t('cabinet.noPendingInvitations', 'Нет активных приглашений')}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 dark:text-white">
                        {inv.phone}
                      </span>
                      {inv.fullName && (
                        <span className="text-xs text-slate-500">({inv.fullName})</span>
                      )}

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          inv.ownershipType === 'TENANT'
                            ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                            : 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                        }`}
                      >
                        {getRoleLabel(inv.ownershipType, t)}
                      </span>

                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        {getInvitationStatusLabel(inv.status, t)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {inv.leaseEndDate ? (
                        <span>
                          {t('cabinet.leaseUntil', 'Срок аренды: до')}{' '}
                          {new Date(inv.leaseEndDate).toLocaleDateString(
                            i18n.language === 'kk' ? 'kk-KZ' : i18n.language === 'en' ? 'en-US' : 'ru-RU',
                          )}
                        </span>
                      ) : (
                        <span>{t('cabinet.leaseIndefinite', 'Срок: бессрочно')}</span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleRevokeInvitation(inv.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 text-xs font-semibold transition-colors self-end sm:self-center"
                >
                  <X className="w-4 h-4" />
                  <span>{t('cabinet.cancelInvitationBtn', 'Отозвать')}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal 1: Пригласить жильца */}
      {showInviteModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl relative">
            <button
              type="button"
              onClick={() => setShowInviteModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label={t('cabinet.close', 'Закрыть')}
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-emerald-600" />
              <span>{t('cabinet.inviteResidentModalTitle', 'Пригласить жильца')}</span>
            </h3>

            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {t(
                'cabinet.inviteResidentModalSub',
                'Жилец получит доступ к приложению при входе по номеру телефона.',
              )}
            </p>

            {inviteError && (
              <div className="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs">
                {inviteError}
              </div>
            )}

            <form onSubmit={handleSendInvite} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {t('cabinet.residentPhoneLabel', 'Номер телефона жильца')} *
                </label>
                <input
                  type="tel"
                  placeholder="+77015550199"
                  value={invitePhone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {t('cabinet.residentNameLabel', 'ФИО жильца (необязательно)')}
                </label>
                <input
                  type="text"
                  placeholder="Иван Иванов"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {t('cabinet.residentRoleLabel', 'Категория жильца')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setInviteType('TENANT')}
                    className={`px-3 py-2 text-xs font-bold rounded-xl border text-center transition-colors ${
                      inviteType === 'TENANT'
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    {t('cabinet.roleTenant', 'Квартирант')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setInviteType('FAMILY_MEMBER')}
                    className={`px-3 py-2 text-xs font-bold rounded-xl border text-center transition-colors ${
                      inviteType === 'FAMILY_MEMBER'
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    {t('cabinet.roleFamily', 'Член семьи')}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {t('cabinet.leaseEndDateLabel', 'Срок аренды / проживания (необязательно)')}
                </label>
                <input
                  type="date"
                  min={tomorrowDateString}
                  value={inviteLeaseEnd}
                  onChange={(e) => setInviteLeaseEnd(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  {t(
                    'cabinet.leaseEndDateHint',
                    'Если дата не указана, доступ предоставляется бессрочно.',
                  )}
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {t('cabinet.cancel', 'Отмена')}
                </button>
                <button
                  type="submit"
                  disabled={inviteSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-60 flex items-center gap-1.5"
                >
                  {inviteSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{t('cabinet.sendInviteBtn', 'Отправить приглашение')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Продлить / Изменить срок аренды */}
      {editingResident && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl relative">
            <button
              type="button"
              onClick={() => setEditingResident(null)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label={t('cabinet.close', 'Закрыть')}
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {t('cabinet.editLeaseModalTitle', 'Изменить срок проживания')}
            </h3>

            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {editingResident.user.firstName} {editingResident.user.lastName} ({editingResident.user.phone})
            </p>

            {leaseError && (
              <div className="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs">
                {leaseError}
              </div>
            )}

            <form onSubmit={handleUpdateLease} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {t('cabinet.newLeaseEndDateLabel', 'Новый срок аренды')}
                </label>
                <input
                  type="date"
                  min={tomorrowDateString}
                  value={newLeaseEndDate}
                  onChange={(e) => setNewLeaseEndDate(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setNewLeaseEndDate('')}
                  className="mt-1 text-[11px] text-emerald-600 hover:underline"
                >
                  {t('cabinet.makeIndefinite', 'Сделать бессрочным')}
                </button>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingResident(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50"
                >
                  {t('cabinet.cancel', 'Отмена')}
                </button>
                <button
                  type="submit"
                  disabled={leaseSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-60 flex items-center gap-1.5"
                >
                  {leaseSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{t('common.save', 'Сохранить')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Подтверждение отзыва доступа */}
      {revokingResident && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl relative">
            <button
              type="button"
              onClick={() => setRevokingResident(null)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label={t('cabinet.close', 'Закрыть')}
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-600 flex items-center justify-center mb-3">
              <Trash2 className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {t('cabinet.revokeAccessModalTitle', 'Отозвать доступ жильца?')}
            </h3>

            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              {t(
                'cabinet.revokeAccessConfirmDesc',
                'Вы уверены, что хотите отозвать доступ жильца {{name}}? Все активные гостевые пропуска будут аннулированы, а сессия пользователя завершена.',
                {
                  name: `${revokingResident.user.firstName} ${revokingResident.user.lastName}`,
                },
              )}
            </p>

            {revokeError && (
              <div className="mt-3 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs">
                {revokeError}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRevokingResident(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50"
              >
                {t('cabinet.cancel', 'Отмена')}
              </button>
              <button
                type="button"
                onClick={handleRevokeResident}
                disabled={revokeSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-sm disabled:opacity-60 flex items-center gap-1.5"
              >
                {revokeSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{t('cabinet.revokeConfirmBtn', 'Отозвать доступ')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
