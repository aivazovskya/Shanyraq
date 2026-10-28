import { SafeStorage } from './web-safe-storage';

const ACCESS_TOKEN_KEY = 'shanyraq_access_token';
const REFRESH_TOKEN_KEY = 'shanyraq_refresh_token';

export const TokenStorage = {
  async getAccessToken(): Promise<string | null> {
    return SafeStorage.getItem(ACCESS_TOKEN_KEY);
  },

  async setAccessToken(token: string): Promise<void> {
    return SafeStorage.setItem(ACCESS_TOKEN_KEY, token);
  },

  async getRefreshToken(): Promise<string | null> {
    return SafeStorage.getItem(REFRESH_TOKEN_KEY);
  },

  async setRefreshToken(token: string): Promise<void> {
    return SafeStorage.setItem(REFRESH_TOKEN_KEY, token);
  },

  async saveTokens(accessToken: string, refreshToken: string): Promise<void> {
    await Promise.all([
      this.setAccessToken(accessToken),
      this.setRefreshToken(refreshToken),
    ]);
  },

  async clearTokens(): Promise<void> {
    await Promise.all([
      SafeStorage.removeItem(ACCESS_TOKEN_KEY),
      SafeStorage.removeItem(REFRESH_TOKEN_KEY),
    ]);
  },
};
