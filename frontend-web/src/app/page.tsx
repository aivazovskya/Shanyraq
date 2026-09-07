'use client';

import React, { useState } from 'react';
import { Building2, ShieldCheck, KeyRound, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const [login, setLogin] = useState('+77001000001');
  const [password, setPassword] = useState('Shanyraq2026!');
  const [role, setRole] = useState('HOA_ADMIN');

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-slate-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-sky-600 text-white shadow-lg mb-4">
          <Building2 className="w-9 h-9" />
        </div>
        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Shanyraq <span className="text-sky-600">Шаңырақ</span>
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Веб-панель управления ОСИ, УК и диспетчерской службы
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 sm:rounded-2xl sm:px-10">
          <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Быстрый выбор тестовой роли
              </label>
              <select
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white py-2 px-3 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 text-sm"
                value={role}
                onChange={(e) => {
                  const r = e.target.value;
                  setRole(r);
                  if (r === 'HOA_ADMIN') setLogin('+77001000001');
                  if (r === 'HOA_CHAIRMAN') setLogin('+77001000002');
                  if (r === 'DISPATCHER') setLogin('+77001000003');
                  if (r === 'SECURITY') setLogin('+77001000004');
                }}
              >
                <option value="HOA_ADMIN">Управляющая компания (Администратор)</option>
                <option value="HOA_CHAIRMAN">Председатель ОСИ</option>
                <option value="DISPATCHER">Диспетчер Service Desk</option>
                <option value="SECURITY">Сотрудник охраны (КПП)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Телефон или Email
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <input
                  type="text"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  className="block w-full rounded-lg border border-slate-300 py-2.5 px-3 text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 sm:text-sm"
                  placeholder="+7 (7XX) XXX-XX-XX"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Пароль</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-lg border border-slate-300 py-2.5 px-3 text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 sm:text-sm"
                  required
                />
              </div>
            </div>

            <div>
              <Link
                href="/dashboard"
                className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-colors"
              >
                Войти в систему
                <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </div>
          </form>

          <div className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-500 space-y-1">
            <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
              <ShieldCheck className="w-4 h-4" />
              <span>Защищенный шлюз с разграничением прав доступа (RBAC)</span>
            </div>
            <p>Пилотный объект: ЖК «Шаңырақ Премиум», г. Астана</p>
          </div>
        </div>
      </div>
    </div>
  );
}
