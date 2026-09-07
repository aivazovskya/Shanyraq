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
  ownershipType: 'OWNER' | 'TENANT';
  sharePercent?: number;
  verificationDoc?: string;
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
};
