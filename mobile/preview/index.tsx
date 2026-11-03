import { registerStaffFixtures } from './staff-fixtures';
import { registerPropertyFixtures } from './property-fixtures';
import { registerReportFixtures } from './report-fixtures';
import { registerHouseholdFixtures } from './household-fixtures';
import { registerExtraFixtures } from './extra-fixtures';
// Standalone fixture entry. Never imported by the production application.
import React from 'react';
import { View, Text } from 'react-native';
import { registerRootComponent } from 'expo';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isStaffUser, AuthContext } from '../src/context/AuthContext';
import { RootNavigator } from '../src/navigation/RootNavigator';
import { apiClient } from '../src/api/client';
import { ServiceRequestsApi, ServiceRequestItem } from '../src/api/service-requests';
import { VotingsApi } from '../src/api/votings';
import { AnnouncementsApi } from '../src/api/announcements';
import { NotificationsApi } from '../src/api/notifications';
import { financeApi, PersonalAccountData } from '../src/api/finance';
import { UserProfile } from '../src/api/auth';
import '../src/i18n';

// Fail closed: this gallery cannot send requests or mutate real data.
apiClient.interceptors.request.use(() => {
  const failure = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('failure') : null;
  if (failure === 'offline' || failure === 'timeout') {
    throw Object.assign(new Error('Synthetic transport failure'), { code: failure === 'offline' ? 'ERR_NETWORK' : 'ECONNABORTED' });
  }
  throw new Error('Демо-превью: действие недоступно');
});
const date = '2026-11-02T10:00:00.000Z';
const unit = { id: 'demo-unit', unitNumber: '42', area: 68, floor: 5, entrance: 2, type: 'APARTMENT', building: { id: 'demo-building', blockName: 'Блок A', tenantId: 'demo-tenant' } };
const user: UserProfile = { id: 'demo-resident', phone: '+77000000000', firstName: 'Алия', lastName: 'Серикова', role: 'RESIDENT', tenantId: 'demo-tenant', tenant: { id: 'demo-tenant', name: 'ЖК Shanyraq', address: 'Демонстрационный адрес', city: 'Астана' }, isVerified: true, ownerships: [{ id: 'demo-owner', unitId: unit.id, ownershipType: 'OWNER', sharePercent: 100, isVerified: true, unit }] };
const previewRole = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('role') : null;
if (isStaffUser(previewRole)) { user.role = previewRole!; user.firstName = 'Дана'; user.lastName = 'Ахметова'; }
user.ownerships.push({ ...user.ownerships[0], id: 'demo-owner-2', unitId: 'demo-unit-2', unit: { ...unit, id: 'demo-unit-2', unitNumber: '17', building: { ...unit.building, blockName: 'Блок B' } } });
const requests: ServiceRequestItem[] = [
  { id: 'demo-1', tenantId: 'demo-tenant', unitId: unit.id, creatorId: user.id, title: 'Не работает освещение в подъезде', description: 'На пятом этаже перегорели лампы у лифта. Просьба заменить освещение.', category: 'ELECTRICAL', priority: 'MEDIUM', status: 'IN_PROGRESS', createdAt: date, updatedAt: date },
  { id: 'demo-2', tenantId: 'demo-tenant', unitId: unit.id, creatorId: user.id, title: 'Протекает труба в общем коридоре', description: 'Возле технического помещения появилась вода.', category: 'PLUMBING', priority: 'HIGH', status: 'PENDING', createdAt: date, updatedAt: date },
  { id: 'demo-3', tenantId: 'demo-tenant', unitId: unit.id, creatorId: user.id, title: 'Отрегулировать доводчик двери', description: 'Дверь снова закрывается плавно. Спасибо мастеру!', category: 'OTHER', priority: 'MEDIUM', status: 'RESOLVED', createdAt: date, updatedAt: date },
];
ServiceRequestsApi.getRequests = async () => requests;
VotingsApi.getMeetings = async () => [];
AnnouncementsApi.getAnnouncements = async () => [{ id: 'demo-news', tenantId: 'demo-tenant', authorId: 'demo-admin', title: 'Уборка двора в субботу', content: 'Приглашаем соседей на совместную уборку. Инвентарь предоставит управляющая компания.', isUrgent: false, createdAt: date, author: { firstName: 'Управляющая', lastName: 'компания', role: 'HOA_ADMIN' } }];
NotificationsApi.getUnreadCount = async () => ({ count: 0, unreadCount: 0 });
const accounts: PersonalAccountData[] = [
  { id: 'demo-account-1', accountNumber: 'SH-000042', balance: -12450, createdAt: date, updatedAt: date, unit, charges: [{ id: 'demo-charge', periodMonth: 11, periodYear: 2026, amount: 12450, createdAt: date, tariffItem: { id: 'demo-tariff', name: 'Содержание общего имущества', calculationMethod: 'FLAT', rate: 12450, isActive: true } }], payments: [{ id: 'demo-payment', amount: 12450, method: 'BANK_TRANSFER', note: null, paidAt: date }] },
  { id: 'demo-account-2', accountNumber: 'SH-000017', balance: 3600, createdAt: date, updatedAt: date, unit: { ...unit, id: 'demo-unit-2', unitNumber: '17', building: { ...unit.building, blockName: 'Блок B' } }, charges: [], payments: [] },
];
financeApi.getMyAccounts = async () => accounts;
registerExtraFixtures(user, requests);
registerHouseholdFixtures();
registerReportFixtures();
registerPropertyFixtures();
registerStaffFixtures();
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Preview() {
  return <SafeAreaProvider><QueryClientProvider client={client}><AuthContext.Provider value={{ user, isLoading: false, isAuthenticated: true, hasOwnership: true, isStaffRole: isStaffUser(user.role), activeTenantId: 'demo-tenant', login: async () => {}, logout: async () => {}, refreshProfile: async () => {} }}>
    <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#E2E8F0' }}>
      <View style={{ flex: 1, width: '100%', maxWidth: 430, backgroundColor: '#F4F7F8' }}><Text style={{ padding: 8, textAlign: 'center', backgroundColor: '#CCFBF1', color: '#115E59', fontSize: 11 }}>Демо-превью · демонстрационные данные</Text><RootNavigator /></View>
    </View>
  </AuthContext.Provider></QueryClientProvider></SafeAreaProvider>;
}
registerRootComponent(Preview);
