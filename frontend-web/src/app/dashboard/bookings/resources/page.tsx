'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  Calendar,
  Plus,
  Edit2,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ArrowLeft,
  X,
  Check,
  AlertCircle,
} from 'lucide-react';
import { apiRequest, getStoredSession } from '@/lib/api';

interface BookableResource {
  id: string;
  tenantId: string;
  name: string;
  type: 'BBQ_AREA' | 'COWORKING' | 'GUEST_PARKING' | 'KIDS_ROOM' | 'OTHER';
  description?: string | null;
  operatingHoursStart?: string | null;
  operatingHoursEnd?: string | null;
  maxDurationMinutes?: number | null;
  isActive: boolean;
  createdAt: string;
}

export default function BookingsResourcesPage() {
  const { t } = useTranslation();
  const session = getStoredSession();
  const tenantId = session?.user?.tenantId;
  const canManage = session?.user?.role === 'HOA_ADMIN' || session?.user?.role === 'SUPERADMIN';

  const [resources, setResources] = useState<BookableResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<BookableResource | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<BookableResource['type']>('BBQ_AREA');
  const [description, setDescription] = useState('');
  const [hoursStart, setHoursStart] = useState('08:00');
  const [hoursEnd, setHoursEnd] = useState('22:00');
  const [maxDuration, setMaxDuration] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchResources = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await apiRequest<BookableResource[]>(`/bookings/tenants/${tenantId}/resources`);
      setResources(data);
    } catch (err: any) {
      console.warn('Failed to load resources:', err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  const openAddModal = () => {
    setEditingResource(null);
    setName('');
    setType('BBQ_AREA');
    setDescription('');
    setHoursStart('08:00');
    setHoursEnd('22:00');
    setMaxDuration('180');
    setIsActive(true);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (res: BookableResource) => {
    setEditingResource(res);
    setName(res.name);
    setType(res.type);
    setDescription(res.description || '');
    setHoursStart(res.operatingHoursStart || '08:00');
    setHoursEnd(res.operatingHoursEnd || '22:00');
    setMaxDuration(res.maxDurationMinutes ? String(res.maxDurationMinutes) : '');
    setIsActive(res.isActive);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;

    if (!name.trim()) {
      setFormError(t('bookings.nameLabel'));
      return;
    }

    if (hoursStart && hoursEnd && hoursStart >= hoursEnd) {
      setFormError(t('bookings.hoursStartLabel') + ' >= ' + t('bookings.hoursEndLabel'));
      return;
    }

    setSaving(true);
    setFormError(null);

    const payload = {
      name: name.trim(),
      type,
      description: description.trim() || undefined,
      operatingHoursStart: hoursStart.trim() || undefined,
      operatingHoursEnd: hoursEnd.trim() || undefined,
      maxDurationMinutes: maxDuration ? parseInt(maxDuration, 10) : undefined,
      isActive,
    };

    try {
      if (editingResource) {
        await apiRequest(`/bookings/resources/${editingResource.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest(`/bookings/tenants/${tenantId}/resources`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      setModalOpen(false);
      setActionSuccess(t('bookings.saveSuccess'));
      setTimeout(() => setActionSuccess(null), 4000);
      await fetchResources();
    } catch (err: any) {
      setFormError(err.message || 'Error saving resource');
    } finally {
      setSaving(false);
    }
  };

  const getTypeLabel = (tType: string) => {
    switch (tType) {
      case 'BBQ_AREA':
        return t('bookings.typeBbQ');
      case 'COWORKING':
        return t('bookings.typeCoworking');
      case 'GUEST_PARKING':
        return t('bookings.typeParking');
      case 'KIDS_ROOM':
        return t('bookings.typeKids');
      default:
        return t('bookings.typeOther');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/dashboard/bookings"
              className="text-xs text-slate-500 hover:text-emerald-600 flex items-center gap-1 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {t('bookings.bookingsBtn')}
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{t('bookings.resourcesTitle')}</h1>
          <p className="text-sm text-slate-500">{t('bookings.resourcesSubtitle')}</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchResources}
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium flex items-center gap-2 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-slate-400' : ''}`} />
            {t('bookings.refreshBtn')}
          </button>

          {canManage && (
            <button
              onClick={openAddModal}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center gap-2 shadow-sm transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              {t('bookings.addResourceBtn')}
            </button>
          )}
        </div>
      </div>

      {actionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2">
          <Check className="w-5 h-5 text-emerald-600 shrink-0" />
          {actionSuccess}
        </div>
      )}

      {/* Grid of Resources */}
      {resources.length === 0 && !loading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-sm">
          {t('bookings.noResources')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {resources.map((res) => (
            <div
              key={res.id}
              className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {getTypeLabel(res.type)}
                  </span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      res.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {res.isActive ? t('bookings.activeBadge') : t('bookings.inactiveBadge')}
                  </span>
                </div>

                <h3 className="text-lg font-bold text-slate-900 mt-2">{res.name}</h3>

                {res.description && (
                  <p className="text-xs text-slate-600 mt-2 line-clamp-3">{res.description}</p>
                )}

                <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-500">
                  {res.operatingHoursStart && res.operatingHoursEnd && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        {t('bookings.operatingHours', {
                          start: res.operatingHoursStart,
                          end: res.operatingHoursEnd,
                        })}
                      </span>
                    </div>
                  )}
                  {res.maxDurationMinutes && (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{t('bookings.maxDuration', { minutes: res.maxDurationMinutes })}</span>
                    </div>
                  )}
                </div>
              </div>

              {canManage && (
                <div className="mt-6 pt-4 border-t border-slate-100">
                  <button
                    onClick={() => openEditModal(res)}
                    className="w-full py-2 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    {t('bookings.editResourceBtn')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal Add/Edit */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {editingResource ? t('bookings.modalTitleEdit') : t('bookings.modalTitleAdd')}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('bookings.nameLabel')} *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('bookings.namePlaceholder')}
                  required
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('bookings.typeLabel')} *
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                >
                  <option value="BBQ_AREA">{t('bookings.typeBbQ')}</option>
                  <option value="COWORKING">{t('bookings.typeCoworking')}</option>
                  <option value="GUEST_PARKING">{t('bookings.typeParking')}</option>
                  <option value="KIDS_ROOM">{t('bookings.typeKids')}</option>
                  <option value="OTHER">{t('bookings.typeOther')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('bookings.descLabel')}
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('bookings.hoursStartLabel')}
                  </label>
                  <input
                    type="text"
                    value={hoursStart}
                    onChange={(e) => setHoursStart(e.target.value)}
                    placeholder="08:00"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('bookings.hoursEndLabel')}
                  </label>
                  <input
                    type="text"
                    value={hoursEnd}
                    onChange={(e) => setHoursEnd(e.target.value)}
                    placeholder="22:00"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('bookings.maxDurationLabel')}
                </label>
                <input
                  type="number"
                  value={maxDuration}
                  onChange={(e) => setMaxDuration(e.target.value)}
                  placeholder="180"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActiveCheck"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                />
                <label htmlFor="isActiveCheck" className="text-xs font-semibold text-slate-700">
                  {t('bookings.activeLabel')}
                </label>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition"
                >
                  {t('bookings.closeBtn')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center gap-2 transition"
                >
                  {saving ? t('bookings.savingBtn') : t('bookings.saveBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
