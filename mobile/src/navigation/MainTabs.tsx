import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { MainTabsParamList } from './types';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { VotingsListScreen } from '../screens/votings/VotingsListScreen';
import { AccessScreen } from '../screens/access/AccessScreen';
import { RequestsListScreen } from '../screens/requests/RequestsListScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { FloatingTabBar } from '../components/ui/FloatingTabBar';
import { Home, Vote, ShieldCheck, Wrench, User } from 'lucide-react-native';

const Tab = createBottomTabNavigator<MainTabsParamList>();

export const MainTabs: React.FC = () => {
  const { t } = useTranslation();

  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="DashboardTab"
        component={DashboardScreen}
        options={{
          tabBarLabel: t('navigation.home'),
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="VotingsTab"
        component={VotingsListScreen}
        options={{
          tabBarLabel: t('navigation.votings'),
          tabBarIcon: ({ color, size }) => <Vote color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="AccessTab"
        component={AccessScreen}
        options={{
          tabBarLabel: t('navigation.access'),
          tabBarIcon: ({ color, size }) => <ShieldCheck color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="RequestsTab"
        component={RequestsListScreen}
        options={{
          tabBarLabel: t('navigation.requests'),
          tabBarIcon: ({ color, size }) => <Wrench color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          tabBarLabel: t('navigation.profile'),
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
};
