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
  Archive,
  CreditCard,
  Pin,
  Plus,
  DollarSign,
  Briefcase,
  UploadCloud,
} from 'lucide-react';
import { apiRequest, getStoredSession, AuthUser } from '@/lib/api';
import { compressImage } from '@/lib/image-compress';

export type ListingType = 'SELL' | 'RENT' | 'GIVE_AWAY' | 'OTHER' | 'AD';
export type ListingStatus =
  | 'ACTIVE'
  | 'CLOSED'
  | 'REMOVED'
  | 'ARCHIVED'
  | 'PENDING_REVIEW'
  | 'AWAITING_PAYMENT'
  | 'EXPIRED';
export type AdPaymentStatus = 'TRIAL' | 'UNPAID' | 'PAID';

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
  adBusinessName?: string | null;
  adContactPhone?: string | null;
  adPaymentStatus?: AdPaymentStatus | null;
  adMonths?: number | null;
  adPriceKzt?: number | null;
  adStartsAt?: string | null;
  adEndsAt?: string | null;
  pinnedUntil?: string | null;
  removedById: string | null;
  removedReason: string | null;
  createdAt: string;
  updatedAt: string;
  author?: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
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

export interface AdPricing {
  adPriceMonthly: number;
  adPinPriceWeekly: number;
  adTrialDays: number;
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
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Moderation Modal
  const [moderatingListing, setModeratingListing] = useState<CommunityListingItem | null>(null);
  const [removalReason, setRemovalReason] = useState('');
  const [submittingRemoval, setSubmittingRemoval] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Pin Modal
  const [pinningListing, setPinningListing] = useState<CommunityListingItem | null>(null);
  const [pinWeeks, setPinWeeks] = useState<number>(1);
  const [submittingPin, setSubmittingPin] = useState(false);

  // Action in progress (approve, pay, pin)
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  // Photo viewer modal
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Ad Pricing block (SUPERADMIN only)
  const [pricing, setPricing] = useState<AdPricing | null>(null);
  const [pricingMonthly, setPricingMonthly] = useState<number>(3000);
  const [pricingWeekly, setPricingWeekly] = useState<number>(2000);
  const [pricingTrial, setPricingTrial] = useState<number>(30);
  const [savingPricing, setSavingPricing] = useState(false);

  // Create Ad Modal (Staff on behalf of business)
  const [showCreateAdModal, setShowCreateAdModal] = useState(false);
  const [createAdBusinessName, setCreateAdBusinessName] = useState('');
  const [createAdContactPhone, setCreateAdContactPhone] = useState('');
  const [createAdTitle, setCreateAdTitle] = useState('');
  const [createAdDescription, setCreateAdDescription] = useState('');
  const [createAdMonths, setCreateAdMonths] = useState<number>(1);
  const [createAdPhotos, setCreateAdPhotos] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submittingCreateAd, setSubmittingCreateAd] = useState(false);
  const [createAdError, setCreateAdError] = useState<string | null>(null);

  const isStaffRole =
    currentUser?.role === 'SUPERADMIN' ||
    currentUser?.role === 'HOA_ADMIN' ||
    currentUser?.role === 'HOA_CHAIRMAN' ||
    currentUser?.role === 'DISPATCHER';

  const isSuperadmin = currentUser?.role === 'SUPERADMIN';

  const loadPricing = useCallback(async (tId: string) => {
    if (!tId) return;
    try {
      const data = await apiRequest<AdPricing>(`/community-board/tenants/${tId}/ad-pricing`);
      if (data) {
        setPricing(data);
        setPricingMonthly(data.adPriceMonthly ?? 3000);
        setPricingWeekly(data.adPinPriceWeekly ?? 2000);
        setPricingTrial(data.adTrialDays ?? 30);
      }
    } catch (err: any) {
      console.warn('Failed to load ad pricing:', err);
    }
  }, []);

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
            const defaultId = session.user.tenantId || (data && data[0]?.id) || '';
            if (defaultId) {
              setTenantId(defaultId);
              loadListings(defaultId);
              loadPricing(defaultId);
            } else {
              setLoading(false);
            }
          })
          .catch((err) => {
            console.error('Failed to load tenants for superadmin:', err);
          })
          .finally(() => {
            setLoadingTenants(false);
          });
      } else {
        const effectiveTenantId = session.user.tenantId;
        if (!effectiveTenantId) {
          setErrorMsg(t('common.userNotAuthorizedOrLinked'));
          setLoading(false);
          return;
        }
        setTenantId(effectiveTenantId);
        loadListings(effectiveTenantId);
        loadPricing(effectiveTenantId);
      }
    } else {
      setErrorMsg(t('common.userNotAuthorizedOrLinked'));
      setLoading(false);
    }
  }, [loadListings, loadPricing, t]);

  const handleRefresh = () => {
    if (tenantId) {
      loadListings(tenantId, true);
      loadPricing(tenantId);
    }
  };

  // Actions for Ads
  const handleApproveAd = async (listing: CommunityListingItem) => {
    setActionInProgressId(listing.id);
    setErrorMsg(null);
    try {
      await apiRequest(`/community-board/listings/${listing.id}/ad/approve`, {
        method: 'PATCH',
      });
      setSuccessMsg(t('communityBoard.adApproveSuccess'));
      await loadListings(tenantId, true);
    } catch (err: any) {
      setErrorMsg(err.message || t('common.error'));
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleConfirmPaid = async (listing: CommunityListingItem) => {
    setActionInProgressId(listing.id);
    setErrorMsg(null);
    try {
      await apiRequest(`/community-board/listings/${listing.id}/ad/paid`, {
        method: 'PATCH',
      });
      setSuccessMsg(t('communityBoard.adPaidSuccess'));
      await loadListings(tenantId, true);
    } catch (err: any) {
      setErrorMsg(err.message || t('common.error'));
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleOpenPinModal = (listing: CommunityListingItem) => {
    setPinningListing(listing);
    setPinWeeks(1);
    setModalError(null);
  };

  const handleClosePinModal = () => {
    setPinningListing(null);
    setPinWeeks(1);
    setModalError(null);
  };

  const handleConfirmPin = async () => {
    if (!pinningListing) return;
    setSubmittingPin(true);
    setModalError(null);
    try {
      await apiRequest(`/community-board/listings/${pinningListing.id}/ad/pin`, {
        method: 'PATCH',
        body: JSON.stringify({ weeks: pinWeeks }),
      });
      handleClosePinModal();
      setSuccessMsg(t('communityBoard.adPinSuccess'));
      await loadListings(tenantId, true);
    } catch (err: any) {
      setModalError(err.message || t('common.error'));
    } finally {
      setSubmittingPin(false);
    }
  };

  const handleSavePricing = async () => {
    if (!tenantId) return;
    setSavingPricing(true);
    setErrorMsg(null);
    try {
      const updated = await apiRequest<AdPricing>(`/community-board/tenants/${tenantId}/ad-pricing`, {
        method: 'PATCH',
        body: JSON.stringify({
          adPriceMonthly: pricingMonthly,
          adPinPriceWeekly: pricingWeekly,
          adTrialDays: pricingTrial,
        }),
      });
      setPricing(updated);
      setSuccessMsg(t('communityBoard.pricingSavedSuccess'));
    } catch (err: any) {
      setErrorMsg(err.message || t('communityBoard.pricingSaveError'));
    } finally {
      setSavingPricing(false);
    }
  };

  // Moderate / Remove Modal
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

  // Upload Photo for Ad Creation
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (createAdPhotos.length >= 5) return;

    setUploadingPhoto(true);
    setCreateAdError(null);

    try {
      const file = files[0];
      const compressed = await compressImage(file);

      const formData = new FormData();
      formData.append('file', compressed, file.name);

      const res = await apiRequest<{ url: string }>(
        '/uploads?category=media',
        {
          method: 'POST',
          body: formData,
        },
      );

      if (res && res.url) {
        setCreateAdPhotos((prev) => [...prev, res.url].slice(0, 5));
      }
    } catch (err: any) {
      setCreateAdError(err.message || t('common.error'));
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleRemovePhoto = (urlToRemove: string) => {
    setCreateAdPhotos((prev) => prev.filter((u) => u !== urlToRemove));
  };

  const handleCreateAdSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createAdBusinessName.trim() || createAdBusinessName.trim().length < 2) {
      setCreateAdError(t('communityBoard.adBusinessNameLabel'));
      return;
    }
    if (!createAdTitle.trim() || createAdTitle.trim().length < 3) {
      setCreateAdError(t('common.requiredFields'));
      return;
    }
    if (!createAdDescription.trim() || createAdDescription.trim().length < 5) {
      setCreateAdError(t('common.requiredFields'));
      return;
    }

    setSubmittingCreateAd(true);
    setCreateAdError(null);

    try {
      await apiRequest(`/community-board/tenants/${tenantId}/listings`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'AD',
          title: createAdTitle.trim(),
          description: createAdDescription.trim(),
          adBusinessName: createAdBusinessName.trim(),
          adContactPhone: createAdContactPhone.trim() || undefined,
          adMonths: createAdMonths,
          photoUrls: createAdPhotos,
        }),
      });

      setShowCreateAdModal(false);
      setCreateAdBusinessName('');
      setCreateAdContactPhone('');
      setCreateAdTitle('');
      setCreateAdDescription('');
      setCreateAdMonths(1);
      setCreateAdPhotos([]);
      setSuccessMsg(t('communityBoard.adCreateSuccess'));
      await loadListings(tenantId, true);
    } catch (err: any) {
      setCreateAdError(err.message || t('common.error'));
    } finally {
      setSubmittingCreateAd(false);
    }
  };

  // Filter listings by search query
  const filteredListings = listings.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const titleMatch = item.title.toLowerCase().includes(q);
    const descMatch = item.description.toLowerCase().includes(q);
    const businessMatch = item.adBusinessName
      ? item.adBusinessName.toLowerCase().includes(q)
      : false;
    const authorMatch = item.author
      ? `${item.author.firstName} ${item.author.lastName}`.toLowerCase().includes(q)
      : false;
    const phoneMatch =
      (item.author?.phone && item.author.phone.includes(q)) ||
      (item.adContactPhone && item.adContactPhone.includes(q));
    return titleMatch || descMatch || businessMatch || authorMatch || phoneMatch;
  });

  const getTypeLabel = (type: ListingType) => {
    switch (type) {
      case 'AD':
        return t('communityBoard.typeAd');
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
      case 'AD':
        return 'bg-amber-100 text-amber-800 border-amber-300 font-bold';
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
      case 'PENDING_REVIEW':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
            <Clock className="w-3 h-3 mr-1" />
            {t('communityBoard.statusPendingReview')}
          </span>
        );
      case 'AWAITING_PAYMENT':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 border border-sky-300">
            <CreditCard className="w-3 h-3 mr-1" />
            {t('communityBoard.statusAwaitingPayment')}
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-700 border border-zinc-200">
            <Clock className="w-3 h-3 mr-1" />
            {t('communityBoard.statusExpired')}
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
      case 'ARCHIVED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            <Archive className="w-3 h-3 mr-1" />
            {t('communityBoard.statusArchived')}
          </span>
        );
      default:
        return null;
    }
  };

  const getPaymentStatusBadge = (status?: AdPaymentStatus | null) => {
    switch (status) {
      case 'TRIAL':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
            {t('communityBoard.paymentStatusTrial')}
          </span>
        );
      case 'PAID':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
            {t('communityBoard.paymentStatusPaid')}
          </span>
        );
      case 'UNPAID':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
            {t('communityBoard.paymentStatusUnpaid')}
          </span>
        );
      default:
        return null;
    }
  };

  const calculatedFormPrice = (pricing?.adPriceMonthly ?? pricingMonthly) * createAdMonths;

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
                    loadPricing(newTId);
                  } else {
                    setListings([]);
                    setPricing(null);
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

          {Boolean(tenantId) && isStaffRole && (
            <button
              onClick={() => {
                setCreateAdError(null);
                setShowCreateAdModal(true);
              }}
              className="inline-flex items-center px-3 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              {t('communityBoard.addAdAction')}
            </button>
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

      {/* Notifications */}
      {errorMsg && (
        <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-red-800">{t('common.error')}</h3>
            <p className="text-sm text-red-700 mt-0.5">{errorMsg}</p>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-green-50 border-l-4 border-green-500 rounded-r-lg flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-green-800">{t('common.success')}</h3>
            <p className="text-sm text-green-700 mt-0.5">{successMsg}</p>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-green-400 hover:text-green-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pricing Settings Block (SUPERADMIN only) */}
      {isSuperadmin && Boolean(tenantId) && (
        <div className="bg-white p-5 rounded-xl border border-indigo-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-indigo-600" />
              <h2 className="text-base font-bold text-gray-900">
                {t('communityBoard.adPricingTitle')}
              </h2>
            </div>
            <button
              onClick={handleSavePricing}
              disabled={savingPricing}
              className="inline-flex items-center px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition disabled:opacity-50 shadow-sm"
            >
              {savingPricing && (
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" />
              )}
              {t('communityBoard.savePricingBtn')}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {t('communityBoard.adPriceMonthlyLabel')}
              </label>
              <input
                type="number"
                min={0}
                value={pricingMonthly}
                onChange={(e) => setPricingMonthly(parseInt(e.target.value, 10) || 0)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {t('communityBoard.adPinPriceWeeklyLabel')}
              </label>
              <input
                type="number"
                min={0}
                value={pricingWeekly}
                onChange={(e) => setPricingWeekly(parseInt(e.target.value, 10) || 0)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {t('communityBoard.adTrialDaysLabel')}
              </label>
              <input
                type="number"
                min={0}
                max={365}
                value={pricingTrial}
                onChange={(e) => setPricingTrial(parseInt(e.target.value, 10) || 0)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
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
              <option value="AD">{t('communityBoard.typeAd')}</option>
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
              <option value="PENDING_REVIEW">{t('communityBoard.statusPendingReview')}</option>
              <option value="AWAITING_PAYMENT">{t('communityBoard.statusAwaitingPayment')}</option>
              <option value="EXPIRED">{t('communityBoard.statusExpired')}</option>
              <option value="CLOSED">{t('communityBoard.statusClosed')}</option>
              <option value="REMOVED">{t('communityBoard.statusRemoved')}</option>
              <option value="ARCHIVED">{t('communityBoard.statusArchived')}</option>
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
            const contactPhone = item.adContactPhone || item.author?.phone || '';
            const isPinned =
              item.pinnedUntil != null && new Date(item.pinnedUntil).getTime() > Date.now();
            const formattedPinnedDate = item.pinnedUntil
              ? new Date(item.pinnedUntil).toLocaleDateString(i18n.language)
              : '';

            return (
              <div
                key={item.id}
                className={`bg-white border rounded-xl shadow-sm overflow-hidden flex flex-col justify-between transition hover:shadow-md ${
                  isPinned
                    ? 'ring-2 ring-amber-400 border-amber-300'
                    : item.status === 'REMOVED'
                    ? 'border-red-200 bg-red-50/20'
                    : item.status === 'CLOSED'
                    ? 'border-gray-200 opacity-80'
                    : item.status === 'EXPIRED'
                    ? 'border-zinc-200 bg-zinc-50/40 opacity-75'
                    : item.status === 'PENDING_REVIEW'
                    ? 'border-amber-200 bg-amber-50/20'
                    : item.status === 'AWAITING_PAYMENT'
                    ? 'border-sky-200 bg-sky-50/20'
                    : 'border-gray-200'
                }`}
              >
                <div>
                  {/* Pinned top indicator banner */}
                  {isPinned && (
                    <div className="bg-amber-500 text-white text-xs font-bold px-3 py-1 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Pin className="w-3.5 h-3.5 fill-white" />
                        <span>
                          {t('communityBoard.adPinnedUntil', { date: formattedPinnedDate })}
                        </span>
                      </div>
                    </div>
                  )}

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
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${getTypeBadgeClass(
                          item.type,
                        )}`}
                      >
                        {getTypeLabel(item.type)}
                      </span>
                      {getStatusBadge(item.status)}
                    </div>

                    {/* Business Name if AD */}
                    {item.type === 'AD' && item.adBusinessName && (
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                        <Briefcase className="w-3.5 h-3.5 text-amber-700 flex-shrink-0" />
                        <span className="truncate">{item.adBusinessName}</span>
                      </div>
                    )}

                    {/* Title & Price */}
                    <div>
                      <h3 className="text-base font-bold text-gray-900 line-clamp-1">
                        {item.title}
                      </h3>
                      <p className="text-lg font-extrabold text-indigo-600 mt-0.5">
                        {item.type === 'AD'
                          ? item.adPriceKzt != null
                            ? `${item.adPriceKzt.toLocaleString(i18n.language)} ₸`
                            : '0 ₸'
                          : item.type === 'GIVE_AWAY'
                          ? t('communityBoard.typeGiveAway')
                          : item.price != null
                          ? `${item.price.toLocaleString(i18n.language)} ₸`
                          : t('communityBoard.priceNegotiable')}
                      </p>
                    </div>

                    {/* Ad Details: Payment status & placement dates */}
                    {item.type === 'AD' && (
                      <div className="p-2 bg-gray-50 rounded-lg text-xs space-y-1.5 border border-gray-100">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500 font-medium">
                            {t('communityBoard.adPeriod')}:
                          </span>
                          <span className="font-semibold text-gray-800">
                            {item.adMonths} {t(`communityBoard.months${item.adMonths}` as any) || `${item.adMonths} мес.`}
                          </span>
                        </div>
                        {item.adPaymentStatus && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-500 font-medium">{t('communityBoard.paymentLabel')}:</span>
                            {getPaymentStatusBadge(item.adPaymentStatus)}
                          </div>
                        )}
                        {item.adStartsAt && item.adEndsAt && (
                          <div className="text-[11px] text-gray-500">
                            {new Date(item.adStartsAt).toLocaleDateString(i18n.language)} —{' '}
                            {new Date(item.adEndsAt).toLocaleDateString(i18n.language)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Description */}
                    <p className="text-xs text-gray-600 line-clamp-3 leading-relaxed">
                      {item.description}
                    </p>

                    {/* Author & Contact info */}
                    <div className="pt-2 border-t border-gray-100 space-y-1.5 text-xs text-gray-600">
                      <div className="flex items-center gap-1.5">
                        <UserIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <span className="font-semibold text-gray-800">{authorName}</span>
                      </div>
                      {contactPhone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <a
                            href={`tel:${contactPhone}`}
                            className="text-blue-600 hover:underline font-medium"
                          >
                            {contactPhone}
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

                {/* Actions Bar */}
                <div className="p-4 pt-0 space-y-2">
                  {/* Approve button for staff (PENDING_REVIEW) */}
                  {item.type === 'AD' && item.status === 'PENDING_REVIEW' && isStaffRole && (
                    <button
                      onClick={() => handleApproveAd(item)}
                      disabled={actionInProgressId === item.id}
                      className="w-full inline-flex items-center justify-center px-3 py-2 border border-green-300 text-xs font-semibold rounded-lg text-white bg-green-600 hover:bg-green-700 transition shadow-sm disabled:opacity-50"
                    >
                      {actionInProgressId === item.id ? (
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      {t('communityBoard.approveAction')}
                    </button>
                  )}

                  {/* Confirm payment button (SUPERADMIN only, AWAITING_PAYMENT) */}
                  {item.type === 'AD' && item.status === 'AWAITING_PAYMENT' && isSuperadmin && (
                    <button
                      onClick={() => handleConfirmPaid(item)}
                      disabled={actionInProgressId === item.id}
                      className="w-full inline-flex items-center justify-center px-3 py-2 border border-sky-300 text-xs font-semibold rounded-lg text-white bg-sky-600 hover:bg-sky-700 transition shadow-sm disabled:opacity-50"
                    >
                      {actionInProgressId === item.id ? (
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" />
                      ) : (
                        <CreditCard className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      {t('communityBoard.confirmPaymentAction')}
                    </button>
                  )}

                  {/* Pin button (SUPERADMIN only, ACTIVE) */}
                  {item.type === 'AD' && item.status === 'ACTIVE' && isSuperadmin && (
                    <button
                      onClick={() => handleOpenPinModal(item)}
                      disabled={actionInProgressId === item.id}
                      className="w-full inline-flex items-center justify-center px-3 py-2 border border-amber-300 text-xs font-semibold rounded-lg text-amber-900 bg-amber-50 hover:bg-amber-100 transition shadow-sm"
                    >
                      <Pin className="w-3.5 h-3.5 mr-1.5" />
                      {t('communityBoard.pinAction')}
                    </button>
                  )}

                  {/* Moderate / Remove action */}
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

      {/* Pin Ad Modal */}
      {pinningListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Pin className="h-5 w-5 text-amber-600" />
                {t('communityBoard.pinModalTitle')}
              </h3>
              <button
                onClick={handleClosePinModal}
                className="text-gray-400 hover:text-gray-600 rounded-lg p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-sm text-gray-700 font-semibold">{pinningListing.title}</p>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('communityBoard.pinWeeksLabel')}
                </label>
                <select
                  value={pinWeeks}
                  onChange={(e) => setPinWeeks(parseInt(e.target.value, 10) || 1)}
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {[1, 2, 3, 4, 8, 12].map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </div>

              {modalError && (
                <p className="text-xs font-medium text-red-600 mt-1">{modalError}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={handleClosePinModal}
                disabled={submittingPin}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmPin}
                disabled={submittingPin}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {submittingPin && (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {t('communityBoard.pinConfirmBtn')}
              </button>
            </div>
          </div>
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

      {/* Add Ad Modal */}
      {showCreateAdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-indigo-600" />
                {t('communityBoard.addAdModalTitle')}
              </h3>
              <button
                onClick={() => setShowCreateAdModal(false)}
                className="text-gray-400 hover:text-gray-600 rounded-lg p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAdSubmit} className="space-y-4">
              {createAdError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {createAdError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('communityBoard.adBusinessNameLabel')} *
                </label>
                <input
                  type="text"
                  required
                  value={createAdBusinessName}
                  onChange={(e) => setCreateAdBusinessName(e.target.value)}
                  placeholder={t('communityBoard.adBusinessNamePlaceholder')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('communityBoard.adPhoneLabel')}
                </label>
                <input
                  type="tel"
                  value={createAdContactPhone}
                  onChange={(e) => setCreateAdContactPhone(e.target.value)}
                  placeholder={t('communityBoard.adPhonePlaceholder')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('communityBoard.titleLabel')} *
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={150}
                  value={createAdTitle}
                  onChange={(e) => setCreateAdTitle(e.target.value)}
                  placeholder={t('communityBoard.titleLabel')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('communityBoard.descLabel')} *
                </label>
                <textarea
                  required
                  rows={3}
                  value={createAdDescription}
                  onChange={(e) => setCreateAdDescription(e.target.value)}
                  placeholder={t('communityBoard.descLabel')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {t('communityBoard.adMonthsLabel')}
                  </label>
                  <select
                    value={createAdMonths}
                    onChange={(e) => setCreateAdMonths(parseInt(e.target.value, 10) || 1)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value={1}>{t('communityBoard.months1')}</option>
                    <option value={3}>{t('communityBoard.months3')}</option>
                    <option value={6}>{t('communityBoard.months6')}</option>
                    <option value={12}>{t('communityBoard.months12')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {t('communityBoard.priceLabel')}
                  </label>
                  <div className="h-9 px-3 flex items-center bg-gray-50 border border-gray-200 rounded-lg font-bold text-indigo-700 text-sm">
                    {t('communityBoard.adCalculatedPrice', {
                      price: calculatedFormPrice.toLocaleString(i18n.language),
                    })}
                  </div>
                </div>
              </div>

              {/* Photos upload with compression */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('communityBoard.adPhotosLabel')}
                </label>
                <div className="flex flex-wrap gap-2 items-center">
                  {createAdPhotos.map((url, idx) => (
                    <div
                      key={idx}
                      className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 group"
                    >
                      <img src={url} alt="Photo" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(url)}
                        className="absolute inset-0 bg-red-600/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  {createAdPhotos.length < 5 && (
                    <label className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 hover:border-indigo-500 flex flex-col items-center justify-center cursor-pointer transition text-gray-400 hover:text-indigo-600 bg-gray-50">
                      {uploadingPhoto ? (
                        <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <UploadCloud className="w-5 h-5 mb-0.5" />
                          <span className="text-[10px] font-medium">{t('communityBoard.photoCount')}</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploadingPhoto}
                        onChange={handlePhotoSelect}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowCreateAdModal(false)}
                  disabled={submittingCreateAd}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submittingCreateAd || uploadingPhoto}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {submittingCreateAd && (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  {t('communityBoard.addAdAction')}
                </button>
              </div>
            </form>
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
