import * as SecureStore from 'expo-secure-store';

const LOCALE_KEY = 'shanyraq_user_locale';

let memoryLocale: string | null = null;

async function isSecureStoreAvailable(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export const LocaleStorage = {
  async getLocale(): Promise<string | null> {
    try {
      if (await isSecureStoreAvailable()) {
        return await SecureStore.getItemAsync(LOCALE_KEY);
      }
      return memoryLocale;
    } catch {
      return memoryLocale;
    }
  },

  async setLocale(locale: string): Promise<void> {
    try {
      memoryLocale = locale;
      if (await isSecureStoreAvailable()) {
        await SecureStore.setItemAsync(LOCALE_KEY, locale);
      }
    } catch (e) {
      console.warn('SecureStore setLocale error:', e);
    }
  },

  async clearLocale(): Promise<void> {
    try {
      memoryLocale = null;
      if (await isSecureStoreAvailable()) {
        await SecureStore.deleteItemAsync(LOCALE_KEY);
      }
    } catch (e) {
      console.warn('SecureStore clearLocale error:', e);
    }
  },
};
