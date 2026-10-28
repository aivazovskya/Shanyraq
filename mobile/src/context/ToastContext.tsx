import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastOptions {
  type?: ToastType;
  title: string;
  message?: string;
  duration?: number;
  code?: string;
  isDevCode?: boolean;
  onPress?: () => void;
}

export interface ToastItem extends ToastOptions {
  id: string;
}

export interface ToastContextValue {
  toast: ToastItem | null;
  toasts: ToastItem[];
  showToast: (options: ToastOptions) => void;
  hideToast: (id?: string) => void;
  hideDevCodeToast: () => void;
  clearToasts: () => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<{ [id: string]: ReturnType<typeof setTimeout> }>({});

  const removeToastById = useCallback((id: string) => {
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const hideToast = useCallback(
    (id?: string) => {
      if (id) {
        removeToastById(id);
      } else {
        setToasts((current) => {
          if (current.length === 0) return current;
          const first = current[0];
          if (timersRef.current[first.id]) {
            clearTimeout(timersRef.current[first.id]);
            delete timersRef.current[first.id];
          }
          return current.slice(1);
        });
      }
    },
    [removeToastById]
  );

  const hideDevCodeToast = useCallback(() => {
    setToasts((current) => {
      const remaining: ToastItem[] = [];
      for (const item of current) {
        if (item.code || item.isDevCode) {
          if (timersRef.current[item.id]) {
            clearTimeout(timersRef.current[item.id]);
            delete timersRef.current[item.id];
          }
        } else {
          remaining.push(item);
        }
      }
      return remaining;
    });
  }, []);

  const clearToasts = useCallback(() => {
    Object.values(timersRef.current).forEach((t) => clearTimeout(t));
    timersRef.current = {};
    setToasts([]);
  }, []);

  const showToast = useCallback(
    (options: ToastOptions) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const isDev = Boolean(options.code || options.isDevCode);

      // Default duration: 6000ms for errors, 8000ms for devCode, 4500ms for others
      let duration = options.duration;
      if (!duration) {
        if (options.type === 'error') {
          duration = 6000;
        } else if (isDev) {
          duration = 8000;
        } else {
          duration = 4500;
        }
      }

      const item: ToastItem = {
        ...options,
        type: options.type || 'info',
        duration,
        isDevCode: isDev,
        id,
      };

      // Keep max 3 toasts to prevent crowding
      setToasts((current) => {
        const next = [...current.slice(-2), item];
        return next;
      });

      if (duration > 0) {
        timersRef.current[id] = setTimeout(() => {
          removeToastById(id);
        }, duration);
      }
    },
    [removeToastById]
  );

  return (
    <ToastContext.Provider
      value={{
        toast: toasts[0] || null,
        toasts,
        showToast,
        hideToast,
        hideDevCodeToast,
        clearToasts,
      }}
    >
      {children}
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      toast: null,
      toasts: [],
      showToast: () => {},
      hideToast: () => {},
      hideDevCodeToast: () => {},
      clearToasts: () => {},
    };
  }
  return ctx;
}
