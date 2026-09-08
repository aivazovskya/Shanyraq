'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  SlidersHorizontal,
  Plus,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Loader2,
  Edit2,
  Trash2,
  X,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { apiRequest, getStoredSession } from '@/lib/api';

interface TariffItem {
  id: string;
  tenantId: string;
  name: string;
  calculationMethod: 'FLAT' | 'PER_AREA';
  rate: number;
  isActive: boolean;
  createdAt: string;
}

export default function TariffsPage() {
  const { t } = useTranslation();
  const [tariffs, setTariffs] = useState<TariffItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [tenantId, setTenantId] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('');

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTariff, setEditingTariff] = useState<TariffItem | null>(null);
  const [formName, setFormName] = useState('');
  const [formMethod, setFormMethod] = useState<'FLAT' | 'PER_AREA'>('FLAT');
  const [formRate, setFormRate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const canWrite = userRole === 'SUPERADMIN' || userRole === 'HOA_ADMIN';

  const loadTariffs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const session = getStoredSession();
      if (!session || !session.user || !session.user.tenantId) {
        throw new Error(t('common.userNotAuthorizedOrLinked'));
      }
      setTenantId(session.user.tenantId);
      setUserRole(session.user.role || '');

      const data = await apiRequest<TariffItem[]>(
        `/finance/tenants/${session.user.tenantId}/tariffs`,
      );
      setTariffs(data);
    } catch (err: any) {
      setError(err.message || t('finance.tariffLoadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadTariffs();
  }, [loadTariffs]);

  const openCreateModal = () => {
    setEditingTariff(null);
    setFormName('');
    setFormMethod('FLAT');
    setFormRate('');
    setIsModalOpen(true);
  };

  const openEditModal = (tariff: TariffItem) => {
    setEditingTariff(tariff);
    setFormName(tariff.name);
    setFormMethod(tariff.calculationMethod);
    setFormRate(String(tariff.rate));
    setIsModalOpen(true);
  };

  const handleSaveTariff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formRate) return;

    const rateNum = parseFloat(formRate);
    if (isNaN(rateNum) || rateNum < 0) return;

    try {
      setIsSaving(true);
      if (editingTariff) {
        // Update existing tariff
        await apiRequest(`/finance/tariffs/${editingTariff.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: formName.trim(),
            calculationMethod: formMethod,
            rate: rateNum,
          }),
        });
        setActionMessage({
          type: 'success',
          text: t('finance.tariffSavedSuccess', { name: formName.trim() }),
        });
      } else {
        // Create new tariff
        await apiRequest(`/finance/tenants/${tenantId}/tariffs`, {
          method: 'POST',
          body: JSON.stringify({
            name: formName.trim(),
            calculationMethod: formMethod,
            rate: rateNum,
          }),
        });
        setActionMessage({
          type: 'success',
          text: t('finance.tariffSavedSuccess', { name: formName.trim() }),
        });
      }

      setIsModalOpen(false);
      await loadTariffs();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || t('common.error'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (tariff: TariffItem) => {
    const nextStatus = !tariff.isActive;
    const promptStatus = nextStatus ? t('finance.tariffActive') : t('finance.tariffInactive');
    if (!confirm(t('finance.toggleTariffPrompt', { name: tariff.name, status: promptStatus }))) {
      return;
    }

    try {
      setProcessingId(tariff.id);
      await apiRequest(`/finance/tariffs/${tariff.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: nextStatus }),
      });

      await loadTariffs();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || t('common.error'),
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteTariff = async (tariff: TariffItem) => {
    if (!confirm(t('finance.toggleTariffPrompt', { name: tariff.name, status: t('finance.tariffInactive') }))) {
      return;
    }

    try {
      setProcessingId(tariff.id);
      await apiRequest(`/finance/tariffs/${tariff.id}`, {
        method: 'DELETE',
      });
      await loadTariffs();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || t('common.error'),
      });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Back Link */}
      <div>
        <Link
          href="/dashboard/finance"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('finance.backToAccounts')}</span>
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-slate-100 text-slate-700 rounded-xl border border-slate-200 shadow-sm">
              <SlidersHorizontal className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                {t('finance.tariffsTitle')}
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">{t('finance.tariffsSubtitle')}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {canWrite && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>{t('finance.newTariffBtn')}</span>
            </button>
          )}

          <button
            onClick={loadTariffs}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Action Notification */}
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

      {/* Tariffs Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
            <p className="text-sm font-medium">{t('common.loading')}</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-1">{t('common.error')}</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto mb-4">{error}</p>
            <button
              onClick={loadTariffs}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-xl shadow-sm transition-all"
            >
              {t('common.refresh')}
            </button>
          </div>
        ) : tariffs.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <SlidersHorizontal className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-1">
              {t('finance.emptyTariffsTitle')}
            </h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">
              {t('finance.emptyTariffsSub')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-6">{t('finance.thTariffName')}</th>
                  <th className="py-3.5 px-4">{t('finance.thMethod')}</th>
                  <th className="py-3.5 px-4">{t('finance.thRate')}</th>
                  <th className="py-3.5 px-4">{t('finance.thStatus')}</th>
                  {canWrite && <th className="py-3.5 px-6 text-right">{t('common.actions')}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {tariffs.map((tariff) => {
                  const isProcessing = processingId === tariff.id;
                  return (
                    <tr key={tariff.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Name */}
                      <td className="py-4 px-6 font-semibold text-slate-900">{tariff.name}</td>

                      {/* Calculation Method */}
                      <td className="py-4 px-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-700">
                          {tariff.calculationMethod === 'PER_AREA'
                            ? t('finance.methodPerArea')
                            : t('finance.methodFlat')}
                        </span>
                      </td>

                      {/* Rate */}
                      <td className="py-4 px-4 font-bold text-slate-900">
                        {tariff.calculationMethod === 'PER_AREA'
                          ? t('finance.ratePerArea', { rate: tariff.rate })
                          : t('finance.rateFlat', { rate: tariff.rate })}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4">
                        {tariff.isActive ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            {t('finance.tariffActive')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            {t('finance.tariffInactive')}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      {canWrite && (
                        <td className="py-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleToggleStatus(tariff)}
                              disabled={isProcessing}
                              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                              title={
                                tariff.isActive
                                  ? t('finance.tariffInactive')
                                  : t('finance.tariffActive')
                              }
                            >
                              {tariff.isActive ? (
                                <ToggleRight className="w-5 h-5 text-emerald-600" />
                              ) : (
                                <ToggleLeft className="w-5 h-5 text-slate-400" />
                              )}
                            </button>

                            <button
                              onClick={() => openEditModal(tariff)}
                              disabled={isProcessing}
                              className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                              title={t('common.edit')}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => handleDeleteTariff(tariff)}
                              disabled={isProcessing}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title={t('common.delete')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE / EDIT TARIFF MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                {editingTariff ? t('finance.editTariffTitle') : t('finance.createTariffTitle')}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 border border-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTariff} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  {t('finance.tariffNameInput')}
                </label>
                <input
                  type="text"
                  required
                  placeholder="РСЖ, Домофон, Лифт..."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  {t('finance.methodLabel')}
                </label>
                <select
                  value={formMethod}
                  onChange={(e) => setFormMethod(e.target.value as 'FLAT' | 'PER_AREA')}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="FLAT">{t('finance.methodFlat')}</option>
                  <option value="PER_AREA">{t('finance.methodPerArea')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  {t('finance.rateInput')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder={formMethod === 'PER_AREA' ? '110.0' : '450.0'}
                  value={formRate}
                  onChange={(e) => setFormRate(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  {formMethod === 'PER_AREA'
                    ? t('finance.ratePerArea', { rate: formRate || '0' })
                    : t('finance.rateFlat', { rate: formRate || '0' })}
                </p>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSaving}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{t('finance.saveTariffBtn')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
