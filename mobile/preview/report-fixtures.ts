import { AnnouncementsApi } from '../src/api/announcements';
import { financeApi } from '../src/api/finance';
import { sosApi } from '../src/api/sos';
import { VotingsApi } from '../src/api/votings';

export function registerReportFixtures() {
  const date = new Date().toISOString();
  AnnouncementsApi.getAnnouncements = async () => [
    { id: 'demo-important-news', tenantId: 'demo-tenant', authorId: 'demo-admin', title: 'Плановое отключение горячей воды', content: 'В четверг с 10:00 до 14:00 будут проводиться работы на инженерных сетях. После завершения работ подача воды возобновится. Приносим извинения за временные неудобства.', isUrgent: true, createdAt: date, author: { firstName: 'Управляющая', lastName: 'компания', role: 'HOA_ADMIN' } },
    { id: 'demo-community-news', tenantId: 'demo-tenant', authorId: 'demo-admin', title: 'Новые скамейки во дворе', content: 'Установили скамейки рядом с детской площадкой. Благодарим жителей за предложения по благоустройству.', isUrgent: false, createdAt: date, author: { firstName: 'Управляющая', lastName: 'компания', role: 'HOA_ADMIN' } },
  ];
  sosApi.getMySosAlerts = async () => [
    { id: 'demo-sos-resolved', tenantId: 'demo-tenant', unitId: 'demo-unit', triggeredById: 'demo-resident', latitude: null, longitude: null, status: 'RESOLVED', resolvedById: 'demo-security', resolvedAt: date, resolutionNote: 'Охрана прибыла к подъезду. Ситуация проверена, помощь оказана.', createdAt: date, unit: { id: 'demo-unit', unitNumber: '42', building: { id: 'demo-building', blockName: 'Блок A' } }, resolvedBy: { id: 'demo-security', firstName: 'Марат', lastName: 'Ибраев' } },
    { id: 'demo-sos-false', tenantId: 'demo-tenant', unitId: 'demo-unit', triggeredById: 'demo-resident', latitude: null, longitude: null, status: 'FALSE_ALARM', resolvedById: 'demo-security', resolvedAt: date, resolutionNote: 'Житель подтвердил, что помощь не требуется.', createdAt: date },
  ];
  financeApi.getTransparencyReport = async (_tenant, params) => {
    const now = new Date();
    const month = params?.month || now.getMonth() + 1;
    const year = params?.year || now.getFullYear();
    const age = (now.getFullYear() - year) * 12 + now.getMonth() + 1 - month;
    if (age > 1) throw new Error('Демо: отчёт за этот месяц недоступен');
    const empty = age === 1;
    return { periodMonth: month, periodYear: year, totalCharged: empty ? 0 : 1450000, totalCollected: empty ? 0 : 1320000, collectionRatePercent: empty ? 0 : 91.03, byTariff: empty ? [] : [{ tariffId: 'demo-tariff', tariffName: 'Содержание и обслуживание общего имущества', amount: 1450000 }], totalExpenses: empty ? 0 : 1180000, byExpenseCategory: empty ? [] : [{ category: 'Обслуживание инженерных систем', amount: 780000 }, { category: 'Уборка территории', amount: 400000 }], netBalance: empty ? 0 : 140000 };
  };
  const getMeetings = VotingsApi.getMeetings;
  VotingsApi.getMeetings = async tenant => (await getMeetings(tenant)).map(meeting => meeting.status === 'ACTIVE' ? { ...meeting, agendaItems: [...meeting.agendaItems, { id: 'demo-voted-agenda', orderNum: 2, title: 'Установка дополнительных скамеек у детской площадки', decisionType: 'SIMPLE_MAJORITY', myVote: { choice: 'FOR', votedAt: date, areaWeight: 68, signatureHash: 'demo-confirmation-0123456789abcdef' }, votesSummary: { forArea: 5200, againstArea: 800, abstainArea: 400, forPercent: 81.25, againstPercent: 12.5, abstainPercent: 6.25 } }] } : meeting);
  VotingsApi.getMeetingDetails = async id => {
    const meeting = (await VotingsApi.getMeetings('demo-tenant')).find(item => item.id === id);
    if (!meeting) throw new Error('Демо: собрание не найдено');
    return meeting;
  };
}
