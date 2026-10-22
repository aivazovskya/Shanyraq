'use client';

import { useEffect } from 'react';
import i18n, { getStoredWebLocale } from '@/i18n';

/**
 * Применяет сохранённый язык после гидратации, чтобы первый клиентский
 * рендер совпадал с серверным HTML (сервер всегда рендерит 'ru').
 */
export default function LocaleSync() {
  useEffect(() => {
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

    return () => {
      i18n.off('languageChanged', syncHtmlLang);
    };
  }, []);

  return null;
}
