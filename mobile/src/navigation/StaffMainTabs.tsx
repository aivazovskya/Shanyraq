import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { StaffTabsParamList } from './types';
import { StaffHomeScreen } from '../screens/staff/StaffHomeScreen';
import { StaffSosScreen } from '../screens/staff/StaffSosScreen';
import { StaffChatInboxScreen } from '../screens/staff/StaffChatInboxScreen';
import { StaffProfileScreen } from '../screens/staff/StaffProfileScreen';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/colors';
import { Building2, AlertTriangle, MessageSquare, User } from 'lucide-react-native';

const Tab = createBottomTabNavigator<StaffTabsParamList>();

export const StaffMainTabs: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  const canAccessChat = user?.role === 'DISPATCHER' || user?.role === 'HOA_ADMIN';

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={StaffHomeScreen}
        options={{
          tabBarLabel: t('staff.homeTab'),
          tabBarIcon: ({ color, size }) => <Building2 color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="SosTab"
        component={StaffSosScreen}
        options={{
          tabBarLabel: t('staff.sosTab'),
          tabBarActiveTintColor: '#DC2626',
          tabBarIcon: ({ color, size }) => <AlertTriangle color={color} size={size} />,
        }}
      />
      {canAccessChat && (
        <Tab.Screen
          name="ChatInboxTab"
          component={StaffChatInboxScreen}
          options={{
            tabBarLabel: t('staff.chatTab'),
            tabBarIcon: ({ color, size }) => <MessageSquare color={color} size={size} />,
          }}
        />
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
