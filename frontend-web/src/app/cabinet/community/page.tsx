'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ShoppingBag,
  Plus,
  Tag,
  Phone,
  Clock,
  Trash2,
  X,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Filter,
} from 'lucide-react';
import {
  CabinetApi,
  CommunityListing,
  ResidentProfile,
} from '@/lib/cabinet-api';
import { getCommunityListingTypeLabel } from '@/lib/cabinet-labels';

const LISTING_TYPE_KEYS: Array<'SELL' | 'RENT' | 'GIVE_AWAY' | 'OTHER'> = [
  'SELL',
  'RENT',
  'GIVE_AWAY',
  'OTHER',
];

export default function CabinetCommunityPage() {
  const { t, i18n } = useTranslation();

  const [profile, setProfile] = useState<ResidentProfile | null>(null);
  const [listings, setListings] = useState<CommunityListing[]>([]);
  const [myListings, setMyListings] = useState<CommunityListing[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'my'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);

  // Create Listing Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newType, setNewType] = useState<'SELL' | 'RENT' | 'GIVE_AWAY' | 'OTHER'>('SELL');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const me = await CabinetApi.getMe();
      setProfile(me);

      const tenantId = me.tenantId || me.ownerships?.[0]?.unit?.building?.tenantId;
      const [allRes, myRes] = await Promise.all([
        tenantId ? CabinetApi.getListings(tenantId, typeFilter) : Promise.resolve([]),
        CabinetApi.getMyListings(),
      ]);

      setListings(allRes || []);
      setMyListings(myRes || []);
    } catch (e) {
      console.warn('Failed to load community listings:', e);
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateListing = async (e: React.FormEvent) => {
    e.preventDefault();
    const tenantId = profile?.tenantId || profile?.ownerships?.[0]?.unit?.building?.tenantId;
    if (!tenantId || !newTitle.trim() || !newDesc.trim()) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const priceNum = newPrice ? parseFloat(newPrice) : undefined;
      await CabinetApi.createListing(tenantId, {
        type: newType,
        title: newTitle.trim(),
        description: newDesc.trim(),
        price: priceNum,
      });

      setShowCreateModal(false);
      setNewTitle('');
      setNewDesc('');
      setNewPrice('');
      alert(t('cabinet.listingCreatedSuccess'));
      await loadData();
    } catch (err: any) {
      setSubmitError(err?.message || t('cabinet.createListingError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseListing = async (id: string) => {
    if (!confirm(t('cabinet.deleteListingConfirm'))) return;
    try {
      await CabinetApi.closeListing(id);
      alert(t('cabinet.listingDeletedSuccess'));
      await loadData();
    } catch (err: any) {
      alert(err?.message || t('cabinet.deleteListingError'));
    }
  };

  const currentList = activeTab === 'all' ? listings : myListings;

  const formatMoney = (val?: number | null) => {
    if (val === null || val === undefined) return t('cabinet.priceNegotiated');
    if (val === 0) return t('cabinet.priceFree');
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'KZT',
      maximumFractionDigits: 0,
    })
      .format(val)
      .replace('KZT', '₸');
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      return new Intl.DateTimeFormat(
        i18n.language === 'en' ? 'en-US' : i18n.language === 'kk' ? 'kk-KZ' : 'ru-RU',
        { day: 'numeric', month: 'short', timeZone: 'Asia/Almaty' },
      ).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {t('cabinet.communityTitle')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('cabinet.communitySubtitle')}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors self-start sm:self-center"
        >
          <Plus className="w-4 h-4" />
          <span>{t('cabinet.createListing')}</span>
        </button>
      </div>

      {/* Tabs and Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Tabs */}
        <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'all'
                ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            {t('cabinet.allListings')} ({listings.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('my')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'my'
                ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            {t('cabinet.myListings')} ({myListings.length})
          </button>
        </div>

        {/* Type Filter */}
        {activeTab === 'all' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {['ALL', 'SELL', 'RENT', 'GIVE_AWAY', 'OTHER'].map((tp) => (
              <button
                key={tp}
                type="button"
                onClick={() => setTypeFilter(tp)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  typeFilter === tp
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                }`}
              >
                {tp === 'ALL' ? t('common.all') : getCommunityListingTypeLabel(tp, t)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Listings Grid */}
      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </div>
      ) : currentList.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center shadow-sm">
          <ShoppingBag className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            {t('cabinet.noListings')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('cabinet.noListingsDesc')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {currentList.map((item) => (
            <div
              key={item.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-bold text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {getCommunityListingTypeLabel(item.type, t)}
                  </span>
                  <span className="text-slate-400 text-[11px]">{formatDate(item.createdAt)}</span>
                </div>

                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {item.title}
                </h3>

                <div className="mt-1 text-sm font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                  {formatMoney(item.price)}
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 line-clamp-3">
                  {item.description}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                {item.author && (
                  <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {item.author.firstName}
                    </span>
                    {item.author.phone && (
                      <a
                        href={`tel:${item.author.phone}`}
                        className="text-emerald-600 dark:text-emerald-400 font-medium hover:underline flex items-center gap-1 ml-1"
                      >
                        <Phone className="w-3 h-3" />
                        <span>{item.author.phone}</span>
                      </a>
                    )}
                  </div>
                )}

                {item.authorId === profile?.id && item.status === 'ACTIVE' && (
                  <button
                    type="button"
                    onClick={() => handleCloseListing(item.id)}
                    className="text-xs font-semibold text-red-600 hover:underline flex items-center gap-1 ml-auto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t('cabinet.deleteListing')}</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Listing Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl relative animate-in fade-in duration-200">
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label={t('cabinet.close')}
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {t('cabinet.createListing')}
            </h3>

            {submitError && (
              <div className="mt-3 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 text-xs">
                {submitError}
              </div>
            )}

            <form onSubmit={handleCreateListing} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('cabinet.listingType')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {LISTING_TYPE_KEYS.map((tKey) => (
                    <button
                      key={tKey}
                      type="button"
                      onClick={() => setNewType(tKey)}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold text-center transition-all ${
                        newType === tKey
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {getCommunityListingTypeLabel(tKey, t)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('cabinet.listingTitle')} *
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={t('cabinet.listingTitlePlaceholder')}
                  className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('cabinet.listingPrice')}
                </label>
                <input
                  type="number"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  placeholder={t('cabinet.priceFreeHint')}
                  className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('cabinet.listingDesc')} *
                </label>
                <textarea
                  rows={3}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder={t('cabinet.listingDescPlaceholder')}
                  className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white text-xs"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>{t('cabinet.publishListing')}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
