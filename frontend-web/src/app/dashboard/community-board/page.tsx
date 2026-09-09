'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import '@/i18n';
import {
  ShoppingBag,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Phone,
  User as UserIcon,
  Tag,
  Trash2,
  Image as ImageIcon,
  RefreshCw,
  X,
  Building2,
} from 'lucide-react';
import { apiRequest, getStoredSession, AuthUser } from '@/lib/api';

export type ListingType = 'SELL' | 'RENT' | 'GIVE_AWAY' | 'OTHER';
export type ListingStatus = 'ACTIVE' | 'CLOSED' | 'REMOVED';

export interface CommunityListingItem {
  id: string;
  tenantId: string;
  authorId: string;
  type: ListingType;
  title: string;
  description: string;
  price: number | null;
  photoUrls: string[];
  status: ListingStatus;
  removedById: string | null;
  removedReason: string | null;
  createdAt: string;
  updatedAt: string;
  author?: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    role: string;
  };
  removedBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface TenantItem {
  id: string;
  name: string;
  city?: string;
  address?: string;
}

export default function CommunityBoardModerationPage() {
  const { t, i18n } = useTranslation();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [tenantId, setTenantId] = useState<string>('');
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [listings, setListings] = useState<CommunityListingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Moderation Modal
  const [moderatingListing, setModeratingListing] = useState<CommunityListingItem | null>(null);
  const [removalReason, setRemovalReason] = useState('');
  const [submittingRemoval, setSubmittingRemoval] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Photo viewer modal
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const loadListings = useCallback(
    async (tId: string, isSilent = false) => {
      if (!tId) return;
      if (!isSilent) setLoading(true);
      else setRefreshing(true);
      setErrorMsg(null);

      try {
        const params = new URLSearchParams();
        if (filterType !== 'ALL') params.append('type', filterType);
        if (filterStatus !== 'ALL') params.append('status', filterStatus);

        const queryStr = params.toString() ? `?${params.toString()}` : '';
        const data = await apiRequest<CommunityListingItem[]>(
          `/community-board/tenants/${tId}/listings${queryStr}`,
        );
        setListings(data || []);
      } catch (err: any) {
        console.error('Failed to load community listings:', err);
        if (!isSilent) setErrorMsg(err.message || t('communityBoard.loadError'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filterType, filterStatus, t],
  );

  useEffect(() => {
    const session = getStoredSession();
    if (session?.user) {
      setCurrentUser(session.user);
      const isSuper = session.user.role === 'SUPERADMIN';

      if (isSuper) {
        setLoadingTenants(true);
        apiRequest<TenantItem[]>('/properties/tenants')
          .then((data) => {
            setTenants(data || []);
          })
          .catch((err) => {
            console.error('Failed to load tenants for superadmin:', err);
          })
          .finally(() => {
            setLoadingTenants(false);
          });

        if (session.user.tenantId) {
          setTenantId(session.user.tenantId);
          loadListings(session.user.tenantId);
        } else {
          setLoading(false);
        }
      } else {
        const effectiveTenantId = session.user.tenantId;
        if (!effectiveTenantId) {
          setErrorMsg(t('common.userNotAuthorizedOrLinked'));
          setLoading(false);
          return;
        }
        setTenantId(effectiveTenantId);
        loadListings(effectiveTenantId);
      }
    } else {
      setErrorMsg(t('common.userNotAuthorizedOrLinked'));
      setLoading(false);
    }
  }, [loadListings, t]);

  const handleRefresh = () => {
    if (tenantId) {
      loadListings(tenantId, true);
    }
  };

  const handleOpenRemoveModal = (listing: CommunityListingItem) => {
    setModeratingListing(listing);
    setRemovalReason('');
    setModalError(null);
  };

  const handleCloseRemoveModal = () => {
    setModeratingListing(null);
    setRemovalReason('');
    setModalError(null);
  };

  const handleConfirmRemove = async () => {
    if (!moderatingListing) return;
    if (!removalReason.trim()) {
      setModalError(t('communityBoard.reasonRequiredError'));
      return;
    }

    setSubmittingRemoval(true);
    setModalError(null);

    try {
      await apiRequest(`/community-board/listings/${moderatingListing.id}/moderate`, {
        method: 'PATCH',
        body: JSON.stringify({
          reason: removalReason.trim(),
        }),
      });

      handleCloseRemoveModal();
      await loadListings(tenantId, true);
    } catch (err: any) {
      setModalError(err.message || t('communityBoard.moderateError'));
    } finally {
      setSubmittingRemoval(false);
    }
  };

  // Filter listings by search query
  const filteredListings = listings.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const titleMatch = item.title.toLowerCase().includes(q);
    const descMatch = item.description.toLowerCase().includes(q);
    const authorMatch = item.author
      ? `${item.author.firstName} ${item.author.lastName}`.toLowerCase().includes(q)
      : false;
    const phoneMatch = item.author?.phone?.includes(q);
    return titleMatch || descMatch || authorMatch || phoneMatch;
  });

  const getTypeLabel = (type: ListingType) => {
    switch (type) {
      case 'SELL':
        return t('communityBoard.typeSell');
      case 'RENT':
        return t('communityBoard.typeRent');
      case 'GIVE_AWAY':
        return t('communityBoard.typeGiveAway');
      case 'OTHER':
      default:
        return t('communityBoard.typeOther');
    }
  };

  const getTypeBadgeClass = (type: ListingType) => {
    switch (type) {
      case 'SELL':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'RENT':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'GIVE_AWAY':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'OTHER':
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusBadge = (status: ListingStatus) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            {t('communityBoard.statusActive')}
          </span>
        );
      case 'CLOSED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">
            <Clock className="w-3 h-3 mr-1" />
            {t('communityBoard.statusClosed')}
          </span>
        );
      case 'REMOVED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
            <XCircle className="w-3 h-3 mr-1" />
            {t('communityBoard.statusRemoved')}
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShoppingBag className="h-7 w-7 text-indigo-600" />
            {t('communityBoard.pageTitle')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('communityBoard.pageSubtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {currentUser?.role === 'SUPERADMIN' && (
            <div className="flex items-center gap-2 bg-white border border-indigo-200 rounded-lg px-3 py-1.5 shadow-sm">
              <Building2 className="h-4 w-4 text-indigo-600 flex-shrink-0" />
              <select
                value={tenantId}
                onChange={(e) => {
                  const newTId = e.target.value;
                  setTenantId(newTId);
                  if (newTId) {
                    loadListings(newTId);
                  } else {
                    setListings([]);
                  }
                }}
                disabled={loadingTenants}
                className="text-sm font-medium text-gray-800 bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="">{t('communityBoard.selectTenantPlaceholder')}</option>
                {tenants.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} {item.city ? `(${item.city})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={handleRefresh}
            disabled={refreshing || loading || !tenantId}
            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 shadow-sm transition disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </button>
        </div>
      </div>

      {/* Error notification */}
      {errorMsg && (
        <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-red-800">{t('common.error')}</h3>
            <p className="text-sm text-red-700 mt-0.5">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder={t('communityBoard.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Filter Type */}
          <div className="flex items-center gap-1.5">
            <Tag className="h-4 w-4 text-gray-500" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="border border-gray-300 rounded-lg text-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="ALL">{t('communityBoard.filterAllTypes')}</option>
              <option value="SELL">{t('communityBoard.typeSell')}</option>
              <option value="RENT">{t('communityBoard.typeRent')}</option>
              <option value="GIVE_AWAY">{t('communityBoard.typeGiveAway')}</option>
              <option value="OTHER">{t('communityBoard.typeOther')}</option>
            </select>
          </div>

          {/* Filter Status */}
          <div className="flex items-center gap-1.5">
            <Filter className="h-4 w-4 text-gray-500" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-gray-300 rounded-lg text-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="ALL">{t('communityBoard.filterAllStatuses')}</option>
              <option value="ACTIVE">{t('communityBoard.statusActive')}</option>
              <option value="CLOSED">{t('communityBoard.statusClosed')}</option>
              <option value="REMOVED">{t('communityBoard.statusRemoved')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {!tenantId ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center shadow-sm">
          <Building2 className="mx-auto h-12 w-12 text-indigo-500 mb-3" />
          <h3 className="text-base font-semibold text-gray-900">
            {t('communityBoard.selectTenantPromptTitle')}
          </h3>
          <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
            {t('communityBoard.selectTenantPromptSub')}
          </p>
        </div>
      ) : loading ? (
        <div className="py-16 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent mb-3" />
          <p className="text-sm font-medium text-gray-500">{t('common.loading')}</p>
        </div>
      ) : filteredListings.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <ShoppingBag className="mx-auto h-12 w-12 text-gray-400 mb-3" />
          <h3 className="text-base font-semibold text-gray-900">
            {t('communityBoard.noListingsTitle')}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {t('communityBoard.noListingsSub')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredListings.map((item) => {
            const authorName = item.author
              ? `${item.author.firstName} ${item.author.lastName}`.trim()
              : t('communityBoard.authorUnknown');
            const authorPhone = item.author?.phone || '';

            return (
              <div
                key={item.id}
                className={`bg-white border rounded-xl shadow-sm overflow-hidden flex flex-col justify-between transition hover:shadow-md ${
                  item.status === 'REMOVED'
                    ? 'border-red-200 bg-red-50/20'
                    : item.status === 'CLOSED'
                    ? 'border-gray-200 opacity-80'
                    : 'border-gray-200'
                }`}
              >
                <div>
                  {/* Photo Preview Strip */}
                  {item.photoUrls && item.photoUrls.length > 0 ? (
                    <div className="relative h-44 bg-gray-100 overflow-hidden group">
                      <img
                        src={item.photoUrls[0]}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300 cursor-pointer"
                        onClick={() => setSelectedImage(item.photoUrls[0])}
                      />
                      {item.photoUrls.length > 1 && (
                        <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-md flex items-center gap-1 font-medium">
                          <ImageIcon className="w-3 h-3" />
                          +{item.photoUrls.length - 1}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-28 bg-gray-50 flex items-center justify-center text-gray-400 border-b border-gray-100">
                      <ImageIcon className="w-8 h-8 opacity-40" />
                    </div>
                  )}

                  <div className="p-4 space-y-3">
                    {/* Header Badges */}
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getTypeBadgeClass(
                          item.type,
                        )}`}
                      >
                        {getTypeLabel(item.type)}
                      </span>
                      {getStatusBadge(item.status)}
                    </div>

                    {/* Title & Price */}
                    <div>
                      <h3 className="text-base font-bold text-gray-900 line-clamp-1">
                        {item.title}
                      </h3>
                      <p className="text-lg font-extrabold text-indigo-600 mt-0.5">
                        {item.type === 'GIVE_AWAY'
                          ? t('communityBoard.typeGiveAway')
                          : item.price != null
                          ? `${item.price.toLocaleString(i18n.language)} ₸`
                          : t('communityBoard.priceNegotiable')}
                      </p>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-gray-600 line-clamp-3 leading-relaxed">
                      {item.description}
                    </p>

                    {/* Author info */}
                    <div className="pt-2 border-t border-gray-100 space-y-1.5 text-xs text-gray-600">
                      <div className="flex items-center gap-1.5">
                        <UserIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <span className="font-semibold text-gray-800">{authorName}</span>
                      </div>
                      {authorPhone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <a
                            href={`tel:${authorPhone}`}
                            className="text-blue-600 hover:underline font-medium"
                          >
                            {authorPhone}
                          </a>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-gray-400">
                        <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>
                          {new Date(item.createdAt).toLocaleDateString(i18n.language)}{' '}
                          {new Date(item.createdAt).toLocaleTimeString(i18n.language, {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Moderation Details if Removed */}
                    {item.status === 'REMOVED' && (
                      <div className="p-2.5 bg-red-100/60 border border-red-200 rounded-lg text-xs space-y-1 mt-2">
                        <div className="font-bold text-red-800 flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" />
                          {t('communityBoard.removedByStaff')}
                        </div>
                        {item.removedBy && (
                          <div className="text-red-700">
                            {t('communityBoard.moderator')}: {item.removedBy.firstName}{' '}
                            {item.removedBy.lastName}
                          </div>
                        )}
                        {item.removedReason && (
                          <div className="text-red-900 italic">
                            «{item.removedReason}»
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Moderation action */}
                <div className="p-4 pt-0">
                  {item.status !== 'REMOVED' ? (
                    <button
                      onClick={() => handleOpenRemoveModal(item)}
                      className="w-full inline-flex items-center justify-center px-3 py-2 border border-red-200 text-xs font-semibold rounded-lg text-red-700 bg-red-50 hover:bg-red-100 transition shadow-sm"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                      {t('communityBoard.removeAction')}
                    </button>
                  ) : (
                    <div className="text-center text-xs text-gray-400 py-1.5 italic">
                      {t('communityBoard.alreadyRemoved')}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Remove Moderation Modal */}
      {moderatingListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                {t('communityBoard.removeModalTitle')}
              </h3>
              <button
                onClick={handleCloseRemoveModal}
                className="text-gray-400 hover:text-gray-600 rounded-lg p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                {t('communityBoard.confirmRemoveNotice', {
                  title: moderatingListing.title,
                })}
              </p>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('communityBoard.removalReasonLabel')} *
                </label>
                <textarea
                  rows={3}
                  value={removalReason}
                  onChange={(e) => setRemovalReason(e.target.value)}
                  placeholder={t('communityBoard.removalReasonPlaceholder')}
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              {modalError && (
                <p className="text-xs font-medium text-red-600 mt-1">{modalError}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={handleCloseRemoveModal}
                disabled={submittingRemoval}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmRemove}
                disabled={submittingRemoval}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {submittingRemoval && (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {t('communityBoard.confirmRemoveBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Preview Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 cursor-pointer"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-3xl max-h-[85vh] overflow-hidden rounded-xl">
            <img
              src={selectedImage}
              alt="Listing preview"
              className="w-full h-full object-contain"
            />
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-3 right-3 bg-black/60 text-white p-2 rounded-full hover:bg-black/90"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
