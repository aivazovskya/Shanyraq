import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { StaffTabsParamList } from './types';
import { StaffHomeScreen } from '../screens/staff/StaffHomeScreen';
import { StaffSosScreen } from '../screens/staff/StaffSosScreen';
import { StaffChatInboxScreen } from '../screens/staff/StaffChatInboxScreen';
import { StaffRequestsListScreen } from '../screens/staff/StaffRequestsListScreen';
import { StaffAccessLogScreen } from '../screens/staff/StaffAccessLogScreen';
import { StaffGuestPassScreen } from '../screens/staff/StaffGuestPassScreen';
import { StaffShiftHandoverScreen } from '../screens/staff/StaffShiftHandoverScreen';
import { StaffProfileScreen } from '../screens/staff/StaffProfileScreen';
import { useAuth, canAccessChat, canAccessRequests } from '../context/AuthContext';
import { FloatingTabBar } from '../components/ui/FloatingTabBar';
import {
  Building2,
  AlertTriangle,
  MessageSquare,
  ClipboardList,
  User,
  Shield,
  KeyRound,
  BookOpen,
} from 'lucide-react-native';

const Tab = createBottomTabNavigator<StaffTabsParamList>();

export const StaffMainTabs: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const role = user?.role;

  const isSecurity = role === 'SECURITY';
  const isDispatcher = role === 'DISPATCHER';
  const isChairman = role === 'HOA_CHAIRMAN';

  const canShowChat = canAccessChat(role);
  const canShowRequests = canAccessRequests(role);
  const canShowHome = role === 'HOA_ADMIN' || role === 'HOA_CHAIRMAN';

  // SECURITY starts on SOS; DISPATCHER starts on Requests; ADMIN and CHAIRMAN start on Home.
  const initialRouteName: keyof StaffTabsParamList = isSecurity
    ? 'SosTab'
    : isDispatcher
    ? 'RequestsTab'
    : 'HomeTab';

  return (
    <Tab.Navigator
      initialRouteName={initialRouteName}
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      {/* SECURITY has dedicated tab-bar: SOS, Access Log, Guest Pass, Shift Handover, Profile */}
      {isSecurity ? (
        <>
          <Tab.Screen
            name="SosTab"
            component={StaffSosScreen}
            options={{
              tabBarLabel: t('staff.sosTab'),
              tabBarIcon: ({ color, size }) => (
                <AlertTriangle color={color} size={size} />
              ),
            }}
          />
          <Tab.Screen
            name="AccessLogTab"
            component={StaffAccessLogScreen}
            options={{
              tabBarLabel: t('staff.accessLog.tabLabel'),
              tabBarIcon: ({ color, size }) => (
                <Shield color={color} size={size} />
              ),
            }}
          />
          <Tab.Screen
            name="GuestPassTab"
            component={StaffGuestPassScreen}
            options={{
              tabBarLabel: t('staff.guestPass.tabLabel'),
              tabBarIcon: ({ color, size }) => (
                <KeyRound color={color} size={size} />
              ),
            }}
          />
          <Tab.Screen
            name="ShiftHandoverTab"
            component={StaffShiftHandoverScreen}
            options={{
              tabBarLabel: t('staff.shiftHandover.tabLabel'),
              tabBarIcon: ({ color, size }) => (
                <BookOpen color={color} size={size} />
              ),
            }}
          />
        </>
      ) : (
        <>
          {canShowHome && (
            <Tab.Screen
              name="HomeTab"
              component={StaffHomeScreen}
              options={{
                tabBarLabel: t('staff.homeTab'),
                tabBarIcon: ({ color, size }) => (
                  <Building2 color={color} size={size} />
                ),
              }}
            />
          )}

          {canShowRequests && (
            <Tab.Screen
              name="RequestsTab"
              component={StaffRequestsListScreen}
              options={{
                tabBarLabel: t('staff.requestsTab'),
                tabBarIcon: ({ color, size }) => (
                  <ClipboardList color={color} size={size} />
                ),
              }}
            />
          )}

          {canShowChat && (
            <Tab.Screen
              name="ChatInboxTab"
              component={StaffChatInboxScreen}
              options={{
                tabBarLabel: t('staff.chatTab'),
                tabBarIcon: ({ color, size }) => (
                  <MessageSquare color={color} size={size} />
                ),
              }}
            />
          )}

          <Tab.Screen
            name="SosTab"
            component={StaffSosScreen}
            options={{
              tabBarLabel: t('staff.sosTab'),
              tabBarIcon: ({ color, size }) => (
                <AlertTriangle color={color} size={size} />
              ),
            }}
          />
        </>
      )}

      <Tab.Screen
        name="ProfileTab"
        component={StaffProfileScreen}
        options={{
          tabBarLabel: t('navigation.profile'),
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
};
