import React, { useMemo } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { RootStackParamList } from './types';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';
import { StaffMainTabs } from './StaffMainTabs';
import { StaffChatThreadScreen } from '../screens/staff/StaffChatThreadScreen';
import { StaffAccessLogScreen } from '../screens/staff/StaffAccessLogScreen';
import { StaffGuestPassScreen } from '../screens/staff/StaffGuestPassScreen';
import { StaffShiftHandoverScreen } from '../screens/staff/StaffShiftHandoverScreen';
import { ClaimUnitScreen } from '../screens/onboarding/ClaimUnitScreen';
import { VotingDetailsScreen } from '../screens/votings/VotingDetailsScreen';
import { CreateRequestScreen } from '../screens/requests/CreateRequestScreen';
import { RequestDetailScreen } from '../screens/requests/RequestDetailScreen';
import { AnnouncementsScreen } from '../screens/announcements/AnnouncementsScreen';
import { PinSetupScreen } from '../screens/access/PinSetupScreen';
import { AccountScreen } from '../screens/finance/AccountScreen';
import { TransparencyReportScreen } from '../screens/finance/TransparencyReportScreen';
import { MetersScreen } from '../screens/meters/MetersScreen';
import { BookingsScreen } from '../screens/bookings/BookingsScreen';
import { SosHistoryScreen } from '../screens/sos/SosHistoryScreen';
import { CommunityBoardScreen } from '../screens/community-board/CommunityBoardScreen';
import { CreateListingScreen } from '../screens/community-board/CreateListingScreen';
import { ChatScreen } from '../screens/chat/ChatScreen';
import { NotificationsScreen } from '../screens/notifications/NotificationsScreen';
import { SkeletonList } from '../components/ui/Skeleton';
import { View, StyleSheet } from 'react-native';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator: React.FC = () => {
  const { isLoading, isAuthenticated, hasOwnership, isStaffRole } = useAuth();
  const { theme, isDark } = useTheme();

  const navTheme = useMemo(
    () => ({
      dark: isDark,
      colors: {
        primary: theme.colors.primary,
        background: theme.colors.background,
        card: theme.colors.surface,
        text: theme.colors.text,
        border: theme.colors.border,
        notification: theme.colors.danger,
      },
    }),
    [isDark, theme],
  );

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <SkeletonList count={4} style={{ padding: 24, marginTop: 60 }} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        >
          {!isAuthenticated ? (
            <Stack.Screen name="Auth" component={AuthStack} />
          ) : isStaffRole ? (
            <>
              <Stack.Screen name="StaffMain" component={StaffMainTabs} />
              <Stack.Screen name="StaffChatThread" component={StaffChatThreadScreen} />
              <Stack.Screen name="RequestDetail" component={RequestDetailScreen} />
              <Stack.Screen name="StaffAccessLog" component={StaffAccessLogScreen} />
              <Stack.Screen name="StaffGuestPass" component={StaffGuestPassScreen} />
              <Stack.Screen name="StaffShiftHandover" component={StaffShiftHandoverScreen} />
              <Stack.Screen name="Notifications" component={NotificationsScreen} />
            </>
          ) : !hasOwnership ? (
            <Stack.Screen name="ClaimUnit" component={ClaimUnitScreen} />
          ) : (
            <>
              <Stack.Screen name="Main" component={MainTabs} />
              <Stack.Screen name="VotingDetails" component={VotingDetailsScreen} />
              <Stack.Screen name="CreateRequest" component={CreateRequestScreen} />
              <Stack.Screen name="RequestDetail" component={RequestDetailScreen} />
              <Stack.Screen name="Announcements" component={AnnouncementsScreen} />
              <Stack.Screen name="ClaimUnit" component={ClaimUnitScreen} />
              <Stack.Screen name="PinSetup" component={PinSetupScreen} />
              <Stack.Screen name="FinanceAccount" component={AccountScreen} />
              <Stack.Screen name="TransparencyReport" component={TransparencyReportScreen} />
              <Stack.Screen name="Meters" component={MetersScreen} />
              <Stack.Screen name="Bookings" component={BookingsScreen} />
              <Stack.Screen name="SosHistory" component={SosHistoryScreen} />
              <Stack.Screen name="CommunityBoard" component={CommunityBoardScreen} />
              <Stack.Screen name="CreateListing" component={CreateListingScreen} />
              <Stack.Screen name="Chat" component={ChatScreen} />
              <Stack.Screen name="Notifications" component={NotificationsScreen} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
  },
});
