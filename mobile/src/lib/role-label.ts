export type UserRoleOrOwnership =
  | 'RESIDENT_OWNER'
  | 'RESIDENT_TENANT'
  | 'RESIDENT'
  | 'HOA_ADMIN'
  | 'HOA_CHAIRMAN'
  | 'DISPATCHER'
  | 'SECURITY'
  | 'SUPERADMIN'
  | 'OWNER'
  | 'TENANT'
  | 'FAMILY_MEMBER'
  | string;

export function roleLabel(
  role: UserRoleOrOwnership | null | undefined,
  t: (key: string, options?: any) => string
): string {
  if (!role) return '';

  const normalized = role.toUpperCase();
  const key = `roles.${normalized}`;
  const translated = t(key);

  if (translated && translated !== key) {
    return translated;
  }

  switch (normalized) {
    case 'RESIDENT_OWNER':
    case 'OWNER':
      return t('profile.ownerRole');
    case 'RESIDENT_TENANT':
    case 'TENANT':
    case 'RESIDENT':
      return t('profile.tenantRole');
    case 'HOA_ADMIN':
      return t('staff.roleHoaAdmin');
    case 'HOA_CHAIRMAN':
      return t('staff.roleHoaChairman');
    case 'DISPATCHER':
      return t('staff.roleDispatcher');
    case 'SECURITY':
      return t('staff.roleSecurity');
    default:
      return role;
  }
}
