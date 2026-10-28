'use client';

import { useEffect } from 'react';
import i18n, { getStoredWebLocale } from '@/i18n';
import { applyTheme, getStoredTheme } from '@/lib/theme';

/**
 * Применяет сохранённый язык и тему оформления после гидратации,
 * чтобы первый клиентский рендер совпадал с серверным HTML.
 */
export default function LocaleSync() {
  useEffect(() => {
    // 1. Language sync
    const syncHtmlLang = (lang: string) => {
      document.documentElement.lang = lang;
    };

    i18n.on('languageChanged', syncHtmlLang);

    const stored = getStoredWebLocale();
    if (i18n.language !== stored) {
      i18n.changeLanguage(stored);
    } else {
      syncHtmlLang(stored);
    }

    // 2. Theme sync
    applyTheme(getStoredTheme());

    return () => {
      i18n.off('languageChanged', syncHtmlLang);
    };
  }, []);

  return null;
}
