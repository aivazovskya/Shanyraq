'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2,
  LayoutDashboard,
  Vote,
  Wrench,
  KeyRound,
  Users,
  Bell,
  LogOut,
} from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navigation = [
    { name: 'Сводка и аналитика', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Голосования ОСС', href: '/dashboard/votings', icon: Vote },
    { name: 'Service Desk (Заявки)', href: '/dashboard/requests', icon: Wrench },
    { name: 'Жилой фонд и квартиры', href: '/dashboard/properties', icon: Users },
    { name: 'СКУД и шлагбаумы', href: '/dashboard/access', icon: KeyRound },
    { name: 'Оповещения и новости', href: '/dashboard/announcements', icon: Bell },
  ];

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
              <div className="text-[11px] text-sky-400 font-medium">ЖК «Шаңырақ Премиум»</div>
            </div>
          </div>

          {/* Nav items */}
          <nav className="p-4 space-y-1.5">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
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
              <div className="text-sm font-medium text-white">Алихан Бокейханов</div>
              <div className="text-xs text-slate-400">Управляющая компания</div>
            </div>
            <Link
              href="/"
              title="Выйти"
              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg"
            >
              <LogOut className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
              ● Система онлайн
            </span>
            <span className="text-xs text-slate-500">
              г. Астана, ул. Достык, 15/1 • 140 квартир • 12 500 м²
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold px-2.5 py-1 bg-sky-50 text-sky-700 rounded-lg border border-sky-200">
              Казахстанский стандарт ОСС
            </span>
          </div>
        </header>

        {/* Page body */}
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
