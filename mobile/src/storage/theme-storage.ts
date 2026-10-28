import { SafeStorage } from './web-safe-storage';

export type ThemeMode = 'system' | 'light' | 'dark';

const THEME_KEY = 'shanyraq_theme_preference';

export const ThemeStorage = {
  async getThemeMode(): Promise<ThemeMode> {
    try {
      const mode = await SafeStorage.getItem(THEME_KEY);
      if (mode === 'light' || mode === 'dark' || mode === 'system') {
        return mode;
      }
    } catch {
      // fallback
    }
    return 'system';
  },

  async setThemeMode(mode: ThemeMode): Promise<void> {
    return SafeStorage.setItem(THEME_KEY, mode);
  },
};
