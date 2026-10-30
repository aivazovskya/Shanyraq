import { apiRequest } from './api';

// ==========================================
// Types
// ==========================================

export interface UserUnit {
  id: string;
  unitNumber: string;
  floor: number;
  entrance: number;
  type: string;
  area: number;
  cadastralNumber?: string;
  building: {
    id: string;
    blockName: string;
    tenantId?: string;
  };
}

export interface UserOwnership {
  id: string;
  unitId: string;
  ownershipType: 'OWNER' | 'TENANT' | 'FAMILY_MEMBER';
  sharePercent: number;
  isVerified: boolean;
  verificationDoc?: string | null;
  leaseEndDate?: string | null;
  invitedById?: string | null;
  invitedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
  } | null;
  unit: UserUnit;
}

export interface UnitResidentItem {
  id: string;
  userId: string;
  unitId: string;
  name?: string;
  phone?: string;
  status?: string;
  boundAt?: string;
  ownershipType: 'OWNER' | 'TENANT' | 'FAMILY_MEMBER';
  sharePercent?: number;
  isVerified: boolean;
  leaseEndDate?: string | null;
  isLeaseExpired?: boolean;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    role: string;
  };
  invitedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
  } | null;
}

export interface UnitInvitationItem {
  id: string;
  unitId: string;
  invitedById: string;
  phone: string;
  fullName?: string | null;
  ownershipType: 'TENANT' | 'FAMILY_MEMBER';
  leaseEndDate?: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  createdAt: string;
  expiresAt?: string;
  invitedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
  } | null;
}

export interface UnitResidentsResponse {
  unit: {
    id: string;
    unitNumber: string;
    floor: number;
    entrance: number;
    area: number;
    blockName: string;
    complexName: string;
  };
  residents: UnitResidentItem[];
  invitations: UnitInvitationItem[];
  totalCount: number;
  maxAllowed: number;
  maxLimit: number;
}

export interface ResidentProfile {
  id: string;
  phone: string;
  email?: string | null;
  firstName: string;
  lastName: string;
  iin?: string;
  role: string;
  tenantId?: string | null;
  tenantName?: string | null;
  tenant?: {
    id: string;
    name: string;
    address: string;
    city: string;
    totalArea?: number;
    totalUnitsCount?: number;
  } | null;
  isVerified: boolean;
  ownerships: UserOwnership[];
  hidePhoneInListings?: boolean;
}

export interface PersonalAccount {
  id: string;
  accountNumber: string;
  balance: number;
  createdAt: string;
  updatedAt: string;
  charges: Array<{
    id: string;
    periodMonth: number;
    periodYear: number;
    amount: number;
    createdAt: string;
    tariffItem: {
      id: string;
      name: string;
      calculationMethod: 'FLAT' | 'PER_AREA';
      rate: number;
    };
  }>;
  payments: Array<{
    id: string;
    amount: number;
    method: string;
    note: string | null;
    paidAt: string;
  }>;
  unit: UserUnit;
}

export interface TransparencyExpenseCategoryItem {
  category: string;
  amount: number;
  plannedAmount?: number;
  percentageOfTotal?: number;
}

export interface TransparencyRecentExpenseItem {
  id: string;
  date: string;
  category: string;
  amount: number;
  description?: string | null;
  counterparty?: string | null;
}

export interface TransparencyReport {
  periodMonth: number;
  periodYear: number;
  totalCharged: number;
  totalCollected: number;
  collectionRatePercent: number;
  byTariff: Array<{
    tariffId: string;
    tariffName: string;
    amount: number;
  }>;
  totalExpenses: number;
  totalPlannedExpenses?: number;
  byExpenseCategory: TransparencyExpenseCategoryItem[];
  recentExpenses?: TransparencyRecentExpenseItem[];
  netBalance: number;
}

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
    building?: { blockName: string };
  };
  assignee?: {
    id?: string;
    firstName: string;
    lastName: string;
    phone?: string;
  } | null;
  attachments?: Array<{ id: string; fileUrl: string; fileType: string }>;
  comments?: Array<{
    id: string;
    authorId: string;
    text: string;
    createdAt: string;
    author: {
      firstName: string;
      lastName: string;
      role: string;
    };
  }>;
}

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
  usedAt?: string | null;
  isRevoked?: boolean;
  revokedAt?: string | null;
  createdAt: string;
  unit?: {
    unitNumber: string;
    building?: { blockName: string };
  };
}

export interface MeterReading {
  id: string;
  meterId: string;
  submittedById: string;
  value: number;
  photoUrl: string;
  periodMonth: number;
  periodYear: number;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  reviewNote?: string | null;
  createdAt: string;
}

export interface MeterData {
  id: string;
  unitId: string;
  type: 'COLD_WATER' | 'HOT_WATER' | 'ELECTRICITY' | 'OTHER';
  serialNumber?: string | null;
  initialValue: number;
  isActive: boolean;
  createdAt: string;
  readings: MeterReading[];
}

export interface AgendaItem {
  id: string;
  title?: string;
  question?: string;
  description?: string;
  decisionType: 'SIMPLE_MAJORITY' | 'QUALIFIED_MAJORITY';
  votesSummary?: {
    forArea: number;
    againstArea: number;
    abstainArea: number;
    forPercent: number;
    againstPercent: number;
    abstainPercent: number;
  };
  myVote?: {
    choice: 'FOR' | 'AGAINST' | 'ABSTAIN';
    votedAt?: string;
    areaWeight: number;
  } | null;
}

export interface MeetingItem {
  id: string;
  tenantId: string;
  title: string;
  description?: string;
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  startDate: string;
  endDate: string;
  totalTenantArea: number;
  participatedArea: number;
  quorumPercent: number;
  isQuorumReached: boolean;
  agendaItems: AgendaItem[];
}

/** The API nests quorum figures under `quorum`; the UI reads them as flat fields. */
export function normalizeMeeting(raw: any): MeetingItem {
  const q = raw?.quorum ?? {};
  return {
    ...raw,
    totalTenantArea: raw?.totalTenantArea ?? q.totalEligibleArea ?? 0,
    participatedArea: raw?.participatedArea ?? q.totalVotedArea ?? 0,
    quorumPercent: raw?.quorumPercent ?? q.quorumPercent ?? 0,
    isQuorumReached: raw?.isQuorumReached ?? q.isQuorumAchieved ?? false,
  };
}

export interface BookableResource {
  id: string;
  tenantId: string;
  name: string;
  type: 'BBQ_AREA' | 'COWORKING' | 'GUEST_PARKING' | 'KIDS_ROOM' | 'OTHER';
  description?: string | null;
  operatingHoursStart?: string | null;
  operatingHoursEnd?: string | null;
  maxDurationMinutes?: number | null;
  isActive: boolean;
}

export interface Booking {
  id: string;
  resourceId: string;
  unitId: string;
  bookedById: string;
  startTime: string;
  endTime: string;
  status: 'CONFIRMED' | 'CANCELLED';
  note?: string | null;
  createdAt: string;
  resource?: BookableResource;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  text: string | null;
  photoUrl: string | null;
  createdAt: string;
  sender?: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  };
}

export interface ChatConversation {
  id: string;
  tenantId: string;
  residentId: string;
  lastReadByResidentAt: string | null;
  lastReadByStaffAt: string | null;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  unreadCount?: number;
  isResolved?: boolean;
}

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

export interface CommunityListing {
  id: string;
  tenantId: string;
  authorId: string;
  type: 'SELL' | 'RENT' | 'GIVE_AWAY' | 'OTHER';
  title: string;
  description: string;
  price: number | null;
  photoUrls: string[];
  status: 'ACTIVE' | 'CLOSED' | 'REMOVED' | 'ARCHIVED';
  createdAt: string;
  author?: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
  };
}

export interface SosAlert {
  id: string;
  tenantId: string;
  unitId: string | null;
  triggeredById: string;
  latitude: number | null;
  longitude: number | null;
  status: 'ACTIVE' | 'RESOLVED' | 'FALSE_ALARM';
  acceptedAt?: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
  acceptedBy?: { firstName: string; lastName: string } | null;
  resolvedBy?: { firstName: string; lastName: string } | null;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  body: string;
  data?: Record<string, any> | null;
  isRead: boolean;
  createdAt: string;
}

// ==========================================
// Cabinet API Client
// ==========================================

export const CabinetApi = {
  // Profile & Auth
  async getMe(): Promise<ResidentProfile> {
    return apiRequest<ResidentProfile>('/auth/me');
  },

  async getPinStatus(): Promise<{ isPinSet: boolean }> {
    return apiRequest<{ isPinSet: boolean }>('/auth/pin/status');
  },

  async setPin(newPin: string, currentPin?: string): Promise<{ success: boolean; message: string }> {
    return apiRequest('/auth/pin/set', {
      method: 'POST',
      body: JSON.stringify({ newPin, currentPin }),
    });
  },

  async requestPinReset(): Promise<{ success: boolean; message: string; devCode?: string }> {
    return apiRequest('/auth/pin/reset-request', { method: 'POST' });
  },

  async confirmPinReset(otpCode: string, newPin: string): Promise<{ success: boolean; message: string }> {
    return apiRequest('/auth/pin/reset-confirm', {
      method: 'POST',
      body: JSON.stringify({ otpCode, newPin }),
    });
  },

  // Finance
  async getMyAccounts(): Promise<PersonalAccount[]> {
    return apiRequest<PersonalAccount[]>('/finance/my-accounts');
  },

  async getTransparencyReport(
    tenantId: string,
    params?: { month?: number; year?: number },
  ): Promise<TransparencyReport> {
    const q = params ? `?month=${params.month || ''}&year=${params.year || ''}` : '';
    return apiRequest<TransparencyReport>(`/finance/tenants/${tenantId}/transparency-report${q}`);
  },

  async downloadTransparencyReportCsv(
    tenantId: string,
    params?: { month?: number; year?: number },
  ): Promise<void> {
    const { apiDownload } = await import('@/lib/api');
    const m = params?.month || (new Date().getMonth() + 1);
    const y = params?.year || new Date().getFullYear();
    const filename = `transparency-report-${tenantId}-${y}-${String(m).padStart(2, '0')}.csv`;
    await apiDownload(`/finance/tenants/${tenantId}/transparency-report/export?month=${m}&year=${y}`, filename);
  },

  // Requests
  async getRequests(status?: string): Promise<ServiceRequestItem[]> {
    const q = status && status !== 'ALL' ? `?status=${status}` : '';
    return apiRequest<ServiceRequestItem[]>(`/service-requests${q}`);
  },

  async getRequestDetails(id: string): Promise<ServiceRequestItem> {
    return apiRequest<ServiceRequestItem>(`/service-requests/${id}`);
  },

  async createRequest(data: {
    unitId: string;
    title: string;
    description: string;
    category: RequestCategory;
    priority: RequestPriority;
    attachmentUrls?: string[];
  }): Promise<ServiceRequestItem> {
    return apiRequest<ServiceRequestItem>('/service-requests', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async addRequestComment(requestId: string, text: string): Promise<any> {
    return apiRequest(`/service-requests/${requestId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  },

  async rateRequest(requestId: string, rating: number, feedback?: string): Promise<any> {
    return apiRequest(`/service-requests/${requestId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating, feedback }),
    });
  },

  // Access
  async getAccessPoints(tenantId: string): Promise<any[]> {
    return apiRequest(`/access/tenant/${tenantId}/points`);
  },

  async openBarrier(accessPointId: string, pin: string, unitId?: string): Promise<any> {
    return apiRequest('/access/open-barrier', {
      method: 'POST',
      body: JSON.stringify({ accessPointId, pin, unitId }),
    });
  },

  async getUnitGuestPasses(unitId: string): Promise<GuestPass[]> {
    return apiRequest<GuestPass[]>(`/access/units/${unitId}/guest-passes`);
  },

  async createGuestPass(data: {
    unitId: string;
    guestName: string;
    guestPlateNumber?: string;
    validFrom: string;
    validTo: string;
  }): Promise<GuestPass> {
    return apiRequest<GuestPass>('/access/guest-pass', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async revokeGuestPass(id: string): Promise<GuestPass> {
    return apiRequest<GuestPass>(`/access/guest-passes/${id}/revoke`, {
      method: 'PATCH',
    });
  },

  // Meters
  async getUnitMeters(unitId: string): Promise<MeterData[]> {
    return apiRequest<MeterData[]>(`/meters/units/${unitId}`);
  },

  async getMeterReadings(meterId: string): Promise<MeterReading[]> {
    return apiRequest<MeterReading[]>(`/meters/${meterId}/readings`);
  },

  async uploadFile(file: File, category: 'media' | 'document' = 'media'): Promise<{ url: string; key: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return apiRequest<{ url: string; key: string }>(`/uploads?category=${category}`, {
      method: 'POST',
      body: formData,
    });
  },

  async submitReading(
    meterId: string,
    payload: { value: number; photoUrl: string; month: number; year: number },
  ): Promise<MeterReading> {
    return apiRequest<MeterReading>(`/meters/${meterId}/readings`, {
      method: 'POST',
      body: JSON.stringify({
        value: payload.value,
        photoUrl: payload.photoUrl,
        month: payload.month,
        year: payload.year,
      }),
    });
  },

  // Votings
  async getMeetings(tenantId: string): Promise<MeetingItem[]> {
    const list = await apiRequest<any[]>(`/votings/tenant/${tenantId}`);
    return (list || []).map(normalizeMeeting);
  },

  async getMeetingDetails(meetingId: string): Promise<MeetingItem> {
    return normalizeMeeting(await apiRequest<any>(`/votings/${meetingId}`));
  },

  async castVote(data: {
    agendaItemId: string;
    unitId: string;
    choice: 'FOR' | 'AGAINST' | 'ABSTAIN';
    otpCode?: string;
  }): Promise<any> {
    return apiRequest('/votings/vote', {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        otpCode: data.otpCode || '0000',
      }),
    });
  },

  // Bookings
  async getResources(tenantId: string): Promise<BookableResource[]> {
    return apiRequest<BookableResource[]>(`/bookings/tenants/${tenantId}/resources`);
  },

  async getAvailability(resourceId: string, from: string, to: string): Promise<any[]> {
    return apiRequest(`/bookings/resources/${resourceId}/availability?from=${from}&to=${to}`);
  },

  async createBooking(
    resourceId: string,
    data: { startTime: string; endTime: string; note?: string },
  ): Promise<Booking> {
    return apiRequest<Booking>(`/bookings/resources/${resourceId}/bookings`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getMyBookings(): Promise<Booking[]> {
    return apiRequest<Booking[]>('/bookings/my-bookings');
  },

  async cancelBooking(id: string): Promise<Booking> {
    return apiRequest<Booking>(`/bookings/${id}/cancel`, {
      method: 'PATCH',
    });
  },

  // Chat
  async getMyConversation(): Promise<ChatConversation> {
    return apiRequest<ChatConversation>('/chat/my-conversation');
  },

  async sendChatMessage(text?: string, photoUrl?: string): Promise<ChatMessage> {
    return apiRequest<ChatMessage>('/chat/my-conversation/messages', {
      method: 'POST',
      body: JSON.stringify({ text, photoUrl }),
    });
  },

  // Announcements
  async getAnnouncements(tenantId: string): Promise<AnnouncementItem[]> {
    return apiRequest<AnnouncementItem[]>(`/announcements/tenant/${tenantId}`);
  },

  // Community Board
  async getListings(tenantId: string, type?: string): Promise<CommunityListing[]> {
    const q = type && type !== 'ALL' ? `?type=${type}` : '';
    return apiRequest<CommunityListing[]>(`/community-board/tenants/${tenantId}/listings${q}`);
  },

  async getMyListings(): Promise<CommunityListing[]> {
    return apiRequest<CommunityListing[]>('/community-board/my-listings');
  },

  async createListing(
    tenantId: string,
    data: {
      type: string;
      title: string;
      description: string;
      price?: number;
      photoUrls?: string[];
    },
  ): Promise<CommunityListing> {
    return apiRequest<CommunityListing>(`/community-board/tenants/${tenantId}/listings`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async closeListing(id: string): Promise<any> {
    return apiRequest(`/community-board/listings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'CLOSED' }),
    });
  },

  // Notifications
  async getNotifications(params?: { take?: number; skip?: number }): Promise<NotificationItem[]> {
    const q = params ? `?take=${params.take || 20}&skip=${params.skip || 0}` : '';
    return apiRequest<NotificationItem[]>(`/notifications${q}`);
  },

  async getUnreadCount(): Promise<{ count: number; unreadCount: number }> {
    return apiRequest<{ count: number; unreadCount: number }>('/notifications/unread-count');
  },

  async markNotificationRead(id: string): Promise<any> {
    return apiRequest(`/notifications/${id}/read`, { method: 'PATCH' });
  },

  async markAllNotificationsRead(): Promise<any> {
    return apiRequest('/notifications/read-all', { method: 'PATCH' });
  },

  // SOS
  async triggerSos(data: { latitude?: number; longitude?: number } = {}): Promise<SosAlert> {
    return apiRequest<SosAlert>('/sos', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getMySosAlerts(): Promise<SosAlert[]> {
    return apiRequest<SosAlert[]>('/sos/my');
  },

  // Properties / Onboarding
  async searchTenants(query?: string): Promise<any[]> {
    const q = query ? `?query=${encodeURIComponent(query)}` : '';
    return apiRequest(`/properties/search${q}`);
  },

  async getTenantStructure(tenantId: string): Promise<any> {
    return apiRequest(`/properties/tenants/${tenantId}/structure`);
  },

  async claimOwnership(dto: {
    unitId: string;
    ownershipType: 'OWNER' | 'TENANT' | 'FAMILY_MEMBER';
    sharePercent?: number;
    verificationDoc?: string;
  }): Promise<any> {
    return apiRequest('/properties/ownerships/claim', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  // Residents & Invitations (Task 0022)
  async getUnitResidents(unitId: string): Promise<UnitResidentsResponse> {
    return apiRequest(`/properties/units/${unitId}/residents`);
  },

  async inviteResident(unitId: string, dto: {
    phone: string;
    fullName?: string;
    ownershipType: 'TENANT' | 'FAMILY_MEMBER';
    leaseEndDate?: string | null;
  }): Promise<UnitInvitationItem> {
    return apiRequest(`/properties/units/${unitId}/invitations`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async revokeResident(unitId: string, ownershipId: string): Promise<{ success: boolean; message: string }> {
    return apiRequest(`/properties/units/${unitId}/residents/${ownershipId}`, {
      method: 'DELETE',
    });
  },

  async revokeInvitation(unitId: string, invitationId: string): Promise<UnitInvitationItem> {
    return apiRequest(`/properties/units/${unitId}/invitations/${invitationId}`, {
      method: 'DELETE',
    });
  },

  async extendLease(unitId: string, ownershipId: string, dto: { leaseEndDate?: string | null }): Promise<UnitResidentItem> {
    return apiRequest(`/properties/units/${unitId}/residents/${ownershipId}/lease`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  },
};
