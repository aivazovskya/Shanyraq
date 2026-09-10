import { apiClient } from './client';

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  body: string;
  data?: Record<string, any> | null;
  isRead: boolean;
  createdAt: string;
}

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

  async getNotifications(params?: { take?: number; skip?: number }): Promise<NotificationItem[]> {
    const res = await apiClient.get('/notifications', { params });
    return res.data;
  },

  async getUnreadCount(): Promise<{ count: number; unreadCount: number }> {
    const res = await apiClient.get('/notifications/unread-count');
    return res.data;
  },

  async markAsRead(id: string): Promise<NotificationItem> {
    const res = await apiClient.patch(`/notifications/${id}/read`);
    return res.data;
  },

  async markAllAsRead(): Promise<{ success: boolean; updated: number }> {
    const res = await apiClient.patch('/notifications/read-all');
    return res.data;
  },
};
