import { SafeStorage } from './web-safe-storage';

const LOCALE_KEY = 'shanyraq_user_locale';

export const LocaleStorage = {
  async getLocale(): Promise<string | null> {
    return SafeStorage.getItem(LOCALE_KEY);
  },

  async setLocale(locale: string): Promise<void> {
    return SafeStorage.setItem(LOCALE_KEY, locale);
  },

  async clearLocale(): Promise<void> {
    return SafeStorage.removeItem(LOCALE_KEY);
  },
};
