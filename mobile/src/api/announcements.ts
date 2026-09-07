import { apiClient } from './client';

export interface AnnouncementItem {
  id: string;
  tenantId: string;
  authorId: string;
  title: string;
  content: string;
  isUrgent: boolean;
  createdAt: string;
  author: {
    firstName: string;
    lastName: string;
    role: string;
  };
}

export const AnnouncementsApi = {
  async getAnnouncements(tenantId: string): Promise<AnnouncementItem[]> {
    const res = await apiClient.get(`/announcements/tenant/${tenantId}`);
    return res.data;
  },
};
