export type ThemeMode = 'light' | 'dark';

const STORAGE_THEME_KEY = 'shanyraq_theme';
const ALT_STORAGE_THEME_KEY = 'shanyraq_theme_preference';

export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved =
      localStorage.getItem(STORAGE_THEME_KEY) ||
      localStorage.getItem(ALT_STORAGE_THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {}
  return 'light';
}

export function applyTheme(theme: ThemeMode) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_THEME_KEY, theme);
    localStorage.setItem(ALT_STORAGE_THEME_KEY, theme);
  } catch {}
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  window.dispatchEvent(new CustomEvent('shanyraq:theme-changed', { detail: { theme } }));
}

export function toggleTheme(): ThemeMode {
  const current = getStoredTheme();
  const next: ThemeMode = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}
