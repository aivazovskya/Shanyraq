import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ru from './locales/ru.json';
import kk from './locales/kk.json';
import en from './locales/en.json';

export const resources = {
  ru: { translation: ru },
  kk: { translation: kk },
  en: { translation: en },
} as const;

export type SupportedLocale = 'ru' | 'kk' | 'en';
export const SUPPORTED_LOCALES: SupportedLocale[] = ['kk', 'ru', 'en'];

const STORAGE_LOCALE_KEY = 'shanyraq_locale';

export function getStoredWebLocale(): SupportedLocale {
  if (typeof window === 'undefined') return 'ru';
  try {
    const saved = localStorage.getItem(STORAGE_LOCALE_KEY);
    if (saved === 'ru' || saved === 'kk' || saved === 'en') {
      return saved;
    }
    const browserLang = navigator.language?.slice(0, 2).toLowerCase();
    if (browserLang === 'kk') return 'kk';
    if (browserLang === 'en') return 'en';
    return 'ru';
  } catch {
    return 'ru';
  }
}

export function setStoredWebLocale(lang: SupportedLocale): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_LOCALE_KEY, lang);
  } catch (e) {
    console.warn('Failed to save locale to localStorage:', e);
  }
}

// Initialize i18next instance
if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: typeof window !== 'undefined' ? getStoredWebLocale() : 'ru',
      fallbackLng: 'ru',
      interpolation: {
        escapeValue: false,
      },
    });
}

export async function changeWebLanguage(lang: SupportedLocale): Promise<void> {
  setStoredWebLocale(lang);
  await i18n.changeLanguage(lang);
}

export default i18n;
