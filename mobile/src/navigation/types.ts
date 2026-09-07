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

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  ClaimUnit: undefined;
  Main: NavigatorScreenParams<MainTabsParamList>;
  VotingDetails: { meetingId: string };
  CreateRequest: undefined;
  RequestDetail: { requestId: string };
  Announcements: undefined;
};
