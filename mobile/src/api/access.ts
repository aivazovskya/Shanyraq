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

export type GuestPassStatus = 'ACTIVE' | 'REVOKED' | 'USED' | 'EXPIRED';

export interface GuestPass {
  id: string;
  unitId: string;
  creatorId?: string;
  guestName: string;
  guestPlateNumber?: string | null;
  accessCode: string;
  qrCodeUrl?: string | null;
  validFrom: string;
  validTo: string;
  isUsed: boolean;
  isRevoked?: boolean;
  revokedAt?: string | null;
  revokedById?: string | null;
  status?: GuestPassStatus;
  createdAt: string;
  creator?: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  } | null;
  revokedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  } | null;
  unit?: {
    id: string;
    unitNumber: string;
    building?: {
      id: string;
      blockName: string;
    } | null;
  } | null;
}

export interface CreateGuestPassDto {
  unitId: string;
  guestName: string;
  guestPlateNumber?: string;
  validFrom: string;
  validTo: string;
}

export interface AccessLogItem {
  id: string;
  accessPointId: string;
  userId?: string | null;
  unitId?: string | null;
  action: string;
  status: string;
  note?: string | null;
  createdAt: string;
  accessPoint: AccessPoint;
  user?: {
    firstName: string;
    lastName: string;
    phone: string;
  } | null;
  unit?: {
    id: string;
    unitNumber: string;
    building?: {
      id: string;
      blockName: string;
    } | null;
  } | null;
}

export const AccessApi = {
  async getAccessPoints(tenantId: string): Promise<AccessPoint[]> {
    const res = await apiClient.get(`/access/tenant/${tenantId}/points`);
    return res.data;
  },

  async openBarrier(accessPointId: string, pin: string, unitId?: string): Promise<{ success: boolean; message: string; openedAt: string }> {
    const res = await apiClient.post('/access/open-barrier', {
      accessPointId,
      pin,
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

  async getAccessLogs(tenantId: string): Promise<AccessLogItem[]> {
    const res = await apiClient.get(`/access/tenant/${tenantId}/logs`);
    return res.data;
  },

  async getUnitGuestPasses(unitId: string): Promise<GuestPass[]> {
    const res = await apiClient.get(`/access/units/${unitId}/guest-passes`);
    return res.data;
  },

  async getTenantGuestPasses(tenantId: string): Promise<GuestPass[]> {
    const res = await apiClient.get(`/access/tenant/${tenantId}/guest-passes`);
    return res.data;
  },

  async revokeGuestPass(id: string): Promise<GuestPass> {
    const res = await apiClient.patch(`/access/guest-passes/${id}/revoke`);
    return res.data;
  },
};

