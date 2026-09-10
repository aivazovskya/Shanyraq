import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  assertAccessToTenant,
  assertUserBelongsToTenant,
  TenantAccessErrorCodes,
} from './tenant.guard';

describe('assertAccessToTenant', () => {
  const mockErrorCodes: TenantAccessErrorCodes = {
    authRequired: {
      code: 'TEST.AUTH_REQUIRED',
      message: 'Требуется авторизация',
    },
    staffForbidden: {
      code: 'TEST.STAFF_CROSS_TENANT_FORBIDDEN',
      message: 'Персонал имеет доступ только к ресурсам своего жилого комплекса',
    },
    residentForbidden: {
      code: 'TEST.RESIDENT_ACCESS_FORBIDDEN',
      message: 'У вас нет подтвержденного доступа к ресурсам данного жилого комплекса',
    },
  };

  const prismaMock = {
    unitOwnership: {
      findFirst: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('должен выбрасывать authRequired ошибку при отсутствии пользователя (null/undefined)', async () => {
    await expect(
      assertAccessToTenant(prismaMock as any, null, 'tenant-1', mockErrorCodes),
    ).rejects.toMatchObject({
      response: mockErrorCodes.authRequired,
    });

    await expect(
      assertAccessToTenant(prismaMock as any, undefined, 'tenant-1', mockErrorCodes),
    ).rejects.toMatchObject({
      response: mockErrorCodes.authRequired,
    });
    expect(prismaMock.unitOwnership.findFirst).not.toHaveBeenCalled();
  });

  it('должен пропускать SUPERADMIN ко всем ЖК и возвращать true без обращения к БД', async () => {
    const superadmin = { id: 'admin-1', role: UserRole.SUPERADMIN, tenantId: null };

    const result = await assertAccessToTenant(
      prismaMock as any,
      superadmin,
      'tenant-arbitrary',
      mockErrorCodes,
    );

    expect(result).toBe(true);
    expect(prismaMock.unitOwnership.findFirst).not.toHaveBeenCalled();
  });

  it('должен разрешать доступ сотруднику (HOA_ADMIN, HOA_CHAIRMAN, DISPATCHER, SECURITY) своего ЖК и возвращать true', async () => {
    const staffRoles = [
      UserRole.HOA_ADMIN,
      UserRole.HOA_CHAIRMAN,
      UserRole.DISPATCHER,
      UserRole.SECURITY,
    ];

    for (const role of staffRoles) {
      const staffUser = { id: `user-${role}`, role, tenantId: 'tenant-1' };
      const result = await assertAccessToTenant(
        prismaMock as any,
        staffUser,
        'tenant-1',
        mockErrorCodes,
      );
      expect(result).toBe(true);
    }
    expect(prismaMock.unitOwnership.findFirst).not.toHaveBeenCalled();
  });

  it('должен блокировать сотрудника чужого ЖК с кодом staffForbidden', async () => {
    const staffUser = {
      id: 'staff-other',
      role: UserRole.DISPATCHER,
      tenantId: 'tenant-other',
    };

    await expect(
      assertAccessToTenant(prismaMock as any, staffUser, 'tenant-1', mockErrorCodes),
    ).rejects.toMatchObject({
      response: mockErrorCodes.staffForbidden,
    });
    expect(prismaMock.unitOwnership.findFirst).not.toHaveBeenCalled();
  });

  it('должен разрешать доступ жителю с верифицированным помещением в данном ЖК и возвращать false', async () => {
    const residentUser = {
      id: 'resident-1',
      role: UserRole.RESIDENT_OWNER,
      tenantId: 'tenant-1',
    };

    prismaMock.unitOwnership.findFirst.mockResolvedValue({
      id: 'own-1',
      userId: 'resident-1',
      isVerified: true,
    });

    const result = await assertAccessToTenant(
      prismaMock as any,
      residentUser,
      'tenant-1',
      mockErrorCodes,
    );

    expect(result).toBe(false);
    expect(prismaMock.unitOwnership.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'resident-1',
        isVerified: true,
        unit: {
          building: {
            tenantId: 'tenant-1',
          },
        },
      },
    });
  });

  it('должен блокировать жителя без верифицированного помещения в ЖК с кодом residentForbidden', async () => {
    const residentUser = {
      id: 'resident-unverified',
      role: UserRole.RESIDENT_TENANT,
      tenantId: 'tenant-1',
    };

    prismaMock.unitOwnership.findFirst.mockResolvedValue(null);

    await expect(
      assertAccessToTenant(prismaMock as any, residentUser, 'tenant-1', mockErrorCodes),
    ).rejects.toMatchObject({
      response: mockErrorCodes.residentForbidden,
    });
  });
});

describe('assertUserBelongsToTenant', () => {
  it('должен пропускать SUPERADMIN без ошибок', () => {
    const user = { id: 'admin-1', role: UserRole.SUPERADMIN, tenantId: null };
    expect(() => assertUserBelongsToTenant(user, 'tenant-1')).not.toThrow();
  });

  it('должен пропускать пользователя совпадающего ЖК', () => {
    const user = { id: 'user-1', role: UserRole.DISPATCHER, tenantId: 'tenant-1' };
    expect(() => assertUserBelongsToTenant(user, 'tenant-1')).not.toThrow();
  });

  it('должен выбрасывать ForbiddenException со строковым сообщением по умолчанию', () => {
    const user = { id: 'user-1', role: UserRole.DISPATCHER, tenantId: 'tenant-2' };
    expect(() => assertUserBelongsToTenant(user, 'tenant-1', 'аналитики')).toThrow(
      new ForbiddenException(
        'Доступ к данным аналитики другого жилого комплекса запрещен (BOLA/IDOR protection)',
      ),
    );
  });

  it('должен выбрасывать ForbiddenException со структурированным объектом { code, message }', () => {
    const user = { id: 'user-1', role: UserRole.DISPATCHER, tenantId: 'tenant-2' };
    const customError = {
      code: 'CUSTOM.CROSS_TENANT',
      message: 'Кастомная ошибка меж-ЖК доступа',
    };

    expect(() =>
      assertUserBelongsToTenant(user, 'tenant-1', customError),
    ).toThrow(ForbiddenException);

    try {
      assertUserBelongsToTenant(user, 'tenant-1', customError);
      fail('Should throw');
    } catch (err: any) {
      expect(err.getResponse()).toEqual(customError);
    }
  });
});
