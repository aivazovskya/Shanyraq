import { AccessApi } from '../src/api/access';
import { sosApi } from '../src/api/sos';
import { ShiftHandoverApi } from '../src/api/shift-handover';

/** Read-only staff gallery. Every write still reaches the blocked API client. */
export function registerStaffFixtures() {
  const date = '2026-11-03T06:00:00.000Z';
  AccessApi.getAccessLogs = async () => [
    { id: 'demo-log-1', accessPointId: 'demo-barrier', action: 'OPEN_BARRIER', status: 'SUCCESS', createdAt: date, accessPoint: { id: 'demo-barrier', name: 'Въезд со стороны улицы', type: 'BARRIER', isActive: true }, user: { firstName: 'Алия', lastName: 'Серикова', phone: '+77000000000' }, unit: { id: 'demo-unit', unitNumber: '42', building: { id: 'demo-building', blockName: 'Блок A' } } },
    { id: 'demo-log-2', accessPointId: 'demo-intercom', action: 'OPEN_INTERCOM', status: 'DENIED', note: 'Неверный код доступа', createdAt: date, accessPoint: { id: 'demo-intercom', name: 'Подъезд 2 · главный вход', type: 'DOOR_INTERCOM', isActive: true } },
  ];
  AccessApi.getTenantGuestPasses = async () => [{ id: 'demo-staff-pass', unitId: 'demo-unit', guestName: 'Тестовый курьер', accessCode: 'DEMO', status: 'USED', isUsed: true, validFrom: date, validTo: date, createdAt: date, unit: { id: 'demo-unit', unitNumber: '42', building: { id: 'demo-building', blockName: 'Блок A' } } }];
  sosApi.getTenantSosAlerts = async () => [{ id: 'demo-staff-sos', tenantId: 'demo-tenant', unitId: 'demo-unit', triggeredById: 'demo-resident', latitude: null, longitude: null, status: 'RESOLVED', resolvedById: 'demo-staff', resolvedAt: date, resolutionNote: 'Сотрудник проверил подъезд. Помощь оказана, дополнительных действий не требуется.', createdAt: date, triggeredBy: { id: 'demo-resident', firstName: 'Алия', lastName: 'Серикова', phone: '+77000000000' }, unit: { id: 'demo-unit', unitNumber: '42', building: { id: 'demo-building', blockName: 'Блок A' } } }];
  sosApi.getStatistics = async () => ({ totalAlerts: 1, byStatus: { ACTIVE: 0, RESOLVED: 1, FALSE_ALARM: 0 }, averageResponseTimeMinutes: 4, dailyTrend: [{ date: '2026-11-03', count: 1 }] });
  ShiftHandoverApi.getNotes = async () => [{ id: 'demo-shift-note', tenantId: 'demo-tenant', authorId: 'demo-guard', content: 'Въезд со стороны улицы проверен. На следующей смене проверьте освещение у второго подъезда: заявка передана электрику.', createdAt: date, author: { id: 'demo-guard', firstName: 'Ерлан', lastName: 'Касымов', role: 'SECURITY' } }];
}
