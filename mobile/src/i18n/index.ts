import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import { LocaleStorage } from '../storage/locale-storage';

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

export function getDeviceLocale(): SupportedLocale {
  try {
    const locales = Localization.getLocales();
    if (locales && locales.length > 0) {
      const langCode = locales[0].languageCode?.toLowerCase();
      if (langCode === 'kk') return 'kk';
      if (langCode === 'en') return 'en';
    }
  } catch (e) {
    console.warn('Failed to detect device locale:', e);
  }
  return 'ru';
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'ru', // Temporary fallback before async initialization
    fallbackLng: 'ru',
    interpolation: {
      escapeValue: false,
    },
  });

// Asynchronously determine stored locale or device locale on startup
LocaleStorage.getLocale().then((saved) => {
  if (saved && (saved === 'ru' || saved === 'kk' || saved === 'en')) {
    i18n.changeLanguage(saved);
  } else {
    const deviceLocale = getDeviceLocale();
    i18n.changeLanguage(deviceLocale);
  }
});

export async function changeAppLanguage(lang: SupportedLocale): Promise<void> {
  await LocaleStorage.setLocale(lang);
  await i18n.changeLanguage(lang);
}

export default i18n;
