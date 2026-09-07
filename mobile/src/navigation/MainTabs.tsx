import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MainTabsParamList } from './types';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { VotingsListScreen } from '../screens/votings/VotingsListScreen';
import { AccessScreen } from '../screens/access/AccessScreen';
import { RequestsListScreen } from '../screens/requests/RequestsListScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { Colors } from '../constants/colors';
import { Home, Vote, ShieldCheck, Wrench, User } from 'lucide-react-native';

const Tab = createBottomTabNavigator<MainTabsParamList>();

export const MainTabs: React.FC = () => {
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
        name="DashboardTab"
        component={DashboardScreen}
        options={{
          tabBarLabel: 'Главная',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="VotingsTab"
        component={VotingsListScreen}
        options={{
          tabBarLabel: 'ОСС',
          tabBarIcon: ({ color, size }) => <Vote color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="AccessTab"
        component={AccessScreen}
        options={{
          tabBarLabel: 'Доступ',
          tabBarIcon: ({ color, size }) => <ShieldCheck color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="RequestsTab"
        component={RequestsListScreen}
        options={{
          tabBarLabel: 'Заявки',
          tabBarIcon: ({ color, size }) => <Wrench color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Профиль',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
};
