'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  User,
  Building2,
  ShieldCheck,
  Globe,
  Sun,
  Moon,
  LogOut,
  KeyRound,
  CheckCircle2,
  ChevronRight,
  Phone,
  Mail,
  Home,
  Plus,
  Loader2,
} from 'lucide-react';
import { clearSession } from '@/lib/api';
import { CabinetApi, ResidentProfile } from '@/lib/cabinet-api';
import { getRoleLabel } from '@/lib/cabinet-labels';
import { changeWebLanguage, SupportedLocale, SUPPORTED_LOCALES } from '@/i18n';
import { getStoredTheme, applyTheme, ThemeMode } from '@/lib/theme';

const LANGUAGE_LABELS: Record<SupportedLocale, string> = {
  kk: 'Қазақша',
  ru: 'Русский',
  en: 'English',
};

export default function CabinetProfilePage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();

  const [profile, setProfile] = useState<ResidentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>('light');

  const currentLang = (i18n.language?.slice(0, 2) as SupportedLocale) || 'ru';

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const me = await CabinetApi.getMe();
      setProfile(me);
      setCurrentTheme(getStoredTheme());
    } catch (e) {
      console.warn('Failed to load profile:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleLanguageChange = (nextLang: SupportedLocale) => {
    changeWebLanguage(nextLang);
  };

  const handleThemeChange = (nextTheme: ThemeMode) => {
    applyTheme(nextTheme);
    setCurrentTheme(nextTheme);
  };

  const handleLogout = () => {
    clearSession();
    router.replace('/');
  };

  const primaryOwnership = profile?.ownerships?.[0];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          {t('navigation.cabinetProfile')}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {t('cabinet.profileSubtitle')}
        </p>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* User Profile Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-600 text-white font-extrabold text-2xl flex items-center justify-center shadow-md">
                {(profile?.firstName || 'R').charAt(0).toUpperCase()}
              </div>

              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {profile?.firstName} {profile?.lastName}
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5" />
                    <span>{profile?.phone}</span>
                  </span>
                  {profile?.email && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5" />
                        <span>{profile?.email}</span>
                      </span>
                    </>
                  )}
                  {profile?.iin && (
                    <>
                      <span>•</span>
                      <span>ИИН: {profile.iin}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold self-start sm:self-center">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>{getRoleLabel(profile?.role, t)}</span>
            </div>
          </div>

          {/* Properties Section */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t('cabinet.myProperties')}
              </h3>

              <Link
                href="/cabinet/claim-unit"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:underline"
              >
                <Plus className="w-4 h-4" />
                <span>{t('cabinet.addProperty')}</span>
              </Link>
            </div>

            {primaryOwnership ? (
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    <Home className="w-4 h-4 text-emerald-600" />
                    <span>
                      {t('cabinet.apartment', { number: primaryOwnership.unit.unitNumber })}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        primaryOwnership.isVerified
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}
                    >
                      {primaryOwnership.isVerified
                        ? t('cabinet.ownershipVerified')
                        : t('cabinet.ownershipPending')}
                    </span>
                  </div>

                  <div className="text-slate-500 dark:text-slate-400 mt-1 space-x-2">
                    <span>{profile?.tenant?.name || profile?.tenantName}</span>
                    <span>•</span>
                    <span>{primaryOwnership.unit.building?.blockName}</span>
                    <span>•</span>
                    <span>
                      {t('cabinet.entranceNum', { number: primaryOwnership.unit.entrance })}
                    </span>
                    <span>•</span>
                    <span>
                      {t('cabinet.floorNum', { number: primaryOwnership.unit.floor })}
                    </span>
                    <span>•</span>
                    <span>
                      {t('cabinet.areaSqm', { area: primaryOwnership.unit.area })}
                    </span>
                  </div>
                </div>

                <div className="text-right text-slate-500 self-end sm:self-center">
                  {t('cabinet.shareLabel', { percent: primaryOwnership.sharePercent })}
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-slate-400">
                {t('cabinet.noPropertyLinked')}
              </div>
            )}
          </div>

          {/* App Settings Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t('cabinet.appSettings')}
            </h3>

            {/* Language Selector */}
            <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <Globe className="w-5 h-5 text-slate-500" />
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    {t('cabinet.interfaceLanguage')}
                  </div>
                  <div className="text-[11px] text-slate-400">Тіл таңдау / Select language</div>
                </div>
              </div>

              <div className="flex gap-1.5">
                {SUPPORTED_LOCALES.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => handleLanguageChange(code)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      currentLang === code
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    {LANGUAGE_LABELS[code]}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme Selector */}
            <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                {currentTheme === 'dark' ? (
                  <Moon className="w-5 h-5 text-indigo-400" />
                ) : (
                  <Sun className="w-5 h-5 text-amber-500" />
                )}
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    {t('cabinet.theme')}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {t('cabinet.themeDesc')}
                  </div>
                </div>
              </div>

              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => handleThemeChange('light')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    currentTheme === 'light'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  <span>{t('cabinet.themeLight')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleThemeChange('dark')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    currentTheme === 'dark'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5" />
                  <span>{t('cabinet.themeDark')}</span>
                </button>
              </div>
            </div>

            {/* PIN Settings Link */}
            <Link
              href="/cabinet/access"
              className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-xl px-2 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <KeyRound className="w-5 h-5 text-slate-500" />
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">
                    {t('cabinet.pinTitle')}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {t('cabinet.pinSubtitle')}
                  </div>
                </div>
              </div>

              <ChevronRight className="w-4 h-4 text-slate-400" />
            </Link>
          </div>

          {/* Logout Section */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                {t('cabinet.logoutTitle')}
              </div>
              <div className="text-[11px] text-slate-400">
                {t('cabinet.logoutDesc')}
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 text-xs font-bold transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>{t('cabinet.logoutBtn')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
