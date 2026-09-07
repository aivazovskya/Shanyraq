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
import { LoadingState } from '../components/common/LoadingState';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator: React.FC = () => {
  const { isLoading, isAuthenticated, hasOwnership } = useAuth();

  if (isLoading) {
    return <LoadingState message="Инициализация приложения Шаңырақ..." />;
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
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
