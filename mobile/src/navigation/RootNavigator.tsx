import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { useAuth } from '../context/AuthContext';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';
import { ClaimUnitScreen } from '../screens/onboarding/ClaimUnitScreen';
import { VotingDetailsScreen } from '../screens/votings/VotingDetailsScreen';
import { CreateRequestScreen } from '../screens/requests/CreateRequestScreen';
import { RequestDetailScreen } from '../screens/requests/RequestDetailScreen';
import { AnnouncementsScreen } from '../screens/announcements/AnnouncementsScreen';
import { PinSetupScreen } from '../screens/access/PinSetupScreen';
import { AccountScreen } from '../screens/finance/AccountScreen';
import { MetersScreen } from '../screens/meters/MetersScreen';
import { BookingsScreen } from '../screens/bookings/BookingsScreen';
import { LoadingState } from '../components/common/LoadingState';
import { useTranslation } from 'react-i18next';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator: React.FC = () => {
  const { t } = useTranslation();
  const { isLoading, isAuthenticated, hasOwnership } = useAuth();

  if (isLoading) {
    return <LoadingState message={t('common.loading')} />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        {!isAuthenticated ? (
          // Unauthenticated -> Phone & OTP flow
          <Stack.Screen name="Auth" component={AuthStack} />
        ) : !hasOwnership ? (
          // Authenticated but no apartment attached -> Claim Unit Onboarding
          <Stack.Screen name="ClaimUnit" component={ClaimUnitScreen} />
        ) : (
          // Fully onboarded resident -> Main Dashboard + Detail Modals
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="VotingDetails" component={VotingDetailsScreen} />
            <Stack.Screen name="CreateRequest" component={CreateRequestScreen} />
            <Stack.Screen name="RequestDetail" component={RequestDetailScreen} />
            <Stack.Screen name="Announcements" component={AnnouncementsScreen} />
            <Stack.Screen name="ClaimUnit" component={ClaimUnitScreen} />
            <Stack.Screen name="PinSetup" component={PinSetupScreen} />
            <Stack.Screen name="FinanceAccount" component={AccountScreen} />
            <Stack.Screen name="Meters" component={MetersScreen} />
            <Stack.Screen name="Bookings" component={BookingsScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

