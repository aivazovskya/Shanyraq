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
  user: AuthUser;
}

const STORAGE_KEY = 'shanyraq_auth';

export class NoSessionError extends Error {
  constructor(message = 'Сессия пользователя отсутствует или истекла') {
    super(message);
    this.name = 'NoSessionError';
  }
}

export function getStoredSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveSession(session: AuthSession): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
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

/**
 * Универсальный fetch-враппер с поддержкой Bearer токена и обработкой ошибок.
 * При отсутствии активной сессии или ответе 401 очищает сессию и перенаправляет на страницу входа.
 */
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {},
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

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearSession();
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
    throw new NoSessionError('Срок действия сессии истек. Выполните повторный вход.');
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
      // Игнорируем ошибку парсинга тела
    }
    const err = new Error(errorDetail);
    (err as any).status = response.status;
    throw err;
  }

  return response.json();
}
