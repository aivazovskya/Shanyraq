import { apiClient } from './client';

export type RequestStatus =
  | 'PENDING'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'REJECTED'
  | 'CLOSED';

export type RequestCategory =
  | 'PLUMBING'
  | 'ELECTRICAL'
  | 'ELEVATOR'
  | 'HEATING'
  | 'YARD_TERRITORY'
  | 'INTERCOM_ACCESS'
  | 'CLEANING'
  | 'OTHER';

export type RequestPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';

export interface RequestAttachment {
  id: string;
  fileUrl: string;
  fileType: string;
}

export interface RequestComment {
  id: string;
  authorId: string;
  text: string;
  createdAt: string;
  author: {
    firstName: string;
    lastName: string;
    role: string;
  };
}

export interface ServiceRequestItem {
  id: string;
  tenantId: string;
  unitId: string;
  creatorId: string;
  assigneeId?: string | null;
  title: string;
  description: string;
  category: RequestCategory;
  status: RequestStatus;
  priority: RequestPriority;
  rating?: number | null;
  feedback?: string | null;
  createdAt: string;
  updatedAt: string;
  unit?: {
    unitNumber: string;
    building?: {
      blockName: string;
    };
  };
  assignee?: {
    firstName: string;
    lastName: string;
    phone: string;
  } | null;
  attachments?: RequestAttachment[];
  comments?: RequestComment[];
}

export interface CreateServiceRequestDto {
  unitId: string;
  title: string;
  description: string;
  category: RequestCategory;
  priority: RequestPriority;
  attachmentUrls?: string[];
}

export const ServiceRequestsApi = {
  async getRequests(tenantId?: string): Promise<ServiceRequestItem[]> {
    const res = await apiClient.get('/service-requests', {
      params: tenantId ? { tenantId } : undefined,
    });
    return res.data;
  },

  async getRequestDetails(id: string): Promise<ServiceRequestItem> {
    const res = await apiClient.get(`/service-requests/${id}`);
    return res.data;
  },

  async createRequest(dto: CreateServiceRequestDto): Promise<ServiceRequestItem> {
    const res = await apiClient.post('/service-requests', dto);
    return res.data;
  },

  async addComment(requestId: string, text: string): Promise<RequestComment> {
    const res = await apiClient.post(`/service-requests/${requestId}/comments`, { text });
    return res.data;
  },

  async rateRequest(requestId: string, rating: number, feedback?: string): Promise<any> {
    const res = await apiClient.post(`/service-requests/${requestId}/rate`, { rating, feedback });
    return res.data;
  },
};
