import { AccessApi } from '../src/api/access';
import { AuthApi, UserProfile } from '../src/api/auth';
import { ChatApi } from '../src/api/chat';
import { NotificationsApi, NotificationItem } from '../src/api/notifications';
import { ServiceRequestsApi, ServiceRequestItem } from '../src/api/service-requests';
import { VotingsApi, MeetingItem } from '../src/api/votings';
import { TokenStorage } from '../src/storage/token-storage';

/** Local fixtures only: never open gates, issue passes, vote, or send messages. */
export function registerExtraFixtures(user: UserProfile, requests: ServiceRequestItem[]) {
  const date = '2026-11-02T10:00:00.000Z';
  AuthApi.getPinStatus = async () => ({ isPinSet: true });
  TokenStorage.getAccessToken = async () => null; // No preview WebSocket connection.
  AccessApi.getAccessPoints = async () => [
    { id: 'demo-intercom', name: 'Подъезд 2 · главный вход', type: 'DOOR_INTERCOM', isActive: true },
    { id: 'demo-barrier', name: 'Въезд со стороны улицы', type: 'BARRIER', isActive: true },
    { id: 'demo-gate', name: 'Служебные ворота', type: 'GATE', isActive: false },
  ];
  AccessApi.getUnitGuestPasses = async () => [{ id: 'demo-pass', unitId: 'demo-unit', guestName: 'Курьер', accessCode: 'DEMO', validFrom: date, validTo: date, isUsed: true, status: 'USED', createdAt: date }];
  const meetings: MeetingItem[] = [
    { id: 'demo-meeting-1', tenantId: 'demo-tenant', title: 'Благоустройство двора и обновление детской площадки', description: 'Выберите приоритетные работы для нашего дома.', status: 'ACTIVE', startDate: date, endDate: '2026-11-30T18:00:00.000Z', totalTenantArea: 10000, participatedArea: 6400, quorumPercent: 64, isQuorumReached: true, agendaItems: [{ id: 'demo-agenda', orderNum: 1, title: 'Обновление детской площадки', decisionType: 'SIMPLE_MAJORITY' }] },
    { id: 'demo-meeting-2', tenantId: 'demo-tenant', title: 'Утверждение плана обслуживания дома', status: 'COMPLETED', startDate: date, endDate: date, totalTenantArea: 10000, participatedArea: 7200, quorumPercent: 72, isQuorumReached: true, agendaItems: [] },
  ];
  VotingsApi.getMeetings = async () => meetings;
  VotingsApi.getMeetingDetails = async id => {
    const item = meetings.find(meeting => meeting.id === id);
    if (!item) throw new Error('Демо: собрание не найдено');
    return item;
  };
  ServiceRequestsApi.getRequestDetails = async id => {
    const item = requests.find(request => request.id === id);
    if (!item) throw new Error('Демо: заявка не найдена');
    return { ...item, unit: { unitNumber: '42', building: { blockName: 'Блок A' } }, assignee: { firstName: 'Ерлан', lastName: 'Касымов', phone: '+77000000001' }, comments: [{ id: 'demo-comment', authorId: 'demo-dispatcher', text: 'Заявка принята. Мастер проверит освещение сегодня до 18:00.', createdAt: date, author: { firstName: 'Дана', lastName: 'Ахметова', role: 'DISPATCHER' } }] };
  };
  let notifications: NotificationItem[] = [
    { id: 'demo-notification-1', userId: user.id, title: 'Мастер назначен на вашу заявку', body: 'Ерлан проверит освещение в подъезде сегодня до 18:00. Откройте заявку, чтобы посмотреть подробности.', data: { type: 'SERVICE_REQUEST', requestId: 'demo-1' }, isRead: false, createdAt: date },
    { id: 'demo-notification-2', userId: user.id, title: 'Как связаться с управляющей компанией', body: 'Напишите диспетчеру в чате приложения. Для срочных вопросов используйте контакты управляющей компании. Подробно опишите проблему и приложите фотографию, чтобы мы быстрее помогли.', isRead: true, createdAt: date },
  ];
  NotificationsApi.getNotifications = async () => notifications.map(item => ({ ...item }));
  NotificationsApi.getUnreadCount = async () => { const count = notifications.filter(item => !item.isRead).length; return { count, unreadCount: count }; };
  NotificationsApi.markAsRead = async id => {
    const item = notifications.find(item => item.id === id);
    if (!item) throw new Error('Демо: уведомление не найдено');
    notifications = notifications.map(item => item.id === id ? { ...item, isRead: true } : item);
    return { ...item, isRead: true };
  };
  NotificationsApi.markAllAsRead = async () => {
    const updated = notifications.filter(item => !item.isRead).length;
    notifications = notifications.map(item => ({ ...item, isRead: true }));
    return { success: true, updated };
  };
  NotificationsApi.getPreferences = async () => ({ CHAT: true, SERVICE_REQUEST: true, ANNOUNCEMENT: true, FINANCE: false });
  ChatApi.getMyConversation = async () => ({
    id: 'demo-conversation', tenantId: 'demo-tenant', residentId: user.id, lastReadByResidentAt: date, lastReadByStaffAt: date, createdAt: date, updatedAt: date,
    messages: [
      { id: 'demo-message-1', conversationId: 'demo-conversation', senderId: user.id, text: 'Здравствуйте! Подскажите, когда заменят лампы на нашем этаже?', photoUrl: null, createdAt: date },
      { id: 'demo-message-2', conversationId: 'demo-conversation', senderId: 'demo-dispatcher', text: 'Добрый день, Алия! Мастер уже получил заявку и придёт сегодня до 18:00.', photoUrl: null, createdAt: date },
    ],
  });
  ChatApi.getTenantConversations = async (_tenantId, resolved) => {
    const base = await ChatApi.getMyConversation();
    return [
      { ...base, unreadCount: 2, isResolved: false, lastMessage: base.messages[0], resident: { id: 'demo-resident', firstName: 'Алия', lastName: 'Серикова', phone: '+77000000000', ownerships: [{ unit: { unitNumber: '42', building: { blockName: 'Блок A' } } }] } },
      { ...base, id: 'demo-resolved-chat', unreadCount: 0, isResolved: true, lastMessage: base.messages[1], resident: { id: 'demo-neighbor', firstName: 'Александр', lastName: 'Константинопольский', phone: '+77000000002' } },
    ].filter(item => resolved === undefined || item.isResolved === resolved);
  };

  ChatApi.getConversationMessages = async id => {
    const conv = (await ChatApi.getTenantConversations('demo-tenant')).find(item => item.id === id);
    if (!conv) throw new Error('Демо: диалог не найден');
    return { ...conv, messages: conv.messages.map((message, index) => ({ ...message, sender: index === 0 ? { id: message.senderId, firstName: 'Алия', lastName: 'Серикова', role: 'RESIDENT' } : { id: message.senderId, firstName: 'Дана', lastName: 'Ахметова', role: 'DISPATCHER' } })) };
  };

}
