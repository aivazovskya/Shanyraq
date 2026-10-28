import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastOptions {
  type?: ToastType;
  title: string;
  message?: string;
  duration?: number;
  code?: string;
  onPress?: () => void;
}

export interface ToastItem extends ToastOptions {
  id: string;
}

interface ToastContextValue {
  toast: ToastItem | null;
  showToast: (options: ToastOptions) => void;
  hideToast: () => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hideToast = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast(null);
  }, []);

  const showToast = useCallback((options: ToastOptions) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const id = Date.now().toString();
    const item: ToastItem = {
      ...options,
      type: options.type || 'info',
      duration: options.duration || 6000,
      id,
    };

    setToast(item);

    if (item.duration && item.duration > 0) {
      timerRef.current = setTimeout(() => {
        setToast((current) => (current?.id === id ? null : current));
      }, item.duration);
    }
  }, []);

  return (
    <ToastContext.Provider value={{ toast, showToast, hideToast }}>
      {children}
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      toast: null,
      showToast: () => {},
      hideToast: () => {},
    };
  }
  return ctx;
}
