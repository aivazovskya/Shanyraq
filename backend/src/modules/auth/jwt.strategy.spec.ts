import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy, JwtPayload } from './jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';

describe('JwtStrategy (Passport JWT Стратегия авторизации)', () => {
  let strategy: JwtStrategy;
  let prismaMock: any;
  let configServiceMock: any;

  const validSecret = 'test_access_secret_12345678901234567890';

  const mockActiveUser = {
    id: 'user-uuid-1',
    phone: '+77011234567',
    role: 'RESIDENT_OWNER',
    isActive: true,
    tokenVersion: 1,
    tenantId: 'tenant-uuid-1',
    tenant: { id: 'tenant-uuid-1', name: 'ЖК Шаңырақ' },
    ownerships: [
      {
        id: 'ownership-1',
        unit: {
          id: 'unit-1',
          unitNumber: '42',
          building: { id: 'b-1', blockName: 'Блок А' },
        },
      },
    ],
  };

  beforeEach(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
      },
    };

    configServiceMock = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_ACCESS_SECRET') return validSecret;
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: configServiceMock },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor (Fail-fast защита при отсутствии секрета)', () => {
    it('выбрасывает критическую ошибку при отсутствии переменной окружения JWT_ACCESS_SECRET', () => {
      const emptyConfigService = {
        get: jest.fn().mockReturnValue(undefined),
      };

      expect(
        () => new JwtStrategy(emptyConfigService as any, prismaMock as any),
      ).toThrow(
        'КРИТИЧЕСКАЯ ОШИБКА БЕЗОПАСНОСТИ: JWT_ACCESS_SECRET не задан в переменных окружения!',
      );
    });

    it('выбрасывает ошибку, если JWT_ACCESS_SECRET передан как пустая строка', () => {
      const emptyConfigService = {
        get: jest.fn().mockReturnValue(''),
      };

      expect(
        () => new JwtStrategy(emptyConfigService as any, prismaMock as any),
      ).toThrow(
        'КРИТИЧЕСКАЯ ОШИБКА БЕЗОПАСНОСТИ: JWT_ACCESS_SECRET не задан в переменных окружения!',
      );
    });

    it('успешно инициализируется, когда валидный секрет предоставлен', () => {
      expect(strategy).toBeDefined();
      expect(configServiceMock.get).toHaveBeenCalledWith('JWT_ACCESS_SECRET');
    });
  });

  describe('validate() — Защита от подмены типа токена (Token-type confusion)', () => {
    it('отклоняет null или undefined payload с ошибкой AUTH.INVALID_TOKEN_TYPE до обращения к БД', async () => {
      await expect(strategy.validate(undefined as any)).rejects.toThrow(UnauthorizedException);

      try {
        await strategy.validate(undefined as any);
      } catch (err: any) {
        expect(err.getResponse()).toEqual(
          expect.objectContaining({
            code: 'AUTH.INVALID_TOKEN_TYPE',
          }),
        );
      }

      // Assert prisma was NOT called (short-circuit before DB)
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });

    it('отклоняет refresh-токен (type: refresh) с кодом AUTH.INVALID_TOKEN_TYPE до обращения к БД', async () => {
      const refreshPayload: JwtPayload = {
        sub: 'user-uuid-1',
        phone: '+77011234567',
        role: 'RESIDENT_OWNER',
        type: 'refresh',
      };

      await expect(strategy.validate(refreshPayload)).rejects.toThrow(UnauthorizedException);

      try {
        await strategy.validate(refreshPayload);
      } catch (err: any) {
        expect(err.getResponse()).toEqual(
          expect.objectContaining({
            code: 'AUTH.INVALID_TOKEN_TYPE',
            message: expect.stringContaining('Refresh-токен не может использоваться'),
          }),
        );
      }

      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });

    it('отклоняет password_change токен с кодом AUTH.INVALID_TOKEN_TYPE до обращения к БД', async () => {
      const pwdChangePayload: JwtPayload = {
        sub: 'user-uuid-1',
        phone: '+77011234567',
        role: 'RESIDENT_OWNER',
        type: 'password_change',
      };

      await expect(strategy.validate(pwdChangePayload)).rejects.toThrow(UnauthorizedException);

      try {
        await strategy.validate(pwdChangePayload);
      } catch (err: any) {
        expect(err.getResponse()).toEqual(
          expect.objectContaining({
            code: 'AUTH.INVALID_TOKEN_TYPE',
          }),
        );
      }

      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });

    it('пропускает токен с type: access к последующей проверке пользователя в БД', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockActiveUser);

      const accessPayload: JwtPayload = {
        sub: 'user-uuid-1',
        phone: '+77011234567',
        role: 'RESIDENT_OWNER',
        type: 'access',
        tokenVersion: 1,
      };

      const result = await strategy.validate(accessPayload);
      expect(result).toBeDefined();
      expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  describe('validate() — Проверка блокировки и существования пользователя', () => {
    it('отклоняет запрос с кодом AUTH.USER_BLOCKED_OR_NOT_FOUND, если пользователь не найден в БД', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const payload: JwtPayload = {
        sub: 'user-deleted',
        phone: '+77011234567',
        role: 'RESIDENT_OWNER',
        type: 'access',
      };

      await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);

      try {
        await strategy.validate(payload);
      } catch (err: any) {
        expect(err.getResponse()).toEqual(
          expect.objectContaining({
            code: 'AUTH.USER_BLOCKED_OR_NOT_FOUND',
            message: 'Пользователь заблокирован или не найден',
          }),
        );
      }
    });

    it('отклоняет запрос с кодом AUTH.USER_BLOCKED_OR_NOT_FOUND, если пользователь деактивирован (isActive: false)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...mockActiveUser,
        isActive: false,
      });

      const payload: JwtPayload = {
        sub: 'user-uuid-1',
        phone: '+77011234567',
        role: 'RESIDENT_OWNER',
        type: 'access',
      };

      await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);

      try {
        await strategy.validate(payload);
      } catch (err: any) {
        expect(err.getResponse()).toEqual(
          expect.objectContaining({
            code: 'AUTH.USER_BLOCKED_OR_NOT_FOUND',
          }),
        );
      }
    });
  });

  describe('validate() — Отзыв сессии через tokenVersion (Session Revocation)', () => {
    it('отклоняет запрос с кодом AUTH.SESSION_REVOKED при несовпадении tokenVersion в токене и БД', async () => {
      // Пользователь сменил пароль или сбросил PIN — в БД tokenVersion инкрементирован до 2
      prismaMock.user.findUnique.mockResolvedValue({
        ...mockActiveUser,
        tokenVersion: 2,
      });

      // Старый токен с tokenVersion: 1
      const stalePayload: JwtPayload = {
        sub: 'user-uuid-1',
        phone: '+77011234567',
        role: 'RESIDENT_OWNER',
        type: 'access',
        tokenVersion: 1,
      };

      await expect(strategy.validate(stalePayload)).rejects.toThrow(UnauthorizedException);

      try {
        await strategy.validate(stalePayload);
      } catch (err: any) {
        expect(err.getResponse()).toEqual(
          expect.objectContaining({
            code: 'AUTH.SESSION_REVOKED',
            message: 'Сессия завершена (токен отозван). Пожалуйста, войдите снова.',
          }),
        );
      }
    });

    it('успешно валидирует токен, если tokenVersion совпадает со значением в БД', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...mockActiveUser,
        tokenVersion: 3,
      });

      const currentPayload: JwtPayload = {
        sub: 'user-uuid-1',
        phone: '+77011234567',
        role: 'RESIDENT_OWNER',
        type: 'access',
        tokenVersion: 3,
      };

      const result = await strategy.validate(currentPayload);
      expect(result).toEqual(
        expect.objectContaining({
          id: 'user-uuid-1',
          tokenVersion: 3,
        }),
      );
    });

    it('успешно валидирует токен без поля tokenVersion (undefined) независимо от версии пользователя в БД', async () => {
      // Защита обратной совместимости: если в payload отсутствует tokenVersion, проверка не отзывает токен
      prismaMock.user.findUnique.mockResolvedValue({
        ...mockActiveUser,
        tokenVersion: 5,
      });

      const legacyPayload: JwtPayload = {
        sub: 'user-uuid-1',
        phone: '+77011234567',
        role: 'RESIDENT_OWNER',
        type: 'access',
      };

      const result = await strategy.validate(legacyPayload);
      expect(result).toEqual(
        expect.objectContaining({
          id: 'user-uuid-1',
          tokenVersion: 5,
        }),
      );
    });
  });

  describe('validate() — Успешный сценарий (Happy path)', () => {
    it('загружает пользователя со всеми связанными сущностями и возвращает полный объект пользователя', async () => {
      prismaMock.user.findUnique.mockResolvedValue(mockActiveUser);

      const payload: JwtPayload = {
        sub: 'user-uuid-1',
        phone: '+77011234567',
        role: 'RESIDENT_OWNER',
        tenantId: 'tenant-uuid-1',
        type: 'access',
        tokenVersion: 1,
      };

      const result = await strategy.validate(payload);

      // Проверка точного формата include в запросе findUnique
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
        include: {
          tenant: true,
          ownerships: {
            include: {
              unit: {
                include: {
                  building: true,
                },
              },
            },
          },
        },
      });

      expect(result).toEqual(mockActiveUser);
      expect(result.isActive).toBe(true);
      expect(result.tenant.name).toBe('ЖК Шаңырақ');
      expect(result.ownerships[0].unit.unitNumber).toBe('42');
    });
  });
});