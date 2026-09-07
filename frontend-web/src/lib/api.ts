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

export function getStoredSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
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
 * Гарантирует наличие валидной сессии. Если пользователь не залогинен,
 * для бесшовной работы панели и тестов выполняет авто-вход под учетной записью УК.
 */
export async function ensureAuthSession(): Promise<AuthSession> {
  const existing = getStoredSession();
  if (existing && existing.token && existing.user && existing.user.tenantId) {
    return existing;
  }

  // Авторизация по умолчанию под учетной записью управляющей компании
  const res = await fetch(`${API_BASE_URL}/auth/login-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      login: '+77001000001',
      password: 'Shanyraq2026!',
    }),
  });

  if (!res.ok) {
    throw new Error('Не удалось выполнить авторизацию в API');
  }

  const data = await res.json();
  const session: AuthSession = {
    token: data.accessToken,
    user: data.user,
  };
  saveSession(session);
  return session;
}

/**
 * Универсальный fetch-враппер с поддержкой Bearer токена и обработкой ошибок
 */
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const session = await ensureAuthSession();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (session?.token) {
    headers['Authorization'] = `Bearer ${session.token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

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
