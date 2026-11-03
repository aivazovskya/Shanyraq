'use client';

import { PasswordInput } from '@/components/PasswordInput';
import React, { useEffect, useRef, useState } from 'react';
import { Building2, ShieldCheck, ArrowRight, Loader2, AlertCircle, KeyRound, CheckCircle2, UserRound, Wallet, MessageSquare, ClipboardCheck } from 'lucide-react';
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
  const submitLock = useRef(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const currentStep = changePasswordToken ? 'initial-password' : isForgotPassword ? forgotStep : 'login';
  const previousStep = useRef(currentStep);

  useEffect(() => {
    const feedback = error ? errorRef.current : successMessage ? successRef.current : null;
    if (feedback) {
      feedback.focus({ preventScroll: true });
      feedback.scrollIntoView({ block: 'nearest' });
    }
  }, [error, successMessage]);

  useEffect(() => {
    if (previousStep.current !== currentStep) {
      previousStep.current = currentStep;
      if (!error && !successMessage) {
        titleRef.current?.focus({ preventScroll: true });
        titleRef.current?.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [currentStep, error, successMessage]);

  const startRequest = () => {
    submitLock.current = true;
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);
  };

  const finishRequest = () => {
    submitLock.current = false;
    setIsLoading(false);
  };

  const updateField = (setter: React.Dispatch<React.SetStateAction<string>>, value: string) => {
    setter(value);
    setError(null);
    setSuccessMessage(null);
  };

  const currentLang = (i18n.language?.slice(0, 2) as SupportedLocale) || 'ru';

  const handleLanguageChange = (nextLang: SupportedLocale) => {
    changeWebLanguage(nextLang);
    setError(null);
    setSuccessMessage(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLock.current) return;
    if (!login.trim() || !password.trim()) {
      setError(t('auth.loginRequired'));
      return;
    }

    startRequest();

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
      finishRequest();
    }
  };

  const handleSetInitialPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLock.current) return;
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

    startRequest();

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
      finishRequest();
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
    if (submitLock.current) return;
    if (!resetPhone.trim() || resetPhone.trim() === '+7') {
      setError(t('auth.phoneRequired'));
      return;
    }

    startRequest();

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
      finishRequest();
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLock.current) return;
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

    startRequest();

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
      finishRequest();
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

  const formTitle = changePasswordToken ? t('auth.setInitialPasswordTitle') : isForgotPassword
    ? t(forgotStep === 'PHONE' ? 'auth.forgotPasswordTitle' : 'auth.resetPasswordTitle') : t('auth.signInTitle');
  const formSubtitle = changePasswordToken ? t('auth.setInitialPasswordSubtitle') : isForgotPassword
    ? t(forgotStep === 'PHONE' ? 'auth.forgotPasswordSubtitle' : 'auth.resetPasswordSubtitle') : t('auth.signInSubtitle');

  return (
    <div className="login-shell min-h-dvh flex flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-5 pt-6 sm:px-8 sm:pt-8">
        <a href="/" className="inline-flex shrink-0 items-center gap-2.5 rounded-xl text-slate-900" aria-label="Shanyraq">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white shadow-lg shadow-sky-900/10">
            <Building2 className="h-6 w-6" />
          </span>
          <span className="text-lg font-bold tracking-tight">Shanyraq</span>
        </a>
        <div className="inline-flex shrink-0 gap-0.5 rounded-2xl border border-white/80 bg-white/75 p-1 shadow-sm" role="group" aria-label={t('common.language')}>
          {SUPPORTED_LOCALES.map((code) => (
            <button key={code} type="button" disabled={isLoading} aria-label={LANGUAGE_LABELS[code]} aria-pressed={currentLang === code}
              onClick={() => handleLanguageChange(code)}
              className={`min-h-9 min-w-9 rounded-xl px-2 text-xs font-semibold transition-colors ${currentLang === code ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-500 hover:bg-sky-50 hover:text-sky-700'}`}>
              {code === 'kk' ? 'Қаз' : code === 'ru' ? 'Рус' : 'EN'}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-9 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-[1.12fr_1fr] lg:gap-20 lg:py-20">
        <section aria-labelledby="login-intro-title" className="mx-auto w-full min-w-0 max-w-lg lg:max-w-none">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/75 px-3 py-1.5 text-xs font-medium text-sky-700">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-600" />{t('auth.portalLabel')}
          </span>
          <h1 id="login-intro-title" className="text-[2.1rem] font-bold leading-[1.08] tracking-[-0.045em] text-slate-900 sm:text-5xl lg:text-[3.25rem]">
            <span className="block">{t('auth.heroLineOne')}</span>
            <span className="block">{t('auth.heroLineTwo')}</span>
          </h1>
          <p className="mt-5 hidden max-w-md text-sm leading-7 text-slate-500 sm:text-base lg:block">{t('auth.heroDescription')}</p>
          <ul className="mt-10 hidden space-y-6 lg:block">
            {[
              { Icon: MessageSquare, title: 'auth.featureRequestsTitle', description: 'auth.featureRequestsText' },
              { Icon: Wallet, title: 'auth.featureFinanceTitle', description: 'auth.featureFinanceText' },
              { Icon: ClipboardCheck, title: 'auth.featureTeamTitle', description: 'auth.featureTeamText' },
            ].map(({ Icon, title, description }) => (
              <li key={title} className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white bg-white/80 text-sky-600 shadow-sm"><Icon className="h-5 w-5" /></span>
                <div className="pt-0.5"><h2 className="text-sm font-semibold text-slate-800">{t(title)}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{t(description)}</p></div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="login-form-title" className="mx-auto w-full min-w-0 max-w-lg lg:justify-self-end">
        <div className="login-card rounded-[28px] border border-white/90 bg-white/90 px-6 py-8 sm:p-8">
          <div className="mb-7">
            <span className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-100 bg-sky-50 text-sky-600">
              {isForgotPassword || changePasswordToken ? <KeyRound className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
            </span>
            <h2 ref={titleRef} tabIndex={-1} id="login-form-title" className="text-2xl font-bold leading-tight tracking-tight text-slate-900 outline-none sm:text-[28px]">{formTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{formSubtitle}</p>
          </div>
          {error && (
            <div ref={errorRef} tabIndex={-1} role="alert" className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-center gap-2 outline-none">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div ref={successRef} tabIndex={-1} role="status" className="mb-5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2 outline-none">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {changePasswordToken ? (
            <form aria-labelledby="login-form-title" aria-busy={isLoading} onSubmit={handleSetInitialPassword}>
              <fieldset disabled={isLoading} className="min-w-0 space-y-5 border-0 p-0">

              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700">
                  {t('auth.newPasswordLabel')}
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <PasswordInput id="newPassword" autoComplete="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => updateField(setNewPassword, e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 py-2.5 px-3 text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 sm:text-sm"
                    placeholder={t('auth.newPasswordPlaceholder')}
                    required
                    minLength={8}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700">
                  {t('auth.confirmPasswordLabel')}
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <PasswordInput id="confirmPassword" autoComplete="new-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => updateField(setConfirmPassword, e.target.value)}
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
                  className="w-full min-h-12 flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-colors disabled:opacity-60"
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
              </fieldset>
            </form>
          ) : isForgotPassword && forgotStep === 'PHONE' ? (
            <form aria-labelledby="login-form-title" aria-busy={isLoading} onSubmit={handleRequestResetOtp}>
              <fieldset disabled={isLoading} className="min-w-0 space-y-5 border-0 p-0">

              <div>
                <label htmlFor="resetPhone" className="block text-sm font-medium text-slate-700">
                  {t('auth.staffPhoneLabel')}
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <input id="resetPhone" autoComplete="tel" inputMode="tel"
                    type="tel"
                    value={resetPhone}
                    onChange={(e) => updateField(setResetPhone, e.target.value)}
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
                  className="w-full min-h-12 flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-colors disabled:opacity-60"
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
              </fieldset>
            </form>
          ) : isForgotPassword && forgotStep === 'OTP' ? (
            <form aria-labelledby="login-form-title" aria-busy={isLoading} onSubmit={handleResetPassword}>
              <fieldset disabled={isLoading} className="min-w-0 space-y-5 border-0 p-0">

              <div>
                <label htmlFor="resetCode" className="block text-sm font-medium text-slate-700">
                  {t('auth.smsCodeLabel')}
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <input id="resetCode" autoComplete="one-time-code" inputMode="numeric"
                    type="text"
                    value={resetCode}
                    onChange={(e) => updateField(setResetCode, e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="block w-full rounded-lg border border-slate-300 py-2.5 px-3 text-slate-900 placeholder-slate-400 tracking-widest text-center text-lg font-mono focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    placeholder="000000"
                    maxLength={6}
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="resetNewPassword" className="block text-sm font-medium text-slate-700">
                  {t('auth.newPasswordLabel')}
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <PasswordInput id="resetNewPassword" autoComplete="new-password"
                    type="password"
                    value={resetNewPassword}
                    onChange={(e) => updateField(setResetNewPassword, e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 py-2.5 px-3 text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 sm:text-sm"
                    placeholder={t('auth.newPasswordPlaceholder')}
                    required
                    minLength={8}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="resetConfirmPassword" className="block text-sm font-medium text-slate-700">
                  {t('auth.confirmPasswordLabel')}
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <PasswordInput id="resetConfirmPassword" autoComplete="new-password"
                    type="password"
                    value={resetConfirmPassword}
                    onChange={(e) => updateField(setResetConfirmPassword, e.target.value)}
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
                  className="w-full min-h-12 flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-colors disabled:opacity-60"
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
              </fieldset>
            </form>
          ) : (
            <form aria-labelledby="login-form-title" aria-busy={isLoading} onSubmit={handleLogin}>
              <fieldset disabled={isLoading} className="min-w-0 space-y-5 border-0 p-0">
              <div>
                <label htmlFor="login" className="block text-sm font-medium text-slate-700">
                  {t('auth.loginLabel')}
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <input id="login" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                    type="text"
                    value={login}
                    onChange={(e) => updateField(setLogin, e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 py-2.5 px-3 text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 sm:text-sm"
                    placeholder={t('auth.loginPlaceholder')}
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <label htmlFor="password" className="block text-sm font-medium text-slate-700">
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
                  <PasswordInput id="password" autoComplete="current-password"
                    type="password"
                    value={password}
                    onChange={(e) => updateField(setPassword, e.target.value)}
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
                  className="w-full min-h-12 flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-colors disabled:opacity-60"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <ArrowRight className="mr-2 w-4 h-4" />
                  )}
                  <span>{isLoading ? t('auth.loggingIn') : t('auth.loginButton')}</span>
                </button>
              </div>
              </fieldset>
            </form>
          )}

          <div className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-500 space-y-1">
            <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>{t('auth.rbacNote')}</span>
            </div>
            <p>{t('auth.accessNote')}</p>
          </div>
        </div>
        </section>
      </main>
    </div>
  );
}
