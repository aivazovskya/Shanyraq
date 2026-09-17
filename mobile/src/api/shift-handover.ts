import { apiClient } from './client';

export interface ShiftHandoverAuthor {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface ShiftHandoverNote {
  id: string;
  tenantId: string;
  authorId: string;
  content: string;
  createdAt: string;
  author: ShiftHandoverAuthor;
}

export const ShiftHandoverApi = {
  async getNotes(tenantId: string): Promise<ShiftHandoverNote[]> {
    const res = await apiClient.get<ShiftHandoverNote[]>(
      `/shift-handover/tenants/${tenantId}/notes`,
    );
    return res.data;
  },

  async createNote(tenantId: string, content: string): Promise<ShiftHandoverNote> {
    const res = await apiClient.post<ShiftHandoverNote>(
      `/shift-handover/tenants/${tenantId}/notes`,
      { content },
    );
    return res.data;
  },
};
