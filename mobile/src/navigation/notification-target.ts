import type { RootStackParamList } from './types';

type Target = { [K in keyof RootStackParamList]: { name: K; params: RootStackParamList[K] } }[keyof RootStackParamList];
type Capabilities = { staff: boolean; chat: boolean; requests: boolean };

/** Notifications may only navigate to screens mounted for the current role. */
export function getNotificationTarget(data: Record<string, unknown> | null | undefined, capabilities: Capabilities): Target | null {
  if (!data) return null;
  const type = typeof data.type === 'string' ? data.type.toUpperCase() : '';
  const id = (key: string) => typeof data[key] === 'string' && (data[key] as string).trim() ? (data[key] as string).trim() : undefined;
  const { staff, chat, requests } = capabilities;

  if (type.includes('SOS') || id('alertId')) return staff
    ? { name: 'StaffMain', params: { screen: 'SosTab' } }
    : { name: 'SosHistory', params: undefined };
  if (type.includes('CHAT') || id('conversationId')) {
    if (!staff) return { name: 'Chat', params: undefined };
    if (!chat) return null;
    const conversationId = id('conversationId');
    return conversationId
      ? { name: 'StaffChatThread', params: { conversationId, residentName: id('senderName'), unitInfo: id('unitInfo') } }
      : { name: 'StaffMain', params: { screen: 'ChatInboxTab' } };
  }
  if (type.includes('REQUEST') || id('requestId')) {
    if (staff && !requests) return null;
    const requestId = id('requestId');
    return requestId ? { name: 'RequestDetail', params: { requestId } }
      : staff ? { name: 'StaffMain', params: { screen: 'RequestsTab' } }
        : { name: 'Main', params: { screen: 'RequestsTab' } };
  }
  if (staff) return null;
  if (type.includes('VOTING') || type.includes('MEETING') || id('meetingId')) {
    const meetingId = id('meetingId');
    return meetingId ? { name: 'VotingDetails', params: { meetingId } } : { name: 'Main', params: { screen: 'VotingsTab' } };
  }
  if (type.includes('ANNOUNCEMENT') || id('announcementId')) return { name: 'Announcements', params: undefined };
  if (type.includes('BOOKING') || id('bookingId')) return { name: 'Bookings', params: undefined };
  if (type.includes('BILL') || type.includes('PAYMENT') || id('invoiceId')) return { name: 'FinanceAccount', params: undefined };
  return null;
}
