import { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  PhoneInput: undefined;
  OtpVerify: { phone: string };
};

export type MainTabsParamList = {
  DashboardTab: undefined;
  VotingsTab: undefined;
  AccessTab: undefined;
  RequestsTab: undefined;
  ProfileTab: undefined;
};

export type StaffTabsParamList = {
  HomeTab: undefined;
  SosTab: undefined;
  ChatInboxTab: undefined;
  RequestsTab: undefined;
  ProfileTab: undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  ClaimUnit: undefined;
  Main: NavigatorScreenParams<MainTabsParamList>;
  StaffMain: NavigatorScreenParams<StaffTabsParamList>;
  StaffChatThread: { conversationId: string; residentName?: string; unitInfo?: string };
  StaffAccessLog: undefined;
  StaffGuestPass: undefined;
  StaffShiftHandover: undefined;
  VotingDetails: { meetingId: string };
  CreateRequest: undefined;
  RequestDetail: { requestId: string };
  Announcements: undefined;
  PinSetup: { returnTo?: string } | undefined;
  FinanceAccount: undefined;
  TransparencyReport: { tenantId?: string } | undefined;
  Meters: undefined;
  Bookings: undefined;
  SosHistory: undefined;
  CommunityBoard: undefined;
  CreateListing: undefined;
  Chat: undefined;
  Notifications: undefined;
};
