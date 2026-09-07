import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Пользователь не аутентифицирован');
    }

    // SUPERADMIN has cross-tenant access to all complexes
    if (user.role === UserRole.SUPERADMIN) {
      return true;
    }

    // Extract tenantId from params, query, or body
    const targetTenantId =
      request.params?.tenantId ||
      request.query?.tenantId ||
      request.body?.tenantId;

    if (targetTenantId && user.tenantId && targetTenantId !== user.tenantId) {
      throw new ForbiddenException(
        'Межарендаторный доступ запрещен: вы можете совершать операции только в пределах своего жилого комплекса',
      );
    }

    return true;
  }
}

/**
 * Вспомогательная функция для проверки принадлежности сущности к ЖК пользователя
 */
export function assertUserBelongsToTenant(
  user: { tenantId?: string | null; role: UserRole },
  targetTenantId: string,
  entityName = 'ресурса',
) {
  if (user.role === UserRole.SUPERADMIN) return;

  if (!user.tenantId || user.tenantId !== targetTenantId) {
    throw new ForbiddenException(
      `Доступ к данным ${entityName} другого жилого комплекса запрещен (BOLA/IDOR protection)`,
    );
  }
}
