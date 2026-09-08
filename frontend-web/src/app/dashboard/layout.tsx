'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import '@/i18n';
import { changeWebLanguage, SupportedLocale, SUPPORTED_LOCALES } from '@/i18n';
import {
  Building2,
  LayoutDashboard,
  Vote,
  Wrench,
  KeyRound,
  Bell,
  LogOut,
  UserCheck,
  Users,
  Loader2,
  Globe,
  CreditCard,
  Gauge,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import { getStoredSession, clearSession, AuthUser } from '@/lib/api';

const LANGUAGE_LABELS: Record<SupportedLocale, string> = {
  kk: 'Қазақша',
  ru: 'Русский',
  en: 'English',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  const navigation = [
    { name: t('navigation.dashboard'), href: '/dashboard', icon: LayoutDashboard },
    { name: t('navigation.votings'), href: '/dashboard/votings', icon: Vote },
    { name: t('navigation.requests'), href: '/dashboard/requests', icon: Wrench },
    { name: t('navigation.verifications'), href: '/dashboard/verifications', icon: UserCheck },
    { name: t('navigation.residents'), href: '/dashboard/residents', icon: Users },
    { name: t('navigation.meters'), href: '/dashboard/meters', icon: Gauge, roles: ['SUPERADMIN', 'HOA_ADMIN', 'DISPATCHER', 'HOA_CHAIRMAN'] },
    { name: t('navigation.finance'), href: '/dashboard/finance', icon: CreditCard, roles: ['SUPERADMIN', 'HOA_ADMIN', 'HOA_CHAIRMAN'] },
    { name: t('navigation.bookings'), href: '/dashboard/bookings', icon: Calendar, roles: ['SUPERADMIN', 'HOA_ADMIN', 'DISPATCHER', 'HOA_CHAIRMAN'] },
    { name: t('navigation.sos'), href: '/dashboard/sos', icon: AlertTriangle, roles: ['SUPERADMIN', 'HOA_ADMIN', 'DISPATCHER', 'SECURITY', 'HOA_CHAIRMAN'] },
    { name: t('navigation.access'), href: '/dashboard/access', icon: KeyRound },
    { name: t('navigation.announcements'), href: '/dashboard/announcements', icon: Bell },
  ];

  useEffect(() => {
    const session = getStoredSession();
    if (!session || !session.token || !session.user) {
      router.push('/');
    } else {
      setUser(session.user);
      setIsCheckingAuth(false);
    }
  }, [router]);

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    clearSession();
    router.push('/');
  };

  const currentLang = (i18n.language?.slice(0, 2) as SupportedLocale) || 'ru';

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextLang = e.target.value as SupportedLocale;
    changeWebLanguage(nextLang);
  };

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'SUPERADMIN':
        return t('roles.superadmin');
      case 'HOA_CHAIRMAN':
        return t('roles.hoa_chairman');
      case 'DISPATCHER':
        return t('roles.dispatcher');
      case 'SECURITY':
        return t('roles.security');
      default:
        return t('roles.management_company');
    }
  };

  // Если сессия не проверена или отсутствует, предотвращаем рендер приватного контента
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
          <p className="text-sm font-medium text-slate-500">{t('dashboard.authChecking')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col justify-between shrink-0">
        <div>
          {/* Brand header */}
          <div className="h-16 flex items-center px-6 gap-3 border-b border-slate-800 bg-slate-950">
            <div className="w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center text-white font-bold">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-base tracking-wide text-white">Shanyraq</div>
              <div className="text-[11px] text-sky-400 font-medium truncate max-w-[140px]">
                {user?.tenantName || t('dashboard.defaultComplex')}
              </div>
            </div>
          </div>

          {/* Nav items */}
          <nav className="p-4 space-y-1.5">
            {navigation
              .filter((item) => !item.roles || (user && item.roles.includes(user.role)))
              .map((item) => {
                const Icon = item.icon;
                const isActive = item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-sky-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
          </nav>
        </div>

        {/* User footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-white truncate max-w-[150px]">
                {user ? `${user.firstName} ${user.lastName}` : t('roles.employee')}
              </div>
              <div className="text-xs text-slate-400">
                {getRoleLabel(user?.role)}
              </div>
            </div>
            <button
              onClick={handleLogout}
              title={t('dashboard.logoutTitle')}
              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
              {t('dashboard.systemOnline')}
            </span>
            <span className="text-xs text-slate-500">
              {t('dashboard.complexAddressInfo')}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold px-2.5 py-1 bg-sky-50 text-sky-700 rounded-lg border border-sky-200">
              {t('dashboard.standardBadge')}
            </span>

            {/* Language Switcher Dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
              <Globe className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <select
                value={currentLang}
                onChange={handleLanguageChange}
                className="bg-transparent text-xs font-medium text-slate-700 outline-none cursor-pointer pr-1"
                aria-label={t('common.language')}
              >
                {SUPPORTED_LOCALES.map((code) => (
                  <option key={code} value={code}>
                    {LANGUAGE_LABELS[code]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>

        {/* Page body */}
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
