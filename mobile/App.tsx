import React from 'react';
import { View, StyleSheet, ActivityIndicator, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import {
  Onest_400Regular,
  Onest_500Medium,
  Onest_600SemiBold,
  Onest_700Bold,
} from '@expo-google-fonts/onest';
import {
  Geologica_500Medium,
  Geologica_700Bold,
  Geologica_800ExtraBold,
} from '@expo-google-fonts/geologica';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider } from './src/theme/ThemeContext';
import { ToastProvider } from './src/context/ToastContext';
import { ToastContainer } from './src/components/ui/Toast';
import { RootNavigator } from './src/navigation/RootNavigator';
import { Config } from './src/constants/config';
import { ConfigErrorScreen } from './src/screens/error/ConfigErrorScreen';
import './src/i18n';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
});

export default function App() {
  const colorScheme = useColorScheme();
  const isDarkInitial = colorScheme === 'dark';

  const [fontsLoaded] = useFonts({
    Onest_400Regular,
    Onest_500Medium,
    Onest_600SemiBold,
    Onest_700Bold,
    Geologica_500Medium,
    Geologica_700Bold,
    Geologica_800ExtraBold,
  });

  if (Config.isMisconfigured) {
    return <ConfigErrorScreen />;
  }

  if (!fontsLoaded) {
    return (
      <View style={[styles.splashContainer, { backgroundColor: isDarkInitial ? '#08141E' : '#0C2233' }]}>
        <ActivityIndicator size="large" color={isDarkInitial ? '#5FB3E8' : '#F4B63D'} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <ToastProvider>
              <AuthProvider>
                <ToastContainer />
                <RootNavigator />
              </AuthProvider>
            </ToastProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  splashContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
