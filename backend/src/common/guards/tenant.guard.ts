import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Вспомогательная функция для проверки принадлежности сущности к ЖК пользователя
 */
export function assertUserBelongsToTenant(
  user: { tenantId?: string | null; role?: UserRole },
  targetTenantId: string,
  entityNameOrError: string | { code: string; message: string } = 'ресурса',
) {
  if (user.role === UserRole.SUPERADMIN) return;

  if (!user.tenantId || user.tenantId !== targetTenantId) {
    if (typeof entityNameOrError === 'object') {
      throw new ForbiddenException(entityNameOrError);
    }
    throw new ForbiddenException(
      `Доступ к данным ${entityNameOrError} другого жилого комплекса запрещен (BOLA/IDOR protection)`,
    );
  }
}

export interface TenantAccessErrorCodes {
  authRequired: { code: string; message: string };
  staffForbidden: { code: string; message: string };
  residentForbidden: { code: string; message: string };
}

/**
 * Трехсторонняя проверка доступа к ресурсам жилого комплекса:
 * 1. SUPERADMIN: глобальный доступ (возвращает true).
 * 2. Персонал (HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER, SECURITY): доступ в пределах своего ЖК (возвращает true).
 * 3. Жители (OWNER, TENANT): доступ только при наличии верифицированного помещения в ЖК (возвращает false).
 */
export async function assertAccessToTenant(
  prisma: Pick<PrismaService, 'unitOwnership'> | PrismaService,
  user: any,
  tenantId: string,
  errorCodes: TenantAccessErrorCodes,
): Promise<boolean> {
  if (!user) {
    throw new ForbiddenException(errorCodes.authRequired);
  }

  if (user.role === UserRole.SUPERADMIN) {
    return true;
  }

  const staffRoles = [
    UserRole.HOA_ADMIN,
    UserRole.HOA_CHAIRMAN,
    UserRole.DISPATCHER,
    UserRole.SECURITY,
  ];

  if (staffRoles.includes(user.role)) {
    if (user.tenantId !== tenantId) {
      throw new ForbiddenException(errorCodes.staffForbidden);
    }
    return true;
  }

  const verifiedOwnership = await prisma.unitOwnership.findFirst({
    where: {
      userId: user.id,
      isVerified: true,
      unit: {
        building: {
          tenantId,
        },
      },
    },
  });

  if (!verifiedOwnership) {
    throw new ForbiddenException(errorCodes.residentForbidden);
  }

  return false;
}

