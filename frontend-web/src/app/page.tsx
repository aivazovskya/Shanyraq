'use client';

import React, { useState } from 'react';
import { Building2, ShieldCheck, ArrowRight, Loader2, AlertCircle, Globe } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import '@/i18n';
import { changeWebLanguage, SupportedLocale, SUPPORTED_LOCALES } from '@/i18n';
import { API_BASE_URL, saveSession, getApiErrorMessage } from '@/lib/api';

const LANGUAGE_LABELS: Record<SupportedLocale, string> = {
  kk: 'Қазақша',
  ru: 'Русский',
  en: 'English',
};

export default function LoginPage() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentLang = (i18n.language?.slice(0, 2) as SupportedLocale) || 'ru';

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextLang = e.target.value as SupportedLocale;
    changeWebLanguage(nextLang);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!login.trim() || !password.trim()) {
      setError(t('auth.loginRequired'));
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/login-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: login.trim(), password }),
      });

      if (!res.ok) {
        let errData: any = {};
        try {
          errData = await res.json();
        } catch {}
        const errorMsg = Array.isArray(errData.message)
          ? errData.message.join(', ')
          : errData.message || t('auth.invalidCredentials');
        const err = new Error(errorMsg);
        (err as any).code = errData.code;
        (err as any).params = errData.params;
        throw err;
      }

      const data = await res.json();
      saveSession({
        token: data.accessToken,
        user: data.user,
      });

      router.push('/dashboard');
    } catch (err: any) {
      setError(getApiErrorMessage(err, t) || t('auth.connectionError'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-slate-50 relative">
      {/* Top right language switcher */}
      <div className="absolute top-6 right-6 sm:top-8 sm:right-8">
        <div className="flex items-center gap-1.5 bg-white border border-slate-200 shadow-sm rounded-lg px-3 py-1.5">
          <Globe className="w-4 h-4 text-slate-500 shrink-0" />
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

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-sky-600 text-white shadow-lg mb-4">
          <Building2 className="w-9 h-9" />
        </div>
        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Shanyraq <span className="text-sky-600">Шаңырақ</span>
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {t('auth.subtitle')}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 sm:rounded-2xl sm:px-10">
          {error && (
            <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleLogin}>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                {t('auth.loginLabel')}
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <input
                  type="text"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  className="block w-full rounded-lg border border-slate-300 py-2.5 px-3 text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 sm:text-sm"
                  placeholder={t('auth.loginPlaceholder')}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                {t('auth.passwordLabel')}
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-lg border border-slate-300 py-2.5 px-3 text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 sm:text-sm"
                  placeholder={t('auth.passwordPlaceholder')}
                  required
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-colors disabled:opacity-60"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <ArrowRight className="mr-2 w-4 h-4" />
                )}
                <span>{isLoading ? t('auth.loggingIn') : t('auth.loginButton')}</span>
              </button>
            </div>
          </form>

          <div className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-500 space-y-1">
            <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
              <ShieldCheck className="w-4 h-4" />
              <span>{t('auth.rbacNote')}</span>
            </div>
            <p>{t('auth.accessNote')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
