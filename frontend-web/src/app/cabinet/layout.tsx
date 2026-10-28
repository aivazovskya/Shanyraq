'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import '@/i18n';
import { changeWebLanguage, SupportedLocale, SUPPORTED_LOCALES } from '@/i18n';
import {
  Building2,
  LayoutDashboard,
  Wrench,
  KeyRound,
  CreditCard,
  Gauge,
  Vote,
  Calendar,
  MessageSquare,
  Bell,
  ShoppingBag,
  AlertTriangle,
  User,
  LogOut,
  Sun,
  Moon,
  Menu,
  X,
  Globe,
  Home,
  CheckCircle2,
  Clock,
  ChevronRight,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { getStoredSession, clearSession, AuthUser } from '@/lib/api';
import { isResidentRole } from '@/lib/role-routing';
import { CabinetApi, ResidentProfile } from '@/lib/cabinet-api';
import { getStoredTheme, toggleTheme, ThemeMode } from '@/lib/theme';
import { NotificationBell } from '@/components/NotificationBell';

const LANGUAGE_LABELS: Record<SupportedLocale, string> = {
  kk: 'Қазақша',
  ru: 'Русский',
  en: 'English',
};

export default function CabinetLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, i18n } = useTranslation();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<ResidentProfile | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');

  // Close mobile drawer on navigation
  useEffect(() => {
    setMobileMenuOpen(false);
    if (typeof window !== 'undefined') {
      (window as any).__navigate = (href: string) => router.push(href);
    }
  }, [pathname, router]);

  // Auth guard & profile fetch
  useEffect(() => {
    const session = getStoredSession();
    if (!session || !session.token || !session.user) {
      router.replace('/');
      return;
    }

    if (!isResidentRole(session.user.role)) {
      router.replace('/dashboard');
      return;
    }

    setUser(session.user);
    setIsCheckingAuth(false);
    setThemeMode(getStoredTheme());

    CabinetApi.getMe()
      .then((data) => setProfile(data))
      .catch(() => {});
  }, [router]);

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    clearSession();
    router.replace('/');
  };

  const handleToggleTheme = () => {
    const next = toggleTheme();
    setThemeMode(next);
  };

  const currentLang = (i18n.language?.slice(0, 2) as SupportedLocale) || 'ru';

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextLang = e.target.value as SupportedLocale;
    changeWebLanguage(nextLang);
  };

  const primaryOwnership = profile?.ownerships?.[0];
  const unitNumber = primaryOwnership?.unit?.unitNumber;
  const complexName = profile?.tenant?.name || user?.tenantName || t('dashboard.defaultComplex');
  const isOwner = user?.role === 'RESIDENT_OWNER' || profile?.ownerships?.some((o) => o.ownershipType === 'OWNER' && o.isVerified);

  const navigation = [
    { name: t('navigation.cabinetHome'), href: '/cabinet', icon: LayoutDashboard },
    ...(isOwner ? [{ name: t('navigation.cabinetResidents'), href: '/cabinet/residents', icon: Users }] : []),
    { name: t('navigation.cabinetRequests'), href: '/cabinet/requests', icon: Wrench },
    { name: t('navigation.cabinetAccess'), href: '/cabinet/access', icon: KeyRound },
    { name: t('navigation.cabinetFinance'), href: '/cabinet/finance', icon: CreditCard },
    { name: t('navigation.cabinetMeters'), href: '/cabinet/meters', icon: Gauge },
    { name: t('navigation.cabinetVoting'), href: '/cabinet/voting', icon: Vote },
    { name: t('navigation.cabinetAmenities'), href: '/cabinet/amenities', icon: Calendar },
    { name: t('navigation.cabinetChat'), href: '/cabinet/chat', icon: MessageSquare },
    { name: t('navigation.cabinetAnnouncements'), href: '/cabinet/announcements', icon: Bell },
    { name: t('navigation.cabinetCommunity'), href: '/cabinet/community', icon: ShoppingBag },
    { name: t('navigation.cabinetNotifications'), href: '/cabinet/notifications', icon: Bell },
    { name: t('navigation.cabinetSos'), href: '/cabinet/sos', icon: AlertTriangle },
    { name: t('navigation.cabinetProfile'), href: '/cabinet/profile', icon: User },
  ];

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            {t('common.loading')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left: Mobile hamburger & Logo */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                aria-label={t('cabinet.menu')}
              >
                <Menu className="w-5 h-5" />
              </button>

              <Link href="/cabinet" className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
                  <Building2 className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                  <span className="font-extrabold text-base tracking-tight text-slate-900 dark:text-white leading-none">
                    Shanyraq <span className="text-emerald-600">Шаңырақ</span>
                  </span>
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 leading-tight">
                    {t('cabinet.title')}
                  </span>
                </div>
              </Link>
            </div>

            {/* Center: Apartment info pill */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-slate-100 dark:bg-slate-800/80 rounded-full border border-slate-200 dark:border-slate-700/60 text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-xs">
                {complexName}
              </span>
              {unitNumber && (
                <>
                  <span className="text-slate-300 dark:text-slate-600">•</span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    {t('cabinet.apartment', { number: unitNumber })}
                  </span>
                </>
              )}
            </div>

            {/* Right: Controls (Theme, Language, Notification Bell, Profile) */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Theme toggle */}
              <button
                type="button"
                onClick={handleToggleTheme}
                className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500"
                aria-label={t('cabinet.theme')}
                title={themeMode === 'dark' ? t('cabinet.themeLight') : t('cabinet.themeDark')}
              >
                {themeMode === 'dark' ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-slate-600" />
                )}
              </button>

              {/* Language Selector */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs">
                <Globe className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <select
                  value={currentLang}
                  onChange={handleLanguageChange}
                  className="bg-transparent text-xs font-medium text-slate-700 dark:text-slate-200 outline-none cursor-pointer pr-1"
                  aria-label={t('common.language')}
                >
                  {SUPPORTED_LOCALES.map((code) => (
                    <option key={code} value={code} className="dark:bg-slate-900">
                      {LANGUAGE_LABELS[code]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notification Bell */}
              <NotificationBell />

              {/* Profile Link */}
              <Link
                href="/cabinet/profile"
                className={`flex items-center gap-2 p-1.5 rounded-lg border transition-colors ${
                  pathname === '/cabinet/profile'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                }`}
                aria-label={t('navigation.cabinetProfile')}
              >
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center">
                  {(user?.firstName || 'R').charAt(0).toUpperCase()}
                </div>
                <span className="hidden sm:inline text-xs font-semibold max-w-[100px] truncate">
                  {user?.firstName || 'Житель'}
                </span>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex gap-6">
        {/* Desktop Sidebar Navigation */}
        <aside className="hidden lg:block w-64 shrink-0">
          <nav
            className="sticky top-24 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 shadow-sm space-y-1"
            aria-label="Боковое меню кабинета"
          >
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.name}</span>
                </Link>
              );
            })}

            <div className="pt-3 mt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span>{t('profile.logoutButton') || 'Выйти'}</span>
              </button>
            </div>
          </nav>
        </aside>

        {/* Content Area */}
        <main className="flex-1 min-w-0 pb-20 lg:pb-6">{children}</main>
      </div>

      {/* Mobile Drawer (Menu Dialog) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer content */}
          <div className="fixed inset-y-0 left-0 w-full max-w-xs bg-white dark:bg-slate-900 shadow-2xl flex flex-col p-5 z-50 overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">Shanyraq</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{t('cabinet.title')}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                aria-label="Закрыть меню"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Resident card summary */}
            <div className="my-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs">
              <div className="font-semibold text-slate-900 dark:text-white">
                {user?.firstName} {user?.lastName}
              </div>
              <div className="text-slate-500 dark:text-slate-400 mt-0.5 truncate">{complexName}</div>
              {unitNumber && (
                <div className="mt-1 font-medium text-emerald-700 dark:text-emerald-400">
                  {t('cabinet.apartment', { number: unitNumber })}
                </div>
              )}
            </div>

            {/* Navigation links */}
            <nav className="flex-1 space-y-1">
              {navigation.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                      isActive
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 mt-4">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span>{t('profile.logoutButton') || 'Выйти'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Sticky Bottom Navigation Bar */}
      <nav
        className="fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 lg:hidden px-2 py-1.5 shadow-lg flex items-center justify-around"
        aria-label="Нижнее меню"
      >
        <Link
          href="/cabinet"
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-[10px] font-medium transition-colors ${
            pathname === '/cabinet'
              ? 'text-emerald-600 dark:text-emerald-400 font-bold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>{t('navigation.cabinetHome')}</span>
        </Link>

        <Link
          href="/cabinet/requests"
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-[10px] font-medium transition-colors ${
            pathname.startsWith('/cabinet/requests')
              ? 'text-emerald-600 dark:text-emerald-400 font-bold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Wrench className="w-4 h-4" />
          <span>{t('navigation.cabinetRequests')}</span>
        </Link>

        <Link
          href="/cabinet/access"
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-[10px] font-medium transition-colors ${
            pathname.startsWith('/cabinet/access')
              ? 'text-emerald-600 dark:text-emerald-400 font-bold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <KeyRound className="w-4 h-4" />
          <span>{t('navigation.cabinetAccess')}</span>
        </Link>

        <Link
          href="/cabinet/chat"
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-[10px] font-medium transition-colors ${
            pathname.startsWith('/cabinet/chat')
              ? 'text-emerald-600 dark:text-emerald-400 font-bold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>{t('navigation.cabinetChat')}</span>
        </Link>

        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-[10px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900"
          aria-label={t('cabinet.more')}
        >
          <Menu className="w-4 h-4" />
          <span>{t('cabinet.more')}</span>
        </button>
      </nav>
    </div>
  );
}
