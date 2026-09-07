import { apiClient } from './client';

export interface UserOwnership {
  id: string;
  unitId: string;
  ownershipType: 'OWNER' | 'TENANT' | 'FAMILY_MEMBER';
  sharePercent: number;
  isVerified: boolean;
  verificationDoc?: string | null;
  unit: {
    id: string;
    unitNumber: string;
    floor: number;
    entrance: number;
    type: string;
    area: number;
    building: {
      id: string;
      blockName: string;
    };
  };
}

export interface UserProfile {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  role: string;
  tenantId?: string | null;
  tenant?: {
    id: string;
    name: string;
    address: string;
    city: string;
  } | null;
  isVerified: boolean;
  ownerships: UserOwnership[];
}

export interface AuthTokensResponse {
  user: UserProfile;
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export const AuthApi = {
  async requestOtp(phone: string): Promise<{ success: boolean; message: string; devCode?: string }> {
    const res = await apiClient.post('/auth/request-otp', { phone });
    return res.data;
  },

  async verifyOtp(phone: string, code: string): Promise<AuthTokensResponse> {
    const res = await apiClient.post('/auth/verify-otp', { phone, code });
    return res.data;
  },

  async getMe(): Promise<UserProfile> {
    const res = await apiClient.get('/auth/me');
    return res.data;
  },

  async logout(): Promise<{ success: boolean; message: string }> {
    const res = await apiClient.post('/auth/logout');
    return res.data;
  },
};
