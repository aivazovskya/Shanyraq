'use client';

import { useState, useEffect, useCallback } from 'react';
import { getStoredTheme, toggleTheme, applyTheme, ThemeMode } from '@/lib/theme';

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTheme(getStoredTheme());

    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ theme: ThemeMode }>;
      if (customEvent.detail?.theme) {
        setTheme(customEvent.detail.theme);
      } else {
        setTheme(getStoredTheme());
      }
    };

    window.addEventListener('shanyraq:theme-changed', handleThemeChange);
    return () => {
      window.removeEventListener('shanyraq:theme-changed', handleThemeChange);
    };
  }, []);

  const toggle = useCallback(() => {
    const next = toggleTheme();
    setTheme(next);
    return next;
  }, []);

  const setMode = useCallback((mode: ThemeMode) => {
    applyTheme(mode);
    setTheme(mode);
  }, []);

  return {
    theme,
    isDark: theme === 'dark',
    toggleTheme: toggle,
    setTheme: setMode,
    mounted,
  };
}
