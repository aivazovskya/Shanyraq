import { Platform } from 'react-native';

// Default development API URL:
// - Android Emulator uses 10.0.2.2 to access host localhost
// - iOS Simulator and Web use localhost
const DEV_API_HOST = Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';

export const Config = {
  API_URL: `${DEV_API_HOST}/api/v1`,
  REQUEST_TIMEOUT: 15000,
  OTP_COOLDOWN_SECONDS: 60,
  MAX_OTP_ATTEMPTS: 3,
};
