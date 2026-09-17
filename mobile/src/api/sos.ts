import { apiClient } from './client';

export interface SosAlert {
  id: string;
  tenantId: string;
  unitId: string | null;
  triggeredById: string;
  latitude: number | null;
  longitude: number | null;
  status: 'ACTIVE' | 'RESOLVED' | 'FALSE_ALARM';
  resolvedById: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
  unit?: {
    id: string;
    unitNumber: string;
    building?: {
      id: string;
      blockName: string;
    };
  } | null;
  resolvedBy?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  triggeredBy?: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
  } | null;
}

export interface TriggerSosData {
  latitude?: number;
  longitude?: number;
}

export interface SosStatistics {
  totalAlerts: number;
  byStatus: {
    ACTIVE: number;
    RESOLVED: number;
    FALSE_ALARM: number;
  };
  averageResponseTimeMinutes: number;
  dailyTrend: Array<{ date: string; count: number }>;
}

export const sosApi = {
  triggerSos: async (data: TriggerSosData = {}): Promise<SosAlert> => {
    const res = await apiClient.post<SosAlert>('/sos', data);
    return res.data;
  },

  getMySosAlerts: async (): Promise<SosAlert[]> => {
    const res = await apiClient.get<SosAlert[]>('/sos/my');
    return res.data;
  },

  getTenantSosAlerts: async (tenantId: string): Promise<SosAlert[]> => {
    const res = await apiClient.get<SosAlert[]>(`/sos/tenants/${tenantId}`);
    return res.data;
  },

  getStatistics: async (tenantId: string): Promise<SosStatistics> => {
    const res = await apiClient.get<SosStatistics>(`/sos/tenants/${tenantId}/statistics`);
    return res.data;
  },

  resolveSosAlert: async (
    id: string,
    data: { status: 'RESOLVED' | 'FALSE_ALARM'; note?: string },
  ): Promise<SosAlert> => {
    const res = await apiClient.patch<SosAlert>(`/sos/${id}/resolve`, data);
    return res.data;
  },
};

