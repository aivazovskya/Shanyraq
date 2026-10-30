import { apiClient } from './client';

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

export interface CommunityListing {
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

export interface AdPricing {
  adPriceMonthly: number;
  adPinPriceWeekly: number;
  adTrialDays: number;
}

export interface CreateListingData {
  type: ListingType;
  title: string;
  description: string;
  price?: number;
  photoUrls?: string[];
  adBusinessName?: string;
  adContactPhone?: string;
  adMonths?: number;
}

export interface UpdateListingData {
  title?: string;
  description?: string;
  price?: number;
  photoUrls?: string[];
  status?: ListingStatus;
}

export const CommunityBoardApi = {
  async getListings(tenantId: string, type?: ListingType): Promise<CommunityListing[]> {
    const res = await apiClient.get<CommunityListing[]>(
      `/community-board/tenants/${tenantId}/listings`,
      {
        params: type ? { type } : undefined,
      },
    );
    return res.data;
  },

  async createListing(tenantId: string, data: CreateListingData): Promise<CommunityListing> {
    const res = await apiClient.post<CommunityListing>(
      `/community-board/tenants/${tenantId}/listings`,
      data,
    );
    return res.data;
  },

  async updateListing(id: string, data: UpdateListingData): Promise<CommunityListing> {
    const res = await apiClient.patch<CommunityListing>(
      `/community-board/listings/${id}`,
      data,
    );
    return res.data;
  },

  async getMyListings(): Promise<CommunityListing[]> {
    const res = await apiClient.get<CommunityListing[]>('/community-board/my-listings');
    return res.data;
  },

  async updatePhoneVisibility(hidePhoneInListings: boolean): Promise<{ hidePhoneInListings: boolean }> {
    const res = await apiClient.patch<{ hidePhoneInListings: boolean }>(
      '/community-board/my-phone-visibility',
      { hidePhoneInListings },
    );
    return res.data;
  },

  async getAdPricing(tenantId: string): Promise<AdPricing> {
    const res = await apiClient.get<AdPricing>(`/community-board/tenants/${tenantId}/ad-pricing`);
    return res.data;
  },
};
