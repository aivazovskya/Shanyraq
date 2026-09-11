import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { Roles } from '../decorators/roles.decorator';

class NoRolesController {
  noRolesHandler() {}

  @Roles()
  emptyRolesHandler() {}

  @Roles(UserRole.HOA_ADMIN)
  hoaAdminOnlyHandler() {}
}

@Roles(UserRole.HOA_ADMIN, UserRole.HOA_CHAIRMAN)
class ClassWithRolesController {
  inheritedRolesHandler() {}

  @Roles(UserRole.SUPERADMIN)
  superadminOverrideHandler() {}
}

function createMockExecutionContext(
  handler: (...args: any[]) => any,
  classRef: new (...args: any[]) => any,
  user?: { role?: UserRole; [key: string]: any },
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => classRef,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
      getResponse: jest.fn(),
      getNext: jest.fn(),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('should return true when no @Roles is defined on handler or class', () => {
    const context = createMockExecutionContext(
      NoRolesController.prototype.noRolesHandler,
      NoRolesController,
      { role: UserRole.RESIDENT_OWNER },
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should return true when @Roles() is empty', () => {
    const context = createMockExecutionContext(
      NoRolesController.prototype.emptyRolesHandler,
      NoRolesController,
      { role: UserRole.RESIDENT_OWNER },
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException if user is not authenticated on role-gated endpoint', () => {
    const context = createMockExecutionContext(
      NoRolesController.prototype.hoaAdminOnlyHandler,
      NoRolesController,
      undefined,
    );

    expect(() => guard.canActivate(context)).toThrow(
      new ForbiddenException('Пользователь не аутентифицирован'),
    );
  });

  it('should grant access to SUPERADMIN via universal bypass even if role is not in required list', () => {
    const context = createMockExecutionContext(
      NoRolesController.prototype.hoaAdminOnlyHandler,
      NoRolesController,
      { role: UserRole.SUPERADMIN },
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should grant access when user has a required role', () => {
    const context = createMockExecutionContext(
      NoRolesController.prototype.hoaAdminOnlyHandler,
      NoRolesController,
      { role: UserRole.HOA_ADMIN },
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException when user does not have a required role', () => {
    const context = createMockExecutionContext(
      NoRolesController.prototype.hoaAdminOnlyHandler,
      NoRolesController,
      { role: UserRole.RESIDENT_OWNER },
    );

    expect(() => guard.canActivate(context)).toThrow(
      new ForbiddenException('Недостаточно прав для выполнения действия'),
    );
  });

  describe('method-level overrides class-level decorator', () => {
    it('should allow HOA_ADMIN on handler inheriting class-level roles', () => {
      const context = createMockExecutionContext(
        ClassWithRolesController.prototype.inheritedRolesHandler,
        ClassWithRolesController,
        { role: UserRole.HOA_ADMIN },
      );

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should reject HOA_ADMIN on handler where method-level @Roles(SUPERADMIN) overrides class-level @Roles', () => {
      const context = createMockExecutionContext(
        ClassWithRolesController.prototype.superadminOverrideHandler,
        ClassWithRolesController,
        { role: UserRole.HOA_ADMIN },
      );

      expect(() => guard.canActivate(context)).toThrow(
        new ForbiddenException('Недостаточно прав для выполнения действия'),
      );
    });

    it('should allow SUPERADMIN on overridden handler', () => {
      const context = createMockExecutionContext(
        ClassWithRolesController.prototype.superadminOverrideHandler,
        ClassWithRolesController,
        { role: UserRole.SUPERADMIN },
      );

      expect(guard.canActivate(context)).toBe(true);
    });
  });
});
