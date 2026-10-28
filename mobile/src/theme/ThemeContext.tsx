import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { ThemeTokens, lightTheme, darkTheme } from './tokens';
import { ThemeStorage, ThemeMode } from '../storage/theme-storage';

interface ThemeContextValue {
  theme: ThemeTokens;
  mode: ThemeMode;
  resolvedScheme: 'light' | 'dark';
  isDark: boolean;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    ThemeStorage.getThemeMode()
      .then((savedMode) => {
        setModeState(savedMode);
      })
      .finally(() => {
        setIsLoaded(true);
      });
  }, []);

  const setThemeMode = useCallback(async (newMode: ThemeMode) => {
    setModeState(newMode);
    await ThemeStorage.setThemeMode(newMode);
  }, []);

  const resolvedScheme: 'light' | 'dark' = useMemo(() => {
    if (mode === 'dark') return 'dark';
    if (mode === 'light') return 'light';
    return systemScheme === 'dark' ? 'dark' : 'light';
  }, [mode, systemScheme]);

  const isDark = resolvedScheme === 'dark';
  const theme = useMemo(() => (isDark ? darkTheme : lightTheme), [isDark]);

  const value = useMemo(
    () => ({
      theme,
      mode,
      resolvedScheme,
      isDark,
      setThemeMode,
    }),
    [theme, mode, resolvedScheme, isDark, setThemeMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Graceful fallback for non-provider usage (tests or standalone renders)
    return {
      theme: lightTheme,
      mode: 'light',
      resolvedScheme: 'light',
      isDark: false,
      setThemeMode: async () => {},
    };
  }
  return ctx;
}
