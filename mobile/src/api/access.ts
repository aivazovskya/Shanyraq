import { apiClient } from './client';

export interface AccessPoint {
  id: string;
  name: string;
  type: 'BARRIER' | 'GATE' | 'DOOR_INTERCOM' | 'CAMERA';
  ipAddress?: string;
  streamName?: string;
  isActive: boolean;
}

export interface StreamEndpoints {
  accessPointId: string;
  name: string;
  streamName: string;
  endpoints: {
    webrtcWs: string;
    hls: string;
    mp4: string;
    webPlayer: string;
  };
}

export interface GuestPass {
  id: string;
  unitId: string;
  guestName: string;
  guestPlateNumber?: string | null;
  accessCode: string;
  qrCodeUrl?: string | null;
  validFrom: string;
  validTo: string;
  isUsed: boolean;
  createdAt: string;
}

export interface CreateGuestPassDto {
  unitId: string;
  guestName: string;
  guestPlateNumber?: string;
  validFrom: string;
  validTo: string;
}

export const AccessApi = {
  async getAccessPoints(tenantId: string): Promise<AccessPoint[]> {
    const res = await apiClient.get(`/access/tenant/${tenantId}/points`);
    return res.data;
  },

  async openBarrier(accessPointId: string, unitId?: string): Promise<{ success: boolean; message: string; openedAt: string }> {
    const res = await apiClient.post('/access/open-barrier', {
      accessPointId,
      unitId,
    });
    return res.data;
  },

  async createGuestPass(dto: CreateGuestPassDto): Promise<GuestPass> {
    const res = await apiClient.post('/access/guest-pass', dto);
    return res.data;
  },

  async getCameraStream(pointId: string): Promise<StreamEndpoints> {
    const res = await apiClient.get(`/access/points/${pointId}/stream`);
    return res.data;
  },
};
