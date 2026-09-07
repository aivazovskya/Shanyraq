import { apiClient } from './client';

export const NotificationsApi = {
  async registerDevice(token: string, platform: 'ios' | 'android' | 'expo'): Promise<any> {
    const res = await apiClient.post('/notifications/register-device', {
      token,
      platform,
    });
    return res.data;
  },

  async unregisterDevice(token: string): Promise<any> {
    const res = await apiClient.post('/notifications/unregister-device', {
      token,
    });
    return res.data;
  },
};
