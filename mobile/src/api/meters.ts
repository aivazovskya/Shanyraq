import { apiClient } from './client';

export type MeterType = 'COLD_WATER' | 'HOT_WATER' | 'ELECTRICITY' | 'OTHER';
export type ReadingStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface MeterReading {
  id: string;
  meterId: string;
  submittedById: string;
  value: number;
  photoUrl: string;
  periodMonth: number;
  periodYear: number;
  status: ReadingStatus;
  reviewedById?: string | null;
  reviewNote?: string | null;
  createdAt: string;
}

export interface MeterData {
  id: string;
  unitId: string;
  type: MeterType;
  serialNumber?: string | null;
  initialValue: number;
  isActive: boolean;
  createdAt: string;
  readings: MeterReading[];
}

export interface SubmitReadingPayload {
  value: number;
  photoUrl: string;
  month: number;
  year: number;
}

export const metersApi = {
  getUnitMeters: async (unitId: string): Promise<MeterData[]> => {
    const res = await apiClient.get<MeterData[]>(`/meters/units/${unitId}`);
    return res.data;
  },

  submitReading: async (meterId: string, payload: SubmitReadingPayload): Promise<MeterReading> => {
    const res = await apiClient.post<MeterReading>(`/meters/${meterId}/readings`, payload);
    return res.data;
  },

  getMeterReadings: async (meterId: string): Promise<MeterReading[]> => {
    const res = await apiClient.get<MeterReading[]>(`/meters/${meterId}/readings`);
    return res.data;
  },
};
