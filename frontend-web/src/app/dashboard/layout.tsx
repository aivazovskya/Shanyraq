'use client';

import React, { useEffect, useRef, useState } from 'react';
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
  ShoppingBag,
  MessageSquare,
  BarChart3,
  ShieldAlert,
  ClipboardList,
  FileSpreadsheet,
  Menu,
  X,
} from 'lucide-react';
import { getStoredSession, clearSession, AuthUser } from '@/lib/api';
import { NotificationBell } from '@/components/NotificationBell';
import { GlobalSearch } from '@/components/GlobalSearch';

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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuDialog = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    const dialog = menuDialog.current;
    if (!dialog) return;
    if (!menuOpen) { dialog.close(); return; }
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const media = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (media.matches) setMenuOpen(false); };
    media.addEventListener('change', closeOnDesktop);
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      media.removeEventListener('change', closeOnDesktop);
      menuButton.current?.focus();
    };
  }, [menuOpen]);

  const navigation = [
    { name: t('navigation.dashboard'), href: '/dashboard', icon: LayoutDashboard },
    { name: t('navigation.analytics'), href: '/dashboard/analytics', icon: BarChart3, roles: ['SUPERADMIN', 'HOA_ADMIN', 'HOA_CHAIRMAN'] },
    { name: t('navigation.votings'), href: '/dashboard/votings', icon: Vote },
    { name: t('navigation.requests'), href: '/dashboard/requests', icon: Wrench },
    { name: t('navigation.verifications'), href: '/dashboard/verifications', icon: UserCheck },
    { name: t('navigation.residents'), href: '/dashboard/residents', icon: Users },
    { name: t('navigation.chat'), href: '/dashboard/chat', icon: MessageSquare, roles: ['SUPERADMIN', 'HOA_ADMIN', 'DISPATCHER'] },
    { name: t('navigation.meters'), href: '/dashboard/meters', icon: Gauge, roles: ['SUPERADMIN', 'HOA_ADMIN', 'DISPATCHER', 'HOA_CHAIRMAN'] },
    { name: t('navigation.finance'), href: '/dashboard/finance', icon: CreditCard, roles: ['SUPERADMIN', 'HOA_ADMIN', 'HOA_CHAIRMAN'] },
    { name: t('navigation.budget'), href: '/dashboard/finance/budget', icon: FileSpreadsheet, roles: ['SUPERADMIN', 'HOA_ADMIN', 'HOA_CHAIRMAN'] },
    { name: t('navigation.audit'), href: '/dashboard/finance/audit', icon: BarChart3, roles: ['SUPERADMIN', 'HOA_ADMIN', 'HOA_CHAIRMAN'] },
    { name: t('navigation.bookings'), href: '/dashboard/bookings', icon: Calendar, roles: ['SUPERADMIN', 'HOA_ADMIN', 'DISPATCHER', 'HOA_CHAIRMAN'] },
    { name: t('navigation.sos'), href: '/dashboard/sos', icon: AlertTriangle, roles: ['SUPERADMIN', 'HOA_ADMIN', 'DISPATCHER', 'SECURITY', 'HOA_CHAIRMAN'] },
    { name: t('navigation.communityBoard'), href: '/dashboard/community-board', icon: ShoppingBag, roles: ['SUPERADMIN', 'HOA_ADMIN', 'DISPATCHER'] },
    { name: t('navigation.tenants'), href: '/dashboard/tenants', icon: Building2, roles: ['SUPERADMIN'] },
    { name: t('navigation.auditLog'), href: '/dashboard/audit-log', icon: ShieldAlert, roles: ['SUPERADMIN', 'HOA_ADMIN', 'HOA_CHAIRMAN'] },
    { name: t('navigation.shiftHandover'), href: '/dashboard/shift-handover', icon: ClipboardList, roles: ['SUPERADMIN', 'HOA_ADMIN', 'DISPATCHER', 'SECURITY', 'HOA_CHAIRMAN'] },
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

  const groups = [
    { key: 'overview', paths: ['dashboard', 'analytics'] },
    { key: 'residents', paths: ['requests', 'chat', 'residents', 'verifications', 'announcements', 'community-board', 'votings'] },
    { key: 'building', paths: ['access', 'sos', 'shift-handover', 'meters', 'bookings'] },
    { key: 'management', paths: ['finance', 'finance/budget', 'finance/audit', 'tenants', 'audit-log'] },
  ];
  const visibleNavigation = navigation.filter((item) => !item.roles || (user && item.roles.includes(user.role)));
  const activeItem = visibleNavigation.find((item) => item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href));
  const sidebar = (
    <div className="flex h-full flex-col bg-slate-950 text-white">
      <div className="flex min-h-20 items-center gap-3 border-b border-white/10 px-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-500"><Building2 className="h-6 w-6" aria-hidden="true" /></div>
        <div className="min-w-0 flex-1"><p className="text-lg font-bold tracking-tight">Shanyraq</p><p className="truncate text-xs text-slate-400" title={user?.tenantName || undefined}>{user?.tenantName || t('dashboard.defaultComplex')}</p></div>
        <button onClick={() => setMenuOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 lg:hidden" aria-label={t('shell.closeMenu')}><X size={20} /></button>
      </div>
      <nav aria-label={t('shell.navigation')} className="min-h-0 flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {groups.map((group) => {
          const items = group.paths.map((path) => visibleNavigation.find((item) => item.href === (path === 'dashboard' ? '/dashboard' : `/dashboard/${path}`))).filter((item): item is typeof navigation[number] => Boolean(item));
          if (!items.length) return null;
          return <div key={group.key}><p className="mb-2 px-3 text-xs font-semibold tracking-wide text-slate-500">{t(`shell.${group.key}`)}</p><div className="space-y-1">{items.map((item) => {
            const Icon = item.icon;
            const active = item === activeItem;
            return <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} aria-current={active ? 'page' : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${active ? 'bg-sky-500/15 font-semibold text-sky-300 ring-1 ring-inset ring-sky-400/20' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" /><span>{item.name}</span>
            </Link>;
          })}</div></div>;
        })}
      </nav>
      <div className="flex items-center gap-3 border-t border-white/10 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold" aria-hidden="true">{user?.firstName?.[0]}{user?.lastName?.[0]}</div>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{user?.firstName} {user?.lastName}</p><p className="truncate text-xs text-slate-400">{getRoleLabel(user?.role)}</p></div>
        <button onClick={handleLogout} title={t('dashboard.logoutTitle')} aria-label={t('dashboard.logoutTitle')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-white/5 hover:text-red-300"><LogOut size={18} /></button>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-slate-50 lg:pl-[264px]">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:p-3 focus:text-slate-900">{t('shell.skipContent')}</a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] lg:block">{sidebar}</aside>
      <dialog ref={menuDialog} aria-label={t('shell.navigation')} onCancel={() => setMenuOpen(false)} onClose={() => setMenuOpen(false)}
        onClick={(event) => { if (event.target === event.currentTarget) setMenuOpen(false); }}
        className="m-0 h-dvh max-h-none w-[min(320px,88vw)] max-w-none border-0 bg-slate-950 p-0 backdrop:bg-slate-950/50 lg:hidden">{sidebar}</dialog>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3">
          <button ref={menuButton} onClick={() => setMenuOpen(true)} aria-expanded={menuOpen} aria-label={t('shell.openMenu')} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 lg:hidden"><Menu size={21} /></button>
          <div className="min-w-0 flex-1"><p className="truncate text-xs text-slate-500">{user?.tenantName || t('dashboard.defaultComplex')}</p><p className="truncate text-sm font-semibold text-slate-900">{activeItem?.name || t('navigation.dashboard')}</p></div>
          <div className="order-last w-full lg:order-none lg:w-72 xl:w-96"><GlobalSearch /></div>
          <NotificationBell />
          <div className="flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 px-2">
            <Globe className="hidden h-4 w-4 text-slate-400 sm:block" aria-hidden="true" />
            <select value={currentLang} onChange={handleLanguageChange} aria-label={t('common.language')} className="max-w-24 bg-transparent py-2 text-xs font-medium text-slate-700 sm:max-w-none">
              {SUPPORTED_LOCALES.map((code) => <option key={code} value={code}>{LANGUAGE_LABELS[code]}</option>)}
            </select>
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1664px] min-w-0 px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}