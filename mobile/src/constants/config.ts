import { Platform } from 'react-native';
import Constants from 'expo-constants';

const rawEnvApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

// Dynamic host determination for local development:
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

const isDev = __DEV__;
const hasEnvUrl = Boolean(rawEnvApiUrl);

let resolvedApiUrl = '';
let resolvedSocketUrl = '';
let isMisconfigured = false;
let configErrorMessage: string | null = null;

if (hasEnvUrl) {
  // EXPO_PUBLIC_API_URL has top priority in all environments
  const normalized = (rawEnvApiUrl as string).replace(/\/+$/, '');
  resolvedApiUrl = normalized.endsWith('/api/v1') ? normalized : `${normalized}/api/v1`;
  resolvedSocketUrl = normalized.replace(/\/api\/v1\/?$/, '').replace(/\/api\/?$/, '');
} else if (isDev) {
  // Local development fallback
  const devHost = getDevApiHost();
  resolvedApiUrl = `${devHost}/api/v1`;
  resolvedSocketUrl = devHost;
} else {
  // In production builds (!__DEV__), missing EXPO_PUBLIC_API_URL must NOT silently hit localhost.
  isMisconfigured = true;
  configErrorMessage =
    'Production build is missing EXPO_PUBLIC_API_URL. Please specify EXPO_PUBLIC_API_URL (e.g. https://api.example.kz/api/v1) before building.';
  console.error('[Config Error]', configErrorMessage);
  resolvedApiUrl = '';
  resolvedSocketUrl = '';
}

export const Config = {
  API_URL: resolvedApiUrl,
  SOCKET_URL: resolvedSocketUrl,
  REQUEST_TIMEOUT: 15000,
  OTP_COOLDOWN_SECONDS: 60,
  MAX_OTP_ATTEMPTS: 3,
  isMisconfigured,
  configErrorMessage,
};
