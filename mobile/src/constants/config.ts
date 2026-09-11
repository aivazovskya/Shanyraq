import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Dynamic host determination:
// - Physical device over Wi-Fi (Expo Go): uses the dev machine's LAN IP from hostUri
// - Android Emulator: uses 10.0.2.2
// - iOS Simulator / Web: uses localhost
const getDevApiHost = (): string => {
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    return `http://${ip}:4000`;
  }
  return Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
};

const DEV_API_HOST = getDevApiHost();

export const Config = {
  API_URL: `${DEV_API_HOST}/api/v1`,
  SOCKET_URL: DEV_API_HOST,
  REQUEST_TIMEOUT: 15000,
  OTP_COOLDOWN_SECONDS: 60,
  MAX_OTP_ATTEMPTS: 3,
};
