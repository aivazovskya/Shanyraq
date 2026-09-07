import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'shanyraq_access_token';
const REFRESH_TOKEN_KEY = 'shanyraq_refresh_token';

// In-memory fallback if SecureStore is not available
const memoryStorage = new Map<string, string>();

async function isSecureStoreAvailable(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export const TokenStorage = {
  async getAccessToken(): Promise<string | null> {
    try {
      if (await isSecureStoreAvailable()) {
        return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
      }
      return memoryStorage.get(ACCESS_TOKEN_KEY) || null;
    } catch {
      return memoryStorage.get(ACCESS_TOKEN_KEY) || null;
    }
  },

  async setAccessToken(token: string): Promise<void> {
    try {
      memoryStorage.set(ACCESS_TOKEN_KEY, token);
      if (await isSecureStoreAvailable()) {
        await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
      }
    } catch (e) {
      console.warn('SecureStore setAccessToken error:', e);
    }
  },

  async getRefreshToken(): Promise<string | null> {
    try {
      if (await isSecureStoreAvailable()) {
        return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
      }
      return memoryStorage.get(REFRESH_TOKEN_KEY) || null;
    } catch {
      return memoryStorage.get(REFRESH_TOKEN_KEY) || null;
    }
  },

  async setRefreshToken(token: string): Promise<void> {
    try {
      memoryStorage.set(REFRESH_TOKEN_KEY, token);
      if (await isSecureStoreAvailable()) {
        await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
      }
    } catch (e) {
      console.warn('SecureStore setRefreshToken error:', e);
    }
  },

  async saveTokens(accessToken: string, refreshToken: string): Promise<void> {
    await Promise.all([
      this.setAccessToken(accessToken),
      this.setRefreshToken(refreshToken),
    ]);
  },

  async clearTokens(): Promise<void> {
    try {
      memoryStorage.clear();
      if (await isSecureStoreAvailable()) {
        await Promise.all([
          SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
          SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
        ]);
      }
    } catch (e) {
      console.warn('SecureStore clearTokens error:', e);
    }
  },
};
