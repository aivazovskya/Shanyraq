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

// Subtask C5: Хранение сессии в оперативной памяти (in-memory) для защиты от XSS-эксфильтрации токена
let inMemorySession: AuthSession | null = null;

export class NoSessionError extends Error {
  constructor(message = 'Сессия пользователя отсутствует или истекла') {
    super(message);
    this.name = 'NoSessionError';
  }
}

export function getStoredSession(): AuthSession | null {
  return inMemorySession;
}

export function saveSession(session: AuthSession): void {
  inMemorySession = session;
}

export function clearSession(): void {
  inMemorySession = null;
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

  return response.json();
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

