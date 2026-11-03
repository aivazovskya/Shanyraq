'use client';

import { useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function PasswordInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  const { t } = useTranslation();
  return <div className="relative">
    <input {...props} type={visible ? 'text' : 'password'} className={`${className} pr-12`} />
    <button type="button" onClick={() => setVisible(!visible)} aria-pressed={visible}
      aria-label={t(visible ? 'auth.hidePassword' : 'auth.showPassword')}
      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-slate-500 hover:text-sky-700">
      {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
    </button>
  </div>;
}
