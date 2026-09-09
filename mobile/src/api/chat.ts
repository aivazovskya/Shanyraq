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

export interface Conversation {
  id: string;
  tenantId: string;
  residentId: string;
  lastReadByResidentAt: string | null;
  lastReadByStaffAt: string | null;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
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
};
