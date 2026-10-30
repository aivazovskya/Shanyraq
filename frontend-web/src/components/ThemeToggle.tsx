'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/lib/useTheme';

export interface ThemeToggleProps {
  className?: string;
  iconClassName?: string;
}

export function ThemeToggle({
  className = 'p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500',
  iconClassName = 'w-4 h-4',
}: ThemeToggleProps) {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={className}
      aria-label={t('cabinet.theme')}
      title={theme === 'dark' ? t('cabinet.themeLight') : t('cabinet.themeDark')}
    >
      {theme === 'dark' ? (
        <Sun className={`${iconClassName} text-amber-400`} />
      ) : (
        <Moon className={`${iconClassName} text-slate-600 dark:text-slate-300`} />
      )}
    </button>
  );
}
