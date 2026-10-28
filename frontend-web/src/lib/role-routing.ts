export const RESIDENT_ROLES = ['RESIDENT_OWNER', 'RESIDENT_TENANT'] as const;

export const STAFF_ROLES = [
  'SUPERADMIN',
  'HOA_ADMIN',
  'HOA_CHAIRMAN',
  'DISPATCHER',
  'SECURITY',
] as const;

export type ResidentRole = (typeof RESIDENT_ROLES)[number];
export type StaffRole = (typeof STAFF_ROLES)[number];

/**
 * Проверяет, является ли роль ролью жителя (собственник или арендатор).
 */
export function isResidentRole(role?: string | null): boolean {
  if (!role) return false;
  return RESIDENT_ROLES.includes(role as ResidentRole);
}

/**
 * Проверяет, является ли роль ролью персонала/администрации ЖК.
 */
export function isStaffRole(role?: string | null): boolean {
  if (!role) return false;
  return !isResidentRole(role);
}

/**
 * Возвращает домашний маршрут по умолчанию в зависимости от роли пользователя.
 * Жители (RESIDENT_OWNER, RESIDENT_TENANT) -> /cabinet
 * Сотрудники (SUPERADMIN, HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER, SECURITY...) -> /dashboard
 */
export function getHomeRouteForRole(role?: string | null): string {
  if (isResidentRole(role)) {
    return '/cabinet';
  }
  return '/dashboard';
}
