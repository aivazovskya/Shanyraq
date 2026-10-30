'use client';

import BrandMark from '@/components/BrandMark';
import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ArrowRight,
  Loader2,
  AlertCircle,
  Globe,
  KeyRound,
  CheckCircle2,
  Phone,
  Lock,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import '@/i18n';
import { changeWebLanguage, SupportedLocale, SUPPORTED_LOCALES } from '@/i18n';
import { API_BASE_URL, saveSession, getStoredSession, getApiErrorMessage } from '@/lib/api';
import { getHomeRouteForRole } from '@/lib/role-routing';

const LANGUAGE_LABELS: Record<SupportedLocale, string> = {
  kk: 'Қазақша',
  ru: 'Русский',
  en: 'English',
};

export default function LoginPage() {
  const router = useRouter();
  const { t, i18n } = useTranslation();

  // Redirect if already logged in
  useEffect(() => {
    const session = getStoredSession();
    if (session?.token && session?.user) {
      router.replace(getHomeRouteForRole(session.user.role));
    }
  }, [router]);

  // Auth method: by password or by phone SMS OTP
  const [authMethod, setAuthMethod] = useState<'PASSWORD' | 'OTP'>('PASSWORD');
  const [rememberDevice, setRememberDevice] = useState(true);

  // Password login state
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [changePasswordToken, setChangePasswordToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Phone OTP login state
  const [otpPhone, setOtpPhone] = useState('+7');
  const [otpCode, setOtpCode] = useState('');
  const [otpStep, setOtpStep] = useState<'PHONE' | 'CODE'>('PHONE');
  const [devCode, setDevCode] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Forgot password flow (for staff password reset)
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

  // --- Password Login Handler ---
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
        body: JSON.stringify({ login: login.trim(), password, rememberDevice }),
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

      if (data.mustChangePassword && data.changePasswordToken) {
        setChangePasswordToken(data.changePasswordToken);
        setPassword('');
        setError(null);
        return;
      }

      saveSession({
        token: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
        remember: rememberDevice,
      });

      router.push(getHomeRouteForRole(data.user.role));
    } catch (err: any) {
      setError(getApiErrorMessage(err, t) || t('auth.connectionError'));
    } finally {
      setIsLoading(false);
    }
  };

  // --- Phone OTP Request Handler ---
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpPhone.trim() || otpPhone.trim() === '+7') {
      setError(t('auth.phoneRequired') || t('auth.enterPhone'));
      return;
    }

    setError(null);
    setDevCode(null);
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: otpPhone.trim() }),
      });

      if (!res.ok) {
        let errData: any = {};
        try {
          errData = await res.json();
        } catch {}
        const errorMsg = Array.isArray(errData.message)
          ? errData.message.join(', ')
          : errData.message || t('auth.connectionError');
        throw new Error(errorMsg);
      }

      const data = await res.json();
      if (data.devCode) {
        setDevCode(data.devCode);
      }
      setOtpStep('CODE');
    } catch (err: any) {
      setError(err?.message || t('auth.connectionError'));
    } finally {
      setIsLoading(false);
    }
  };

  // --- Phone OTP Verify Handler ---
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) {
      setError(t('auth.loginRequired'));
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: otpPhone.trim(), code: otpCode.trim(), rememberDevice }),
      });

      if (!res.ok) {
        let errData: any = {};
        try {
          errData = await res.json();
        } catch {}
        const errorMsg = Array.isArray(errData.message)
          ? errData.message.join(', ')
          : errData.message || t('auth.invalidCode');
        throw new Error(errorMsg);
      }

      const data = await res.json();
      saveSession({
        token: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
        remember: rememberDevice,
      });

      router.push(getHomeRouteForRole(data.user.role));
    } catch (err: any) {
      setError(err?.message || t('auth.connectionError'));
    } finally {
      setIsLoading(false);
    }
  };

  // --- Initial Password Change ---
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
        refreshToken: data.refreshToken,
        user: data.user,
        remember: rememberDevice,
      });

      router.push(getHomeRouteForRole(data.user.role));
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

  // --- Forgot Password Flow (Staff) ---
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
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-slate-50 dark:bg-slate-950 transition-colors relative">
      {/* Top right language switcher */}
      <div className="absolute top-6 right-6 sm:top-8 sm:right-8">
        <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm rounded-lg px-3 py-1.5">
          <Globe className="w-4 h-4 text-slate-500 shrink-0" />
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
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-600 text-white shadow-lg mb-4">
          <BrandMark className="w-10 h-10" />
        </div>
        <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Shanyraq
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {t('auth.subtitle')}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-slate-900 py-8 px-6 shadow-sm border border-slate-200 dark:border-slate-800 sm:rounded-2xl sm:px-10">
          {/* Method selector tabs (only if not in special reset/initial password flows) */}
          {!changePasswordToken && !isForgotPassword && (
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-6">
              <button
                type="button"
                onClick={() => {
                  setAuthMethod('PASSWORD');
                  setError(null);
                }}
                className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                  authMethod === 'PASSWORD'
                    ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{t('auth.byPassword')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMethod('OTP');
                  setError(null);
                }}
                className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                  authMethod === 'OTP'
                    ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Phone className="w-3.5 h-3.5" />
                <span>{t('auth.byPhoneOtp')}</span>
              </button>
            </div>
          )}

          {error && (
            <div role="alert" className="mb-5 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-200 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div role="status" className="mb-5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200 text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Special Flow: Set Initial Password */}
          {changePasswordToken ? (
            <form className="space-y-5" onSubmit={handleSetInitialPassword}>
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 text-xs">
                <div className="font-semibold text-amber-900 dark:text-amber-100 mb-1 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-amber-700 dark:text-amber-300" />
                  <span>{t('auth.setInitialPasswordTitle')}</span>
                </div>
                <p className="text-amber-800 dark:text-amber-300">{t('auth.setInitialPasswordSubtitle')}</p>
              </div>

              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t('auth.newPasswordLabel')}
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <input
                    id="newPassword"
                    autoComplete="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white py-2.5 px-3 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 sm:text-sm"
                    placeholder={t('auth.newPasswordPlaceholder')}
                    required
                    minLength={8}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t('auth.confirmPasswordLabel')}
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <input
                    id="confirmPassword"
                    autoComplete="new-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white py-2.5 px-3 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 sm:text-sm"
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
                  className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-colors disabled:opacity-60"
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
                  className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                >
                  {t('auth.backToLogin')}
                </button>
              </div>
            </form>
          ) : isForgotPassword && forgotStep === 'PHONE' ? (
            /* Forgot Password: Step 1 (Phone) */
            <form className="space-y-5" onSubmit={handleRequestResetOtp}>
              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200 text-xs">
                <div className="font-semibold text-emerald-900 dark:text-emerald-100 mb-1 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
                  <span>{t('auth.forgotPasswordTitle')}</span>
                </div>
                <p className="text-emerald-800 dark:text-emerald-300">{t('auth.forgotPasswordSubtitle')}</p>
              </div>

              <div>
                <label htmlFor="resetPhone" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t('auth.staffPhoneLabel')}
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <input
                    id="resetPhone"
                    type="text"
                    value={resetPhone}
                    onChange={(e) => setResetPhone(e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white py-2.5 px-3 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 sm:text-sm"
                    placeholder="+7 (701) 000-00-00"
                    required
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-colors disabled:opacity-60"
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
                  className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                >
                  {t('auth.backToLogin')}
                </button>
              </div>
            </form>
          ) : isForgotPassword && forgotStep === 'OTP' ? (
            /* Forgot Password: Step 2 (Code + New Password) */
            <form className="space-y-5" onSubmit={handleResetPassword}>
              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200 text-xs">
                <div className="font-semibold text-emerald-900 dark:text-emerald-100 mb-1 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
                  <span>{t('auth.resetPasswordTitle')}</span>
                </div>
                <p className="text-emerald-800 dark:text-emerald-300">{t('auth.resetPasswordSubtitle')}</p>
              </div>

              <div>
                <label htmlFor="resetCode" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t('auth.smsCodeLabel')}
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <input
                    id="resetCode"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    type="text"
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white py-2.5 px-3 text-slate-900 placeholder-slate-400 tracking-widest text-center text-lg font-mono focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="0000"
                    maxLength={6}
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="resetNewPassword" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t('auth.newPasswordLabel')}
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <input
                    id="resetNewPassword"
                    autoComplete="new-password"
                    type="password"
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white py-2.5 px-3 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 sm:text-sm"
                    placeholder={t('auth.newPasswordPlaceholder')}
                    required
                    minLength={8}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="resetConfirmPassword" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t('auth.confirmPasswordLabel')}
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <input
                    id="resetConfirmPassword"
                    autoComplete="new-password"
                    type="password"
                    value={resetConfirmPassword}
                    onChange={(e) => setResetConfirmPassword(e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white py-2.5 px-3 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 sm:text-sm"
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
                  className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-colors disabled:opacity-60"
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
                  className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                >
                  {t('auth.backToLogin')}
                </button>
              </div>
            </form>
          ) : authMethod === 'OTP' ? (
            /* Phone OTP Login */
            otpStep === 'PHONE' ? (
              <form className="space-y-5" onSubmit={handleRequestOtp}>
                <div>
                  <label htmlFor="otpPhone" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t('auth.enterPhone')}
                  </label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <input
                      id="otpPhone"
                      type="tel"
                      value={otpPhone}
                      onChange={(e) => setOtpPhone(e.target.value)}
                      className="block w-full rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white py-2.5 px-3 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 sm:text-sm"
                      placeholder="+7 (701) 555-01-01"
                      required
                    />
                  </div>
                </div>

                <div className="flex items-center">
                  <input
                    id="rememberDeviceOtpPhone"
                    type="checkbox"
                    checked={rememberDevice}
                    onChange={(e) => setRememberDevice(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800"
                  />
                  <label
                    htmlFor="rememberDeviceOtpPhone"
                    className="ml-2 block text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none"
                  >
                    {t('auth.rememberDevice')}
                  </label>
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-colors disabled:opacity-60"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <ArrowRight className="mr-2 w-4 h-4" />
                    )}
                    <span>{isLoading ? t('auth.sendingCode') : t('auth.getSmsCode')}</span>
                  </button>
                </div>
              </form>
            ) : (
              <form className="space-y-5" onSubmit={handleVerifyOtp}>
                {devCode && (
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 text-xs font-mono flex items-center justify-between">
                    <span>{t('auth.devCodeHint', { code: devCode })}</span>
                    <button
                      type="button"
                      onClick={() => setOtpCode(devCode)}
                      className="underline font-bold text-amber-700 dark:text-amber-300 hover:text-amber-900 ml-2"
                    >
                      OK
                    </button>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="otpCode" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t('auth.otpCode')}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setOtpStep('PHONE');
                        setDevCode(null);
                        setOtpCode('');
                      }}
                      className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      {t('auth.changePhone')}
                    </button>
                  </div>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <input
                      id="otpCode"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      className="block w-full rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white py-2.5 px-3 text-slate-900 placeholder-slate-400 tracking-widest text-center text-lg font-mono focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      placeholder="0000"
                      maxLength={6}
                      required
                    />
                  </div>
                </div>

                <div className="flex items-center">
                  <input
                    id="rememberDeviceOtpPhone"
                    type="checkbox"
                    checked={rememberDevice}
                    onChange={(e) => setRememberDevice(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800"
                  />
                  <label
                    htmlFor="rememberDeviceOtpPhone"
                    className="ml-2 block text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none"
                  >
                    {t('auth.rememberDevice')}
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    id="rememberDeviceOtpCode"
                    type="checkbox"
                    checked={rememberDevice}
                    onChange={(e) => setRememberDevice(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800"
                  />
                  <label
                    htmlFor="rememberDeviceOtpCode"
                    className="ml-2 block text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none"
                  >
                    {t('auth.rememberDevice')}
                  </label>
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-colors disabled:opacity-60"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <ArrowRight className="mr-2 w-4 h-4" />
                    )}
                    <span>{isLoading ? t('auth.loggingIn') : t('auth.verifyAndLogin')}</span>
                  </button>
                </div>
              </form>
            )
          ) : (
            /* Password Login (Default) */
            <form className="space-y-5" onSubmit={handleLogin}>
              <div>
                <label htmlFor="login" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t('auth.loginLabel')}
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <input
                    id="login"
                    autoComplete="username"
                    type="text"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white py-2.5 px-3 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 sm:text-sm"
                    placeholder={t('auth.loginPlaceholder')}
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
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
                    className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 font-medium transition-colors"
                  >
                    {t('auth.forgotPassword')}
                  </button>
                </div>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <input
                    id="password"
                    autoComplete="current-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white py-2.5 px-3 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 sm:text-sm"
                    placeholder={t('auth.passwordPlaceholder')}
                    required
                  />
                </div>
              </div>

              <div className="flex items-center">
                <input
                  id="rememberDevicePassword"
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800"
                />
                <label
                  htmlFor="rememberDevicePassword"
                  className="ml-2 block text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none"
                >
                  {t('auth.rememberDevice')}
                </label>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-colors disabled:opacity-60"
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

          <div className="mt-6 border-t border-slate-200 dark:border-slate-800 pt-4 text-xs text-slate-500 dark:text-slate-400 space-y-1">
            <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
              <ShieldCheck className="w-4 h-4" />
              <span>{t('auth.rbacNote')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
