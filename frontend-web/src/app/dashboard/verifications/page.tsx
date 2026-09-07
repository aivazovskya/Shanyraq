'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  UserCheck,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Search,
  ExternalLink,
  ShieldCheck,
  Percent,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { apiRequest, ensureAuthSession } from '@/lib/api';

interface VerificationItem {
  id: string;
  userId: string;
  unitId: string;
  ownershipType: string;
  sharePercent: number;
  isVerified: boolean;
  verificationDoc: string | null;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
  };
  unit: {
    id: string;
    unitNumber: string;
    floor: number;
    entrance: number;
    area: number;
    cadastralNumber: string | null;
    building: {
      id: string;
      blockName: string;
    };
  };
}

export default function VerificationsPage() {
  const [items, setItems] = useState<VerificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [approvedShares, setApprovedShares] = useState<Record<string, number>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string>('ЖК');

  const loadVerifications = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const session = await ensureAuthSession();
      if (!session.user.tenantId) {
        throw new Error('Пользователь не привязан к жилому комплексу');
      }
      if (session.user.tenantName) {
        setTenantName(session.user.tenantName);
      }

      const data = await apiRequest<VerificationItem[]>(
        `/properties/tenants/${session.user.tenantId}/pending-verifications`,
      );

      setItems(data);

      // Инициализируем значения подтверждаемых долей из данных заявки
      const initialShares: Record<string, number> = {};
      data.forEach((item) => {
        initialShares[item.id] = item.sharePercent;
      });
      setApprovedShares(initialShares);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки очереди верификаций');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVerifications();
  }, [loadVerifications]);

  const handleApprove = async (item: VerificationItem) => {
    try {
      setProcessingId(item.id);
      setActionMessage(null);
      const approvedSharePercent = approvedShares[item.id] ?? item.sharePercent;

      await apiRequest(`/properties/ownerships/${item.id}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({
          isVerified: true,
          approvedSharePercent: Number(approvedSharePercent),
        }),
      });

      setActionMessage({
        type: 'success',
        text: `Право собственности для ${item.user.firstName} ${item.user.lastName} (кв. ${item.unit.unitNumber}) успешно подтверждено с долей ${approvedSharePercent}%`,
      });

      // Перезагрузка актуальных данных из БД
      await loadVerifications();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Ошибка при подтверждении права собственности',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (item: VerificationItem) => {
    if (
      !confirm(
        `Отклонить заявку на привязку кв. ${item.unit.unitNumber} для ${item.user.firstName} ${item.user.lastName}?`,
      )
    ) {
      return;
    }

    try {
      setProcessingId(item.id);
      setActionMessage(null);

      await apiRequest(`/properties/ownerships/${item.id}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({
          isVerified: false,
        }),
      });

      setActionMessage({
        type: 'success',
        text: `Заявка на квартиру ${item.unit.unitNumber} отклонена и исключена из очереди.`,
      });

      // Перезагрузка актуальных данных из БД
      await loadVerifications();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Ошибка при отклонении заявки',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const filteredItems = items.filter((item) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const fullName = `${item.user.firstName} ${item.user.lastName}`.toLowerCase();
    const phone = item.user.phone.toLowerCase();
    const unitNum = item.unit.unitNumber.toLowerCase();
    return fullName.includes(q) || phone.includes(q) || unitNum.includes(q);
  });

  return (
    <div className="space-y-6">
      {/* Заголовок страницы */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Верификация прав собственности
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800">
              {tenantName}
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Проверка документов eGov и подтверждение долей собственников для юридической легитимности
            голосований ОСС
          </p>
        </div>

        <button
          onClick={loadVerifications}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 border border-slate-300 rounded-xl bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Обновить очередь</span>
        </button>
      </div>

      {/* Уведомление о действии */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl flex items-start gap-3 border ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          )}
          <div className="text-sm flex-1">{actionMessage.text}</div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-slate-400 hover:text-slate-600 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Ошибка загрузки */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span>{error}</span>
          </div>
          <button
            onClick={loadVerifications}
            className="text-xs underline font-semibold hover:text-red-950"
          >
            Повторить попытку
          </button>
        </div>
      )}

      {/* Поиск и фильтры */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Поиск по ФИО, номеру телефона или квартиры..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          />
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-600">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Заявок в очереди: <strong>{items.length}</strong></span>
        </div>
      </div>

      {/* Таблица заявок */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
            <p className="text-sm font-medium">Загрузка очереди заявок из базы данных...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <UserCheck className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-900">
              {items.length === 0
                ? 'Все заявки на верификацию обработаны'
                : 'По запросу ничего не найдено'}
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              {items.length === 0
                ? 'Новых неподтвержденных запросов на право собственности нет.'
                : 'Попробуйте изменить параметры поиска.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4">Заявитель</th>
                  <th className="px-6 py-4">Объект / Квартира</th>
                  <th className="px-6 py-4">Документ eGov / ДДУ</th>
                  <th className="px-6 py-4">Доля (кворум ОСС)</th>
                  <th className="px-6 py-4 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredItems.map((item) => {
                  const currentShare = approvedShares[item.id] ?? item.sharePercent;
                  const isProcessing = processingId === item.id;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      {/* Заявитель */}
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900">
                          {item.user.firstName} {item.user.lastName}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">{item.user.phone}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Подано: {new Date(item.createdAt).toLocaleDateString('ru-RU')}
                        </div>
                      </td>

                      {/* Квартира */}
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900">
                          Кв. {item.unit.unitNumber}
                        </div>
                        <div className="text-xs text-slate-500">
                          {item.unit.building?.blockName || 'Блок'} • {item.unit.area} м²
                        </div>
                        <span className="inline-block mt-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
                          {item.ownershipType === 'OWNER'
                            ? 'Собственник'
                            : item.ownershipType === 'TENANT'
                            ? 'Арендатор'
                            : 'Член семьи'}
                        </span>
                      </td>

                      {/* Документ eGov */}
                      <td className="px-6 py-4">
                        {item.verificationDoc ? (
                          <a
                            href={item.verificationDoc}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 text-xs font-medium transition-colors border border-sky-200"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Открыть документ</span>
                            <ExternalLink className="w-3 h-3 ml-0.5 opacity-70" />
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400 italic">
                            Документ не прикреплен
                          </span>
                        )}
                      </td>

                      {/* Доля с возможностью редактирования */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="relative w-24">
                            <input
                              type="number"
                              min="0.01"
                              max="100"
                              step="0.1"
                              value={currentShare}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setApprovedShares((prev) => ({
                                  ...prev,
                                  [item.id]: val,
                                }));
                              }}
                              disabled={isProcessing}
                              className="w-full px-2.5 py-1 text-sm font-semibold text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 pr-6"
                            />
                            <Percent className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">
                          Заявлено: {item.sharePercent}%
                        </div>
                      </td>

                      {/* Действия */}
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => handleApprove(item)}
                            disabled={isProcessing}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors disabled:opacity-60"
                          >
                            {isProcessing ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            <span>Одобрить</span>
                          </button>

                          <button
                            onClick={() => handleReject(item)}
                            disabled={isProcessing}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 hover:bg-red-50 text-red-600 rounded-lg text-xs font-medium transition-colors disabled:opacity-60"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Отклонить</span>
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
    </div>
  );
}
