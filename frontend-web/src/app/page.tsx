'use client';

import React, { useState } from 'react';
import { Building2, ShieldCheck, ArrowRight, Loader2, AlertCircle, Globe, KeyRound, CheckCircle2 } from 'lucide-react';
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
  const [changePasswordToken, setChangePasswordToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Forgot password flow
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotStep, setForgotStep] = useState<'PHONE' | 'OTP'>('PHONE');
  const [resetPhone, setResetPhone] = useState('+7');
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');

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

      // Если требуется смена временного пароля при первом входе
      if (data.mustChangePassword && data.changePasswordToken) {
        setChangePasswordToken(data.changePasswordToken);
        setPassword('');
        setError(null);
        return;
      }

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

  const handleSetInitialPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword.trim() || !confirmPassword.trim()) {
      setError(t('auth.loginRequired'));
      return;
    }

    if (newPassword.length < 8) {
      setError(t('auth.passwordTooShort'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/set-initial-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changePasswordToken,
          newPassword,
        }),
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

  const handleCancelPasswordChange = () => {
    setChangePasswordToken(null);
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
  };

  const handleRequestResetOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPhone.trim() || resetPhone.trim() === '+7') {
      setError(t('auth.phoneRequired'));
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/staff/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: resetPhone.trim() }),
      });

      if (!res.ok) {
        let errData: any = {};
        try {
          errData = await res.json();
        } catch {}
        const errorMsg = Array.isArray(errData.message)
          ? errData.message.join(', ')
          : errData.message || t('auth.staffNotFound');
        const err = new Error(errorMsg);
        (err as any).code = errData.code;
        (err as any).params = errData.params;
        throw err;
      }

      setForgotStep('OTP');
      setError(null);
    } catch (err: any) {
      setError(getApiErrorMessage(err, t) || t('auth.connectionError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetCode.trim() || !resetNewPassword.trim() || !resetConfirmPassword.trim()) {
      setError(t('auth.loginRequired'));
      return;
    }

    if (resetNewPassword.length < 8) {
      setError(t('auth.passwordTooShort'));
      return;
    }

    if (resetNewPassword !== resetConfirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/staff/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: resetPhone.trim(),
          code: resetCode.trim(),
          newPassword: resetNewPassword,
        }),
      });

      if (!res.ok) {
        let errData: any = {};
        try {
          errData = await res.json();
        } catch {}
        const errorMsg = Array.isArray(errData.message)
          ? errData.message.join(', ')
          : errData.message || t('auth.invalidCode');
        const err = new Error(errorMsg);
        (err as any).code = errData.code;
        (err as any).params = errData.params;
        throw err;
      }

      setIsForgotPassword(false);
      setForgotStep('PHONE');
      setLogin(resetPhone.trim());
      setPassword('');
      setResetCode('');
      setResetNewPassword('');
      setResetConfirmPassword('');
      setSuccessMessage(t('auth.resetPasswordSuccess'));
    } catch (err: any) {
      setError(getApiErrorMessage(err, t) || t('auth.connectionError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelForgotPassword = () => {
    setIsForgotPassword(false);
    setForgotStep('PHONE');
    setResetCode('');
    setResetNewPassword('');
    setResetConfirmPassword('');
    setError(null);
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

          {successMessage && (
            <div className="mb-5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {changePasswordToken ? (
            <form className="space-y-5" onSubmit={handleSetInitialPassword}>
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                <div className="font-semibold text-amber-900 mb-1 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-amber-700" />
                  <span>{t('auth.setInitialPasswordTitle')}</span>
                </div>
                <p className="text-amber-800">{t('auth.setInitialPasswordSubtitle')}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  {t('auth.newPasswordLabel')}
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 py-2.5 px-3 text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 sm:text-sm"
                    placeholder={t('auth.newPasswordPlaceholder')}
                    required
                    minLength={8}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  {t('auth.confirmPasswordLabel')}
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 py-2.5 px-3 text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 sm:text-sm"
                    placeholder={t('auth.confirmPasswordPlaceholder')}
                    required
                    minLength={8}
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
                    <KeyRound className="mr-2 w-4 h-4" />
                  )}
                  <span>{isLoading ? t('auth.settingInitialPassword') : t('auth.setInitialPasswordButton')}</span>
                </button>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={handleCancelPasswordChange}
                  className="text-xs text-slate-500 hover:text-slate-800 transition-colors"
                >
                  {t('auth.backToLogin')}
                </button>
              </div>
            </form>
          ) : isForgotPassword && forgotStep === 'PHONE' ? (
            <form className="space-y-5" onSubmit={handleRequestResetOtp}>
              <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 text-xs">
                <div className="font-semibold text-sky-900 mb-1 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-sky-700" />
                  <span>{t('auth.forgotPasswordTitle')}</span>
                </div>
                <p className="text-sky-800">{t('auth.forgotPasswordSubtitle')}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  {t('auth.staffPhoneLabel')}
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <input
                    type="text"
                    value={resetPhone}
                    onChange={(e) => setResetPhone(e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 py-2.5 px-3 text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 sm:text-sm"
                    placeholder="+7 (701) 000-00-00"
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
                  <span>{isLoading ? t('auth.sendingCode') : t('auth.sendCode')}</span>
                </button>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={handleCancelForgotPassword}
                  className="text-xs text-slate-500 hover:text-slate-800 transition-colors"
                >
                  {t('auth.backToLogin')}
                </button>
              </div>
            </form>
          ) : isForgotPassword && forgotStep === 'OTP' ? (
            <form className="space-y-5" onSubmit={handleResetPassword}>
              <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 text-xs">
                <div className="font-semibold text-sky-900 mb-1 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-sky-700" />
                  <span>{t('auth.resetPasswordTitle')}</span>
                </div>
                <p className="text-sky-800">{t('auth.resetPasswordSubtitle')}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  {t('auth.smsCodeLabel')}
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <input
                    type="text"
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 py-2.5 px-3 text-slate-900 placeholder-slate-400 tracking-widest text-center text-lg font-mono focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    placeholder="0000"
                    maxLength={6}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  {t('auth.newPasswordLabel')}
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <input
                    type="password"
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 py-2.5 px-3 text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 sm:text-sm"
                    placeholder={t('auth.newPasswordPlaceholder')}
                    required
                    minLength={8}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  {t('auth.confirmPasswordLabel')}
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <input
                    type="password"
                    value={resetConfirmPassword}
                    onChange={(e) => setResetConfirmPassword(e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 py-2.5 px-3 text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 sm:text-sm"
                    placeholder={t('auth.confirmPasswordPlaceholder')}
                    required
                    minLength={8}
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
                    <KeyRound className="mr-2 w-4 h-4" />
                  )}
                  <span>{isLoading ? t('auth.resettingPassword') : t('auth.resetPasswordButton')}</span>
                </button>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={handleCancelForgotPassword}
                  className="text-xs text-slate-500 hover:text-slate-800 transition-colors"
                >
                  {t('auth.backToLogin')}
                </button>
              </div>
            </form>
          ) : (
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
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-700">
                    {t('auth.passwordLabel')}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setSuccessMessage(null);
                      setIsForgotPassword(true);
                      setForgotStep('PHONE');
                    }}
                    className="text-xs text-sky-600 hover:text-sky-700 font-medium transition-colors"
                  >
                    {t('auth.forgotPassword')}
                  </button>
                </div>
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
          )}

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
