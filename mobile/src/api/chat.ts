import { apiClient } from './client';

export interface ChatMessageSender {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  text: string | null;
  photoUrl: string | null;
  createdAt: string;
  sender?: ChatMessageSender;
}

export interface ResidentUnit {
  unitNumber: string;
  building?: {
    blockName: string;
  };
}

export interface ConversationResident {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  ownerships?: Array<{
    unit?: ResidentUnit;
  }>;
}

export interface Conversation {
  id: string;
  tenantId: string;
  residentId: string;
  resident?: ConversationResident;
  lastReadByResidentAt: string | null;
  lastReadByStaffAt: string | null;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  lastMessage?: ChatMessage | null;
  unreadCount?: number;
  isResolved?: boolean;
  resolvedAt?: string | null;
  resolvedById?: string | null;
}

export const ChatApi = {
  async getMyConversation(): Promise<Conversation> {
    const res = await apiClient.get<Conversation>('/chat/my-conversation');
    return res.data;
  },

  async sendMessage(text?: string, photoUrl?: string): Promise<ChatMessage> {
    const res = await apiClient.post<ChatMessage>('/chat/my-conversation/messages', {
      text,
      photoUrl,
    });
    return res.data;
  },

  async getTenantConversations(tenantId: string, resolved?: boolean): Promise<Conversation[]> {
    const res = await apiClient.get<Conversation[]>(`/chat/tenants/${tenantId}/conversations`, {
      params: resolved !== undefined ? { resolved } : undefined,
    });
    return res.data;
  },

  async resolveConversation(id: string): Promise<Conversation> {
    const res = await apiClient.patch<Conversation>(`/chat/conversations/${id}/resolve`);
    return res.data;
  },

  async getConversationMessages(id: string): Promise<Conversation> {
    const res = await apiClient.get<Conversation>(`/chat/conversations/${id}/messages`);
    return res.data;
  },

  async sendStaffMessage(id: string, text?: string, photoUrl?: string): Promise<ChatMessage> {
    const res = await apiClient.post<ChatMessage>(`/chat/conversations/${id}/messages`, {
      text,
      photoUrl,
    });
    return res.data;
  },
};

