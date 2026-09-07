'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldCheck,
  Building,
  Home,
  Phone,
  Mail,
  UserX,
  UserCheck,
  Trash2,
  RefreshCw,
  Loader2,
  X,
  Info,
  Calendar,
} from 'lucide-react';
import { apiRequest, getStoredSession } from '@/lib/api';

interface UnitInfo {
  id: string;
  unitNumber: string;
  floor: number;
  entrance: number;
  type: string;
  area: number;
  cadastralNumber: string | null;
  building: {
    id: string;
    blockName: string;
  };
}

interface OwnershipItem {
  id: string;
  ownershipType: 'OWNER' | 'TENANT' | 'FAMILY_MEMBER';
  sharePercent: number;
  isVerified: boolean;
  verificationDoc: string | null;
  verifiedAt: string | null;
  createdAt: string;
  unit: UnitInfo;
}

interface ResidentItem {
  id: string;
  phone: string;
  email: string | null;
  firstName: string;
  lastName: string;
  iin: string | null;
  role: string;
  isActive: boolean;
  isVerified: boolean;
  createdAt: string;
  ownerships: OwnershipItem[];
}

export default function ResidentsPage() {
  const [residents, setResidents] = useState<ResidentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [tenantName, setTenantName] = useState<string>('ЖК');
  const [selectedResident, setSelectedResident] = useState<ResidentItem | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);
  const [processingOwnershipId, setProcessingOwnershipId] = useState<string | null>(null);

  const loadResidents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const session = getStoredSession();
      if (!session || !session.user || !session.user.tenantId) {
        throw new Error('Пользователь не авторизован или не привязан к жилому комплексу');
      }
      if (session.user.tenantName) {
        setTenantName(session.user.tenantName);
      }

      const data = await apiRequest<ResidentItem[]>(
        `/properties/tenants/${session.user.tenantId}/residents`,
      );

      setResidents(data);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки реестра жильцов');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadResidents();
  }, [loadResidents]);

  const openResidentDetail = async (resident: ResidentItem) => {
    try {
      setLoadingDetail(true);
      const session = getStoredSession();
      if (!session?.user?.tenantId) return;

      const detail = await apiRequest<ResidentItem>(
        `/properties/tenants/${session.user.tenantId}/residents/${resident.id}`,
      );
      setSelectedResident(detail);
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Ошибка загрузки детальной карточки жильца',
      });
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleToggleStatus = async (resident: ResidentItem) => {
    const willDeactivate = resident.isActive;
    const confirmPrompt = willDeactivate
      ? `Деактивировать учетную запись жильца «${resident.firstName} ${resident.lastName}»? Жилец потеряет доступ в мобильное приложение.`
      : `Активировать учетную запись жильца «${resident.firstName} ${resident.lastName}»?`;

    if (!confirm(confirmPrompt)) {
      return;
    }

    try {
      setProcessingUserId(resident.id);
      await apiRequest(`/properties/residents/${resident.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !resident.isActive }),
      });

      setActionMessage({
        type: 'success',
        text: willDeactivate
          ? `Учетная запись ${resident.firstName} ${resident.lastName} деактивирована`
          : `Учетная запись ${resident.firstName} ${resident.lastName} активирована`,
      });

      await loadResidents();

      if (selectedResident && selectedResident.id === resident.id) {
        setSelectedResident({ ...selectedResident, isActive: !resident.isActive });
      }
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Ошибка при изменении статуса жильца',
      });
    } finally {
      setProcessingUserId(null);
    }
  };

  const handleUnlinkOwnership = async (ownership: OwnershipItem, resident: ResidentItem) => {
    if (
      !confirm(
        `Вы уверены, что хотите отвязать кв. ${ownership.unit.unitNumber} (${ownership.unit.building.blockName}) от жильца ${resident.firstName} ${resident.lastName}?`,
      )
    ) {
      return;
    }

    try {
      setProcessingOwnershipId(ownership.id);
      await apiRequest(`/properties/ownerships/${ownership.id}`, {
        method: 'DELETE',
      });

      setActionMessage({
        type: 'success',
        text: `Квартира ${ownership.unit.unitNumber} успешно отвязана от жильца`,
      });

      await loadResidents();

      if (selectedResident && selectedResident.id === resident.id) {
        const session = getStoredSession();
        if (session?.user?.tenantId) {
          try {
            const updated = await apiRequest<ResidentItem>(
              `/properties/tenants/${session.user.tenantId}/residents/${resident.id}`,
            );
            setSelectedResident(updated);
          } catch {
            setSelectedResident(null);
          }
        }
      }
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Ошибка при отвязке квартиры',
      });
    } finally {
      setProcessingOwnershipId(null);
    }
  };

  const filteredResidents = residents.filter((r) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    const fullName = `${r.firstName} ${r.lastName}`.toLowerCase();
    const phone = r.phone.toLowerCase();
    const iin = (r.iin || '').toLowerCase();
    const matchesUnit = r.ownerships.some(
      (o) =>
        o.unit.unitNumber.toLowerCase().includes(query) ||
        o.unit.building.blockName.toLowerCase().includes(query),
    );
    return fullName.includes(query) || phone.includes(query) || iin.includes(query) || matchesUnit;
  });

  const activeCount = residents.filter((r) => r.isActive).length;
  const deactivatedCount = residents.filter((r) => !r.isActive).length;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sky-50 text-sky-600 rounded-xl border border-sky-100 shadow-sm">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Реестр жильцов</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                База подтвержденных собственников и арендаторов {tenantName}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadResidents}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-xl border border-slate-200 shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Обновить</span>
          </button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Всего жильцов</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{residents.length}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Активные аккаунты</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{activeCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Заблокированные</p>
            <p className="text-2xl font-bold text-rose-600 mt-1">{deactivatedCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <UserX className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Action Notification Message */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between gap-3 text-sm font-medium transition-all ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border border-emerald-200 shadow-sm'
              : 'bg-rose-50 text-rose-900 border border-rose-200 shadow-sm'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Container Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {/* Filters Toolbar */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Поиск по ФИО, телефону, ИИН или номеру квартиры..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
            />
          </div>
          <div className="text-xs font-semibold text-slate-500">
            Найдено записей: <span className="text-slate-900 font-bold">{filteredResidents.length}</span>
          </div>
        </div>

        {/* Content Table */}
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
            <p className="text-sm font-medium">Загрузка базы жильцов...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-1">Ошибка загрузки</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto mb-4">{error}</p>
            <button
              onClick={loadResidents}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-xl shadow-sm transition-all"
            >
              Попробовать снова
            </button>
          </div>
        ) : filteredResidents.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-1">Жильцы не найдены</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">
              {searchQuery
                ? 'По вашему поисковому запросу ничего не найдено. Проверьте правильность введенных данных.'
                : 'В жилом комплексе пока нет подтвержденных жильцов. Заявки на подтверждение появляются во вкладке «Верификация прав».'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-6">Жилец</th>
                  <th className="py-3.5 px-4">Телефон</th>
                  <th className="py-3.5 px-4">Квартиры в ЖК</th>
                  <th className="py-3.5 px-4">Тип</th>
                  <th className="py-3.5 px-4">Статус аккаунта</th>
                  <th className="py-3.5 px-6 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredResidents.map((resident) => {
                  const isProcessing = processingUserId === resident.id;
                  const primaryType =
                    resident.ownerships[0]?.ownershipType === 'OWNER'
                      ? 'Собственник'
                      : resident.ownerships[0]?.ownershipType === 'TENANT'
                      ? 'Арендатор'
                      : 'Член семьи';

                  return (
                    <tr
                      key={resident.id}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      onClick={() => openResidentDetail(resident)}
                    >
                      {/* Name & ID */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-sm shrink-0">
                            {resident.firstName[0]}
                            {resident.lastName[0]}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 group-hover:text-sky-600 transition-colors">
                              {resident.firstName} {resident.lastName}
                            </div>
                            <div className="text-xs text-slate-400 font-mono">
                              {resident.iin ? `ИИН: ${resident.iin}` : resident.email || 'Без email'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="py-4 px-4 font-mono text-xs text-slate-700">
                        {resident.phone}
                      </td>

                      {/* Units */}
                      <td className="py-4 px-4">
                        <div className="flex flex-wrap gap-1.5 max-w-xs">
                          {resident.ownerships.map((o) => (
                            <span
                              key={o.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200"
                            >
                              <Home className="w-3 h-3 text-sky-600" />
                              Кв. {o.unit.unitNumber}
                              <span className="text-slate-400 font-normal">({o.unit.building.blockName})</span>
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Ownership Type */}
                      <td className="py-4 px-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
                          {primaryType}
                        </span>
                      </td>

                      {/* Account Status */}
                      <td className="py-4 px-4">
                        {resident.isActive ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Активен
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            Заблокирован
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td
                        className="py-4 px-6 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openResidentDetail(resident)}
                            className="px-3 py-1.5 text-xs font-semibold text-sky-600 hover:text-sky-700 hover:bg-sky-50 rounded-lg border border-transparent hover:border-sky-200 transition-all"
                          >
                            Детали
                          </button>

                          <button
                            onClick={() => handleToggleStatus(resident)}
                            disabled={isProcessing}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all disabled:opacity-50 ${
                              resident.isActive
                                ? 'text-rose-600 hover:bg-rose-50 border-rose-200'
                                : 'text-emerald-700 hover:bg-emerald-50 border-emerald-200'
                            }`}
                          >
                            {isProcessing ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" />
                            ) : resident.isActive ? (
                              'Деактивировать'
                            ) : (
                              'Активировать'
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* RESIDENT DETAIL MODAL */}
      {selectedResident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-sky-600 text-white flex items-center justify-center font-bold text-base shadow-sm">
                  {selectedResident.firstName[0]}
                  {selectedResident.lastName[0]}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {selectedResident.firstName} {selectedResident.lastName}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                    <span className="font-mono">{selectedResident.phone}</span>
                    <span>•</span>
                    <span className="text-slate-600">
                      Регистрация {new Date(selectedResident.createdAt).toLocaleDateString('ru-RU')}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedResident(null)}
                className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 border border-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* User Profile Overview */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase">Роль в системе</p>
                  <p className="text-xs font-bold text-slate-800 mt-1">
                    {selectedResident.role === 'RESIDENT_OWNER' ? 'Собственник' : 'Арендатор'}
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase">ИИН</p>
                  <p className="text-xs font-mono font-bold text-slate-800 mt-1">
                    {selectedResident.iin || 'Не указан'}
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase">Email</p>
                  <p className="text-xs font-medium text-slate-800 truncate mt-1">
                    {selectedResident.email || 'Не указан'}
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase">Статус</p>
                  <p
                    className={`text-xs font-bold mt-1 ${
                      selectedResident.isActive ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {selectedResident.isActive ? 'Активен' : 'Заблокирован'}
                  </p>
                </div>
              </div>

              {/* Units & Ownerships Section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Building className="w-4 h-4 text-sky-600" />
                    Привязанные квартиры ({selectedResident.ownerships.length})
                  </h4>
                </div>

                {selectedResident.ownerships.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-4 bg-slate-50 rounded-xl text-center">
                    Нет привязанных квартир в данном жилом комплексе
                  </p>
                ) : (
                  <div className="space-y-3">
                    {selectedResident.ownerships.map((o) => {
                      const isUnlinking = processingOwnershipId === o.id;
                      return (
                        <div
                          key={o.id}
                          className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-sm">
                                Кв. {o.unit.unitNumber}
                              </span>
                              <span className="text-xs text-slate-500 font-medium">
                                ({o.unit.building.blockName}, этаж {o.unit.floor}, подъезд {o.unit.entrance})
                              </span>
                              {o.isVerified ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Подтверждено
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                  На рассмотрении
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                              <span>Площадь: {o.unit.area} м²</span>
                              <span>•</span>
                              <span>Доля: {o.sharePercent}%</span>
                              <span>•</span>
                              <span>
                                {o.ownershipType === 'OWNER'
                                  ? 'Собственник'
                                  : o.ownershipType === 'TENANT'
                                  ? 'Арендатор'
                                  : 'Семья'}
                              </span>
                            </div>
                          </div>

                          {o.isVerified && (
                            <button
                              onClick={() => handleUnlinkOwnership(o, selectedResident)}
                              disabled={isUnlinking}
                              className="self-start sm:self-center flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {isUnlinking ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                              <span>Отвязать квартиру</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 px-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <button
                onClick={() => handleToggleStatus(selectedResident)}
                disabled={processingUserId === selectedResident.id}
                className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all ${
                  selectedResident.isActive
                    ? 'text-rose-600 border-rose-200 bg-white hover:bg-rose-50'
                    : 'text-emerald-700 border-emerald-200 bg-white hover:bg-emerald-50'
                }`}
              >
                {processingUserId === selectedResident.id ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : selectedResident.isActive ? (
                  'Деактивировать аккаунт'
                ) : (
                  'Активировать аккаунт'
                )}
              </button>

              <button
                onClick={() => setSelectedResident(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
