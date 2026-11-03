import { metersApi, MeterData } from '../src/api/meters';
import { BookingsApi, BookableResource } from '../src/api/bookings';
import { CommunityBoardApi, CommunityListing } from '../src/api/community-board';

/** Read fixtures for forms and empty/error states. Writes remain blocked. */
export function registerHouseholdFixtures() {
  const date = new Date().toISOString();
  const meters: MeterData[] = [
    { id: 'demo-cold', unitId: 'demo-unit', type: 'COLD_WATER', serialNumber: 'CW-004281', initialValue: 120, isActive: true, createdAt: date, readings: [{ id: 'demo-cold-reading', meterId: 'demo-cold', submittedById: 'demo-resident', value: 142.6, photoUrl: '', periodMonth: 10, periodYear: 2026, status: 'VERIFIED', createdAt: date }] },
    { id: 'demo-hot', unitId: 'demo-unit', type: 'HOT_WATER', serialNumber: 'HW-004282', initialValue: 80, isActive: true, createdAt: date, readings: [{ id: 'demo-hot-reading', meterId: 'demo-hot', submittedById: 'demo-resident', value: 96.2, photoUrl: '', periodMonth: 10, periodYear: 2026, status: 'REJECTED', reviewNote: 'На фотографии не видны последние цифры. Пришлите чёткое фото счётчика.', createdAt: date }] },
    { id: 'demo-electric', unitId: 'demo-unit', type: 'ELECTRICITY', serialNumber: 'EL-004283', initialValue: 2300, isActive: false, createdAt: date, readings: [] },
  ];
  metersApi.getUnitMeters = async unitId => unitId === 'demo-unit' ? meters : [];
  const resources: BookableResource[] = [
    { id: 'demo-bbq', tenantId: 'demo-tenant', name: 'Барбекю во дворе', type: 'BBQ_AREA', description: 'Стол под навесом и мангал для встреч с семьёй и соседями.', operatingHoursStart: '09:00', operatingHoursEnd: '22:00', maxDurationMinutes: 180, isActive: true, createdAt: date },
    { id: 'demo-coworking', tenantId: 'demo-tenant', name: 'Коворкинг · второй зал', type: 'COWORKING', description: 'Тихое рабочее пространство для жителей.', operatingHoursStart: '08:00', operatingHoursEnd: '21:00', maxDurationMinutes: 240, isActive: true, createdAt: date },
  ];
  BookingsApi.getResources = async () => resources;
  BookingsApi.getMyBookings = async () => [{ id: 'demo-booking', resourceId: resources[0].id, unitId: 'demo-unit', bookedById: 'demo-resident', startTime: '2026-10-20T09:00:00.000Z', endTime: '2026-10-20T11:00:00.000Z', status: 'CANCELLED', createdAt: date, resource: resources[0], note: 'Семейная встреча' }];
  BookingsApi.getMyWaitlist = async () => [];
  BookingsApi.getAvailability = async (resourceId, from) => {
    if (resourceId === 'demo-coworking') throw new Error('Демо: не удалось загрузить занятые интервалы');
    const start = new Date(from); start.setHours(14, 0, 0, 0);
    const end = new Date(start); end.setHours(16);
    return [{ startTime: start.toISOString(), endTime: end.toISOString() }];
  };
  const listings: CommunityListing[] = [
    { id: 'demo-listing-1', tenantId: 'demo-tenant', authorId: 'demo-neighbour', type: 'SELL', title: 'Детский велосипед в хорошем состоянии', description: 'Колёса 16 дюймов, дополнительные колёсики в комплекте. Можно посмотреть во дворе вечером.', price: 25000, photoUrls: [], status: 'ACTIVE', removedById: null, removedReason: null, createdAt: date, updatedAt: date, author: { id: 'demo-neighbour', firstName: 'Азамат', lastName: 'Нурланов', phone: '+77000000002', role: 'RESIDENT' } },
    { id: 'demo-listing-2', tenantId: 'demo-tenant', authorId: 'demo-neighbour-2', type: 'GIVE_AWAY', title: 'Отдам комнатные растения', description: 'Несколько горшков с молодыми растениями. Забрать можно в выходные.', price: null, photoUrls: [], status: 'ACTIVE', removedById: null, removedReason: null, createdAt: date, updatedAt: date },
  ];
  CommunityBoardApi.getListings = async (_tenant, type) => type ? listings.filter(item => item.type === type) : listings;
  CommunityBoardApi.getMyListings = async () => [{ ...listings[0], id: 'demo-listing-own', authorId: 'demo-resident', status: 'REMOVED', removedReason: 'Уточните описание товара и уберите повторяющееся объявление.' }];
}
