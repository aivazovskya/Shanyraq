import { apiClient } from './client';

export interface TenantSearchResult {
  id: string;
  name: string;
  address: string;
  city: string;
  buildingsCount: number;
}

export interface UnitInfo {
  id: string;
  unitNumber: string;
  floor: number;
  entrance: number;
  type: string;
  area: number;
}

export interface BuildingStructure {
  id: string;
  blockName: string;
  floorsCount: number;
  entrancesCount: number;
  units: UnitInfo[];
}

export interface TenantStructureResponse {
  tenantId: string;
  tenantName: string;
  address: string;
  city: string;
  buildings: BuildingStructure[];
}

export interface ClaimOwnershipDto {
  unitId: string;
  ownershipType: 'OWNER' | 'TENANT' | 'FAMILY_MEMBER';
  sharePercent?: number;
  verificationDoc?: string;
}

export interface UnitResidentItem {
  id: string;
  userId: string;
  unitId: string;
  name?: string;
  phone?: string;
  status?: string;
  boundAt?: string;
  ownershipType: 'OWNER' | 'TENANT' | 'FAMILY_MEMBER';
  sharePercent?: number;
  isVerified: boolean;
  leaseEndDate?: string | null;
  isLeaseExpired?: boolean;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    role: string;
  };
  invitedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
  } | null;
}

export interface UnitInvitationItem {
  id: string;
  unitId: string;
  invitedById: string;
  phone: string;
  fullName?: string | null;
  ownershipType: 'TENANT' | 'FAMILY_MEMBER';
  leaseEndDate?: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  createdAt: string;
  expiresAt?: string;
  invitedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
  } | null;
}

export interface UnitResidentsResponse {
  unit: {
    id: string;
    unitNumber: string;
    floor: number;
    entrance: number;
    area: number;
    blockName: string;
    complexName: string;
  };
  residents: UnitResidentItem[];
  invitations: UnitInvitationItem[];
  totalCount: number;
  maxAllowed: number;
  maxLimit: number;
}

export interface InviteResidentDto {
  phone: string;
  fullName?: string;
  ownershipType: 'TENANT' | 'FAMILY_MEMBER';
  leaseEndDate?: string | null;
}

export const PropertiesApi = {
  async searchTenants(query?: string): Promise<TenantSearchResult[]> {
    const res = await apiClient.get('/properties/search', {
      params: query ? { query } : undefined,
    });
    return res.data;
  },

  async getTenantStructure(tenantId: string): Promise<TenantStructureResponse> {
    const res = await apiClient.get(`/properties/tenants/${tenantId}/structure`);
    return res.data;
  },

  async claimOwnership(dto: ClaimOwnershipDto): Promise<any> {
    const res = await apiClient.post('/properties/ownerships/claim', dto);
    return res.data;
  },

  async getUnitResidents(unitId: string): Promise<UnitResidentsResponse> {
    const res = await apiClient.get(`/properties/units/${unitId}/residents`);
    return res.data;
  },

  async inviteResident(unitId: string, dto: InviteResidentDto): Promise<UnitInvitationItem> {
    const res = await apiClient.post(`/properties/units/${unitId}/invitations`, dto);
    return res.data;
  },

  async revokeResident(unitId: string, ownershipId: string): Promise<{ success: boolean; message: string }> {
    const res = await apiClient.delete(`/properties/units/${unitId}/residents/${ownershipId}`);
    return res.data;
  },

  async revokeInvitation(unitId: string, invitationId: string): Promise<UnitInvitationItem> {
    const res = await apiClient.delete(`/properties/units/${unitId}/invitations/${invitationId}`);
    return res.data;
  },

  async extendLease(
    unitId: string,
    ownershipId: string,
    dto: { leaseEndDate?: string | null },
  ): Promise<UnitResidentItem> {
    const res = await apiClient.patch(`/properties/units/${unitId}/residents/${ownershipId}/lease`, dto);
    return res.data;
  },
};
