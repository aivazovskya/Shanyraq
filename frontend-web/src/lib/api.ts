export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export interface AuthUser {
  id: string;
  phone: string;
  email?: string | null;
  firstName: string;
  lastName: string;
  role: string;
  tenantId: string | null;
  tenantName?: string | null;
}

export interface AuthSession {
  token: string;
  refreshToken?: string;
  user: AuthUser;
  remember?: boolean;
}

export const SESSION_STORAGE_KEY = 'shanyraq_web_session';

// Хранение сессии в оперативной памяти (in-memory) для быстрого синхронного доступа
let inMemorySession: AuthSession | null = null;

export class NoSessionError extends Error {
  constructor(message = 'Сессия пользователя отсутствует или истекла') {
    super(message);
    this.name = 'NoSessionError';
  }
}

/**
 * Синхронное чтение сохраненной сессии:
 * Если память пуста (например, после обновления страницы F5), восстанавливает из хранилища.
 */
export function getStoredSession(): AuthSession | null {
  if (inMemorySession) {
    return inMemorySession;
  }
  if (typeof window !== 'undefined') {
    try {
      const raw =
        window.localStorage.getItem(SESSION_STORAGE_KEY) ||
        window.sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.token && parsed.user) {
          inMemorySession = parsed;
          return inMemorySession;
        }
      }
    } catch (e) {
      console.warn('Failed to parse stored session:', e);
    }
  }
  return null;
}

/**
 * Сохранение сессии:
 * Если «запомнить» включено (remember: true), сохраняет в localStorage,
 * иначе сохраняет в sessionStorage (на время текущей вкладки).
 */
export function saveSession(
  session: AuthSession,
  refreshToken?: string,
  remember?: boolean,
): void {
  const token = session.token;
  const user = session.user;
  const finalRefreshToken = refreshToken !== undefined ? refreshToken : session.refreshToken;
  const finalRemember = remember !== undefined ? remember : session.remember;

  const fullSession: AuthSession = {
    token,
    refreshToken: finalRefreshToken,
    user,
    remember: finalRemember,
  };

  inMemorySession = fullSession;

  if (typeof window !== 'undefined') {
    try {
      const serialized = JSON.stringify(fullSession);
      if (finalRemember) {
        window.localStorage.setItem(SESSION_STORAGE_KEY, serialized);
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      } else {
        window.sessionStorage.setItem(SESSION_STORAGE_KEY, serialized);
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch (e) {
      console.warn('Failed to save session to storage:', e);
    }
  }
}

/**
 * Очистка сессии из памяти и обоих типов хранилищ (localStorage и sessionStorage).
 */
export function clearSession(): void {
  inMemorySession = null;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to clear session from storage:', e);
    }
  }
}

/**
 * Завершение сессии с вызовом эндпоинта /auth/logout (если сессия активна).
 */
export async function apiLogout(): Promise<void> {
  const session = getStoredSession();
  if (session?.token) {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
      });
    } catch {
      // Игнорируем сетевые ошибки при выходе
    }
  }
  clearSession();
}

/**
 * Получает текущую сессию пользователя из хранилища.
 * Если сессия отсутствует, выбрасывает NoSessionError.
 */
export function getAuthSession(): AuthSession {
  const session = getStoredSession();
  if (!session || !session.token || !session.user) {
    throw new NoSessionError();
  }
  return session;
}

// Защита от параллельных повторных refresh-запросов одним общим промисом
let refreshPromise: Promise<string | null> | null = null;

async function refreshAuthTokens(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const currentSession = getStoredSession();
    const refreshToken = currentSession?.refreshToken;
    if (!refreshToken) {
      return null;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        if ([400, 401, 403].includes(response.status)) {
          clearSession();
          return null;
        }
        // Ошибка 5xx или другая ошибка сервера: не сбрасываем токены
        throw new Error(`Refresh failed with status ${response.status}`);
      }

      const data = await response.json();
      if (!data.accessToken) {
        return null;
      }

      saveSession({
        token: data.accessToken,
        refreshToken: data.refreshToken || refreshToken,
        user: currentSession.user,
        remember: currentSession.remember,
      });

      return data.accessToken;
    } catch (err: any) {
      if (!getStoredSession()) {
        return null;
      }
      throw err;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Универсальный fetch-враппер с поддержкой Bearer токена, тихим refresh при 401 и обработкой ошибок.
 * При отсутствии активной сессии или отказе рефреша перенаправляет на страницу входа.
 */
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {},
  parseResponse?: (response: Response) => Promise<T>,
): Promise<T> {
  const session = getStoredSession();

  if (!session || !session.token) {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
    throw new NoSessionError('Требуется авторизация в системе');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
    Authorization: `Bearer ${session.token}`,
  };

  if (typeof FormData !== 'undefined' && options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });
  } catch (netErr) {
    // Сетевые ошибки не разлогинивают
    throw netErr;
  }

  if (response.status === 401 && !endpoint.includes('/auth/refresh')) {
    let newToken: string | null = null;
    try {
      newToken = await refreshAuthTokens();
    } catch (refreshErr) {
      // Сетевая ошибка или 5xx при рефреше — не разлогиниваем, просто пробрасываем ошибку
      throw refreshErr;
    }

    if (!newToken) {
      clearSession();
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
      throw new NoSessionError('Срок действия сессии истек. Выполните повторный вход.');
    }

    // Повторяем запрос один раз с новым токеном
    const retryHeaders: Record<string, string> = {
      ...headers,
      Authorization: `Bearer ${newToken}`,
    };

    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: retryHeaders,
    });

    if (response.status === 401) {
      clearSession();
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
      throw new NoSessionError('Срок действия сессии истек. Выполните повторный вход.');
    }
  }

  if (!response.ok) {
    let errorDetail = `Ошибка ${response.status}: ${response.statusText}`;
    let code: string | undefined;
    let params: Record<string, any> | undefined;
    try {
      const errData = await response.json();
      if (errData.message) {
        errorDetail = Array.isArray(errData.message)
          ? errData.message.join(', ')
          : errData.message;
      }
      code = errData.code;
      params = errData.params;
    } catch {
      // Игнорируем ошибку парсинга тела
    }
    const err = new Error(errorDetail);
    (err as any).status = response.status;
    (err as any).code = code;
    (err as any).params = params;
    throw err;
  }

  return parseResponse ? parseResponse(response) : response.json();
}

export function apiBlob(endpoint: string, signal?: AbortSignal): Promise<Blob> {
  return apiRequest<Blob>(endpoint, { signal }, (response) => response.blob());
}

/**
 * Разрешает локализованный текст ошибки по коду (errors.<code\>), если он распознан,
 * иначе возвращает исходное сообщение об ошибке.
 */
export function getApiErrorMessage(
  err: any,
  t?: (key: string, options?: any) => string,
): string {
  const code = err?.code;
  const params = err?.params;
  if (code && t) {
    const key = `errors.${code}`;
    const translated = t(key, params);
    if (translated && translated !== key) {
      return translated;
    }
  }
  return err?.message || 'Произошла непредвиденная ошибка при обращении к серверу';
}

/**
 * Авторизованный fetch-метод для скачивания бинарных файлов (CSV, PDF) через Blob URL с тихим refresh.
 */
export async function apiDownload(
  endpoint: string,
  fallbackFilename = 'report.csv',
): Promise<void> {
  const session = getStoredSession();

  if (!session || !session.token) {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
    throw new NoSessionError('Требуется авторизация в системе');
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });
  } catch (netErr) {
    throw netErr;
  }

  if (response.status === 401 && !endpoint.includes('/auth/refresh')) {
    let newToken: string | null = null;
    try {
      newToken = await refreshAuthTokens();
    } catch (refreshErr) {
      throw refreshErr;
    }

    if (!newToken) {
      clearSession();
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
      throw new NoSessionError('Срок действия сессии истек. Выполните повторный вход.');
    }

    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${newToken}`,
      },
    });

    if (response.status === 401) {
      clearSession();
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
      throw new NoSessionError('Срок действия сессии истек. Выполните повторный вход.');
    }
  }

  if (!response.ok) {
    let errorDetail = `Ошибка ${response.status}: ${response.statusText}`;
    try {
      const errData = await response.json();
      if (errData.message) {
        errorDetail = Array.isArray(errData.message)
          ? errData.message.join(', ')
          : errData.message;
      }
    } catch {
      // Игнорируем ошибку парсинга
    }
    throw new Error(errorDetail);
  }

  let filename = fallbackFilename;
  const disposition = response.headers.get('content-disposition');
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename="?([^";]+)"?/);
    if (match?.[1]) {
      filename = decodeURIComponent(match[1]);
    }
  }

  const blob = await response.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}
