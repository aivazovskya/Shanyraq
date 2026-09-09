import { apiClient } from './client';

export type ListingType = 'SELL' | 'RENT' | 'GIVE_AWAY' | 'OTHER';
export type ListingStatus = 'ACTIVE' | 'CLOSED' | 'REMOVED';

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

export interface CreateListingData {
  type: ListingType;
  title: string;
  description: string;
  price?: number;
  photoUrls?: string[];
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
};
