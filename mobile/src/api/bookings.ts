import { apiClient } from './client';

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
  createdAt: string;
}

export interface AvailabilitySlot {
  startTime: string;
  endTime: string;
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
  unit?: {
    id: string;
    unitNumber: string;
    building?: {
      id: string;
      blockName: string;
    };
  };
}

export interface CreateBookingData {
  startTime: string;
  endTime: string;
  note?: string;
}

export const BookingsApi = {
  async getResources(tenantId: string): Promise<BookableResource[]> {
    const res = await apiClient.get<BookableResource[]>(`/bookings/tenants/${tenantId}/resources`);
    return res.data;
  },

  async getAvailability(resourceId: string, from: string, to: string): Promise<AvailabilitySlot[]> {
    const res = await apiClient.get<AvailabilitySlot[]>(`/bookings/resources/${resourceId}/availability`, {
      params: { from, to },
    });
    return res.data;
  },

  async createBooking(resourceId: string, data: CreateBookingData): Promise<Booking> {
    const res = await apiClient.post<Booking>(`/bookings/resources/${resourceId}/bookings`, data);
    return res.data;
  },

  async getMyBookings(): Promise<Booking[]> {
    const res = await apiClient.get<Booking[]>('/bookings/my-bookings');
    return res.data;
  },

  async cancelBooking(id: string): Promise<Booking> {
    const res = await apiClient.patch<Booking>(`/bookings/${id}/cancel`);
    return res.data;
  },
};
