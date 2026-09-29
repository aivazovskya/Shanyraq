import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, UnauthorizedException, ServiceUnavailableException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { RedisService } from '../../redis/redis.service';
import { encryptPii } from '../../common/crypto/pii-crypto.helper';

describe('AuthService (Аудит безопасности авторизации и OTP)', () => {
  let service: AuthService;
  let prismaMock: any;
  let jwtServiceMock: any;
  let configServiceMock: any;
  let redisMock: any;
  let redisStore: Map<string, { value: string; expiresAt?: number }>;

  const mockAccessSecret = 'test_access_secret_12345678901234567890';
  const mockRefreshSecret = 'test_refresh_secret_12345678901234567890';

  beforeEach(async () => {
    redisStore = new Map();
    redisMock = {
      get: jest.fn().mockImplementation(async (key: string) => {
        const item = redisStore.get(key);
        if (!item) return null;
        if (item.expiresAt && Date.now() > item.expiresAt) {
          redisStore.delete(key);
          return null;
        }
        return item.value;
      }),
      set: jest.fn().mockImplementation(async (key: string, value: string, ttlSeconds?: number) => {
        const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
        redisStore.set(key, { value, expiresAt });
        return 'OK';
      }),
      del: jest.fn().mockImplementation(async (key: string) => {
        const existed = redisStore.delete(key);
        return existed ? 1 : 0;
      }),
    };

    prismaMock = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    jwtServiceMock = {
      sign: jest.fn().mockImplementation((payload: any, options: any) => {
        return `jwt_${payload.type}_token_${payload.sub}`;
      }),
      verify: jest.fn().mockImplementation((token: string, options: any) => {
        if (token.startsWith('jwt_refresh_token_')) {
          return { sub: 'user-1', type: 'refresh', phone: '+77015550101', role: UserRole.RESIDENT_OWNER };
        }
        if (token.startsWith('jwt_access_token_')) {
          return { sub: 'user-1', type: 'access', phone: '+77015550101', role: UserRole.RESIDENT_OWNER };
        }
        if (token.startsWith('jwt_password_change_token_')) {
          return { sub: 'admin-1', type: 'password_change', phone: '+77017778899', role: UserRole.HOA_ADMIN, tokenVersion: 1 };
        }
        throw new Error('Invalid token');
      }),
    };

    configServiceMock = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'JWT_ACCESS_SECRET') return mockAccessSecret;
        if (key === 'JWT_REFRESH_SECRET') return mockRefreshSecret;
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: RedisService, useValue: redisMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('requestOtp & Rate Limiting', () => {
    it('должен генерировать 6-значный OTP код для любого казахстанского номера', async () => {
      const res = await service.requestOtp({ phone: '+77015550101' });
      expect(res.success).toBe(true);
    });

    it('должен блокировать повторный запрос SMS чаще 1 раза в 60 секунд (Rate Limit)', async () => {
      await service.requestOtp({ phone: '+77015550101' });

      // Повторный запрос немедленно
      await expect(
        service.requestOtp({ phone: '+77015550101' }),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.requestOtp({ phone: '+77015550101' });
        fail('Should throw');
      } catch (err: any) {
        expect(err.getResponse().code).toBe('AUTH.OTP_RATE_LIMITED');
      }
    });
  });

  describe('verifyOtp & Brute Force Protection', () => {
    it('должен блокировать номер на 10 минут после 3 неверных попыток ввода', async () => {
      // Инициализация OTP
      const req = await service.requestOtp({ phone: '+77019998877' });

      // 1-я неверная попытка
      try {
        await service.verifyOtp({ phone: '+77019998877', code: '000000' });
        fail('Should throw');
      } catch (err: any) {
        expect(err.message).toBe('Неверный SMS-код. Осталось попыток: 2');
        expect(err.getResponse().code).toBe('AUTH.OTP_INVALID');
        expect(err.getResponse().params).toEqual({ remaining: 2 });
      }

      // 2-я неверная попытка
      try {
        await service.verifyOtp({ phone: '+77019998877', code: '000001' });
        fail('Should throw');
      } catch (err: any) {
        expect(err.message).toBe('Неверный SMS-код. Осталось попыток: 1');
        expect(err.getResponse().code).toBe('AUTH.OTP_INVALID');
        expect(err.getResponse().params).toEqual({ remaining: 1 });
      }

      // 3-я неверная попытка -> Блокировка
      try {
        await service.verifyOtp({ phone: '+77019998877', code: '000002' });
        fail('Should throw');
      } catch (err: any) {
        expect(err.getResponse().code).toBe('AUTH.OTP_MAX_ATTEMPTS');
      }

      // 4-я попытка даже с любым кодом сразу отклоняется блокировкой
      try {
        await service.verifyOtp({ phone: '+77019998877', code: '000003' });
        fail('Should throw');
      } catch (err: any) {
        expect(err.getResponse().code).toBe('AUTH.PHONE_LOCKED');
      }
    });

    it('должен разделять токены на access и refresh с разными типами', async () => {
      // Устанавливаем окружение test, чтобы получить devCode
      process.env.NODE_ENV = 'test';
      const otpRes = await service.requestOtp({ phone: '+77017776655' });
      const validCode = otpRes.devCode!;

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-77',
        phone: '+77017776655',
        firstName: 'Арман',
        lastName: 'Жумабаев',
        role: UserRole.RESIDENT_OWNER,
        tenantId: 'tenant-1',
        isVerified: true,
        ownerships: [],
      });

      const authResult = await service.verifyOtp({ phone: '+77017776655', code: validCode });

      expect(authResult.accessToken).toBe('jwt_access_token_user-77');
      expect(authResult.refreshToken).toBe('jwt_refresh_token_user-77');
      expect(authResult.expiresIn).toBe(900); // 15 minutes in seconds

      // Проверка генерации двух разных типов токенов с TTL 15 минут для access
      expect(jwtServiceMock.sign).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'access', sub: 'user-77' }),
        expect.objectContaining({ expiresIn: '15m' }),
      );
      expect(jwtServiceMock.sign).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'refresh', sub: 'user-77' }),
        expect.objectContaining({ expiresIn: '30d' }),
      );
    });
  });

  describe('Redis OTP & Lockout Storage', () => {
    it('должен сохранять OTP в Redis с TTL 300 сек и удалять после успешной верификации', async () => {
      process.env.NODE_ENV = 'test';
      const phone = '+77013334455';
      const res = await service.requestOtp({ phone });
      expect(redisMock.set).toHaveBeenCalledWith(
        `otp:${phone}`,
        expect.any(String),
        300,
      );

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-33',
        phone,
        firstName: 'Тест',
        lastName: 'Тестов',
        role: UserRole.RESIDENT_OWNER,
        tenantId: 'tenant-1',
        isVerified: true,
        ownerships: [],
      });

      await service.verifyOtp({ phone, code: res.devCode! });
      expect(redisMock.del).toHaveBeenCalledWith(`otp:${phone}`);
    });

    it('должен блокировать номер в Redis на 600 сек (10 минут) после 3 неверных попыток', async () => {
      const phone = '+77019991122';
      await service.requestOtp({ phone });

      for (let i = 0; i < 2; i++) {
        await expect(service.verifyOtp({ phone, code: '000000' })).rejects.toThrow();
      }

      await expect(service.verifyOtp({ phone, code: '000000' })).rejects.toThrow('Номер заблокирован на 10 минут');
      expect(redisMock.set).toHaveBeenCalledWith(
        `otp:lockout:${phone}`,
        expect.any(String),
        600,
      );
      expect(redisMock.del).toHaveBeenCalledWith(`otp:${phone}`);
    });

    it('должен отклонять запрос (fail closed), если Redis недоступен при проверке lockout в requestOtp', async () => {
      redisMock.get.mockRejectedValueOnce(new Error('Redis connection timed out'));

      await expect(
        service.requestOtp({ phone: '+77018889900' }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('должен отклонять запрос (fail closed), если Redis недоступен при проверке lockout в verifyOtp', async () => {
      redisMock.get.mockRejectedValueOnce(new Error('Redis connection refused'));

      await expect(
        service.verifyOtp({ phone: '+77018889900', code: '123456' }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('должен отклонять запрос (fail closed), если Redis падает при записи счетчика попыток', async () => {
      process.env.NODE_ENV = 'test';
      const phone = '+77016667788';
      await service.requestOtp({ phone });

      // Simulate redis.set failure when recording wrong attempt
      redisMock.set.mockRejectedValueOnce(new Error('Redis write failed'));

      await expect(
        service.verifyOtp({ phone, code: '000000' }),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('refreshToken', () => {
    it('должен отклонять попытку использования access-токена вместо refresh-токена', async () => {
      await expect(
        service.refreshToken({ refreshToken: 'jwt_access_token_user-1' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('должен успешно обновлять пару токенов по валидному refresh-токену', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        phone: '+77015550101',
        isActive: true,
        role: UserRole.RESIDENT_OWNER,
        tenantId: 'tenant-1',
        tokenVersion: 1,
      });

      const res = await service.refreshToken({ refreshToken: 'jwt_refresh_token_user-1' });
      expect(res.accessToken).toBe('jwt_access_token_user-1');
      expect(res.refreshToken).toBe('jwt_refresh_token_user-1');
    });

    it('должен отклонять refresh-токен с устаревшим tokenVersion после логаута', async () => {
      jwtServiceMock.verify.mockReturnValueOnce({
        sub: 'user-1',
        type: 'refresh',
        tokenVersion: 1,
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        isActive: true,
        tokenVersion: 2, // Пользователь выполнил логаут, версия инкрементировалась
      });

      await expect(
        service.refreshToken({ refreshToken: 'jwt_refresh_token_user-1_old' }),
      ).rejects.toThrow('Сессия завершена (токен отозван)');
    });
  });

  describe('logout', () => {
    it('должен инкрементировать tokenVersion пользователя для отзыва сессии', async () => {
      prismaMock.user.update = jest.fn().mockResolvedValue({ id: 'user-1', tokenVersion: 2 });

      const res = await service.logout('user-1');
      expect(res.success).toBe(true);
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { tokenVersion: { increment: 1 } },
      });
    });
  });

  describe('PIN Management (2FA для СКУД)', () => {
    it('должен возвращать isPinSet: false, если PIN не установлен', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-pin-1',
        accessPinHash: null,
      });

      const res = await service.getPinStatus('user-pin-1');
      expect(res.isPinSet).toBe(false);
    });

    it('должен возвращать isPinSet: true, если PIN установлен', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-pin-1',
        accessPinHash: '$2a$10$abcdefghijklmnopqrstuv',
      });

      const res = await service.getPinStatus('user-pin-1');
      expect(res.isPinSet).toBe(true);
    });

    it('должен успешно устанавливать PIN в первый раз без currentPin', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-pin-1',
        accessPinHash: null,
      });
      prismaMock.user.update.mockResolvedValue({ id: 'user-pin-1' });

      const res = await service.setPin('user-pin-1', { newPin: '8392' });
      expect(res.success).toBe(true);
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-pin-1' },
          data: expect.objectContaining({
            accessPinHash: expect.any(String),
            accessPinSetAt: expect.any(Date),
          }),
        }),
      );
    });

    it('должен отклонять слабые PIN-коды (одинаковые цифры, простые последовательности, неверная длина)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-pin-1',
        accessPinHash: null,
      });

      // Неверная длина
      await expect(service.setPin('user-pin-1', { newPin: '123' })).rejects.toThrow('ровно из 4 или 6 цифр');
      await expect(service.setPin('user-pin-1', { newPin: '12345' })).rejects.toThrow('ровно из 4 или 6 цифр');

      // Одинаковые цифры
      await expect(service.setPin('user-pin-1', { newPin: '0000' })).rejects.toThrow('одинаковые цифры');
      await expect(service.setPin('user-pin-1', { newPin: '111111' })).rejects.toThrow('одинаковые цифры');

      // Простые последовательности из блок-листа
      await expect(service.setPin('user-pin-1', { newPin: '1234' })).rejects.toThrow('Слишком простой или предсказуемый');
      await expect(service.setPin('user-pin-1', { newPin: '654321' })).rejects.toThrow('Слишком простой или предсказуемый');
    });

    it('должен требовать currentPin при повторной смене PIN-кода и проверять его', async () => {
      const currentPinHash = await bcrypt.hash('8392', 10);
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-pin-1',
        accessPinHash: currentPinHash,
      });

      // Без currentPin
      await expect(service.setPin('user-pin-1', { newPin: '9482' })).rejects.toThrow('необходимо указать текущий PIN-код');

      // С неверным currentPin
      await expect(service.setPin('user-pin-1', { newPin: '9482', currentPin: '0001' })).rejects.toThrow('Неверный текущий PIN-код');

      // С верным currentPin
      prismaMock.user.update.mockResolvedValue({ id: 'user-pin-1' });
      const res = await service.setPin('user-pin-1', { newPin: '9482', currentPin: '8392' });
      expect(res.success).toBe(true);
      expect(res.message).toBe('PIN-код успешно изменен');
    });

    it('должен отправлять SMS-OTP для сброса PIN-кода (requestPinReset)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-pin-1',
        phone: '+77014445566',
      });

      const res = await service.requestPinReset('user-pin-1');
      expect(res.success).toBe(true);
    });

    it('должен подтверждать сброс PIN-кода по OTP (confirmPinReset)', async () => {
      process.env.NODE_ENV = 'test';
      const phone = '+77014445566';
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-pin-1',
        phone,
      });

      const otpRes = await service.requestOtp({ phone });
      const validOtp = otpRes.devCode!;

      prismaMock.user.update.mockResolvedValue({ id: 'user-pin-1' });

      // Неверный OTP
      await expect(
        service.confirmPinReset('user-pin-1', { otpCode: '000000', newPin: '8392' }),
      ).rejects.toThrow();

      // Верный OTP
      const res = await service.confirmPinReset('user-pin-1', { otpCode: validOtp, newPin: '8392' });
      expect(res.success).toBe(true);
      expect(res.message).toBe('PIN-код успешно сброшен и обновлен');
    });
  });

  describe('loginWithPassword & Brute Force Protection (Subtask B1)', () => {
    const mockHashedPassword = bcrypt.hashSync('CorrectPassword123!', 10);
    const mockUser = {
      id: 'admin-1',
      phone: '+77017778899',
      email: 'admin@shanyraq.kz',
      passwordHash: mockHashedPassword,
      role: UserRole.HOA_ADMIN,
      tenantId: 'tenant-1',
      tokenVersion: 1,
      mustChangePassword: false,
      isActive: true,
    };

    it('должен успешно авторизовать пользователя с верным паролем', async () => {
      prismaMock.user.findFirst.mockResolvedValue(mockUser);

      const res = await service.loginWithPassword({
        login: '+77017778899',
        password: 'CorrectPassword123!',
      });

      expect((res as any).user.id).toBe('admin-1');
      expect((res as any).accessToken).toBeDefined();
    });

    it('должен отклонять неверный пароль ошибкой AUTH.INVALID_CREDENTIALS', async () => {
      prismaMock.user.findFirst.mockResolvedValue(mockUser);

      try {
        await service.loginWithPassword({
          login: '+77017778899',
          password: 'WrongPassword!',
        });
        fail('Should throw');
      } catch (err: any) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        expect(err.getResponse().code).toBe('AUTH.INVALID_CREDENTIALS');
      }
    });

    it('должен блокировать аккаунт (AUTH.LOGIN_LOCKED) на 10 минут после 3 неверных попыток', async () => {
      prismaMock.user.findFirst.mockResolvedValue(mockUser);
      const testLogin = 'attacker_target@shanyraq.kz';

      // 1-я неверная попытка
      try {
        await service.loginWithPassword({ login: testLogin, password: 'bad1' });
        fail('Should throw');
      } catch (err: any) {
        expect(err.getResponse().code).toBe('AUTH.INVALID_CREDENTIALS');
      }

      // 2-я неверная попытка
      try {
        await service.loginWithPassword({ login: testLogin, password: 'bad2' });
        fail('Should throw');
      } catch (err: any) {
        expect(err.getResponse().code).toBe('AUTH.INVALID_CREDENTIALS');
      }

      // 3-я неверная попытка -> Блокировка
      try {
        await service.loginWithPassword({ login: testLogin, password: 'bad3' });
        fail('Should throw');
      } catch (err: any) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect(err.getResponse().code).toBe('AUTH.LOGIN_LOCKED');
      }

      // 4-я попытка сразу отклоняется блокировкой без обращения к bcrypt
      try {
        await service.loginWithPassword({ login: testLogin, password: 'CorrectPassword123!' });
        fail('Should throw');
      } catch (err: any) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect(err.getResponse().code).toBe('AUTH.LOGIN_LOCKED');
      }
    });

    it('должен отклонять несуществующего пользователя (findFirst -> null) ошибкой AUTH.INVALID_CREDENTIALS без вызова bcrypt.compare', async () => {
      prismaMock.user.findFirst.mockResolvedValue(null);
      const compareSpy = jest.spyOn(bcrypt, 'compare');

      try {
        await service.loginWithPassword({
          login: '+77000000000',
          password: 'AnyPassword123!',
        });
        fail('Should throw');
      } catch (err: any) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        expect(err.getResponse().code).toBe('AUTH.INVALID_CREDENTIALS');
        expect(compareSpy).not.toHaveBeenCalled();
      } finally {
        compareSpy.mockRestore();
      }
    });

    it('должен возвращать changePasswordToken при mustChangePassword: true вместо обычных токенов', async () => {
      prismaMock.user.findFirst.mockResolvedValue({
        ...mockUser,
        mustChangePassword: true,
      });

      const res = await service.loginWithPassword({
        login: '+77017778899',
        password: 'CorrectPassword123!',
      });

      expect(res.mustChangePassword).toBe(true);
      expect(res.changePasswordToken).toBeDefined();
      expect((res as any).accessToken).toBeUndefined();
    });

    it('должен отклонять деактивированного пользователя (isActive: false) с кодом AUTH.USER_BLOCKED_OR_NOT_FOUND', async () => {
      prismaMock.user.findFirst.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      try {
        await service.loginWithPassword({
          login: '+77017778899',
          password: 'CorrectPassword123!',
        });
        fail('Should throw');
      } catch (err: any) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        expect(err.getResponse().code).toBe('AUTH.USER_BLOCKED_OR_NOT_FOUND');
      }
    });

    describe('setInitialPassword', () => {
      it('должен успешно менять временный пароль, сбрасывать mustChangePassword, инкрементировать tokenVersion и возвращать сессию', async () => {
        const initialUser = {
          ...mockUser,
          mustChangePassword: true,
          tokenVersion: 1,
        };
        const updatedUser = {
          ...mockUser,
          mustChangePassword: false,
          tokenVersion: 2,
        };

        prismaMock.user.findUnique.mockResolvedValue(initialUser);
        prismaMock.user.update.mockResolvedValue(updatedUser);

        const res = await service.setInitialPassword({
          changePasswordToken: 'jwt_password_change_token_admin-1',
          newPassword: 'BrandNewPassword2026!',
        });

        expect(prismaMock.user.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'admin-1' },
            data: expect.objectContaining({
              mustChangePassword: false,
              tokenVersion: { increment: 1 },
            }),
          }),
        );
        expect(res.user.id).toBe('admin-1');
        expect(res.accessToken).toBeDefined();
        expect(res.refreshToken).toBeDefined();
      });

      it('должен отклонять невалидный токен смены пароля', async () => {
        try {
          await service.setInitialPassword({
            changePasswordToken: 'invalid_token_xyz',
            newPassword: 'BrandNewPassword2026!',
          });
          fail('Should throw');
        } catch (err: any) {
          expect(err).toBeInstanceOf(UnauthorizedException);
          expect(err.getResponse().code).toBe('AUTH.CHANGE_PASSWORD_TOKEN_INVALID');
        }
      });

      it('должен отклонять токен неверного типа (например, access-токен)', async () => {
        try {
          await service.setInitialPassword({
            changePasswordToken: 'jwt_access_token_admin-1',
            newPassword: 'BrandNewPassword2026!',
          });
          fail('Should throw');
        } catch (err: any) {
          expect(err).toBeInstanceOf(UnauthorizedException);
          expect(err.getResponse().code).toBe('AUTH.INVALID_TOKEN_TYPE');
        }
      });

      it('должен отклонять токен с устаревшим tokenVersion (AUTH.SESSION_REVOKED)', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          ...mockUser,
          tokenVersion: 2,
        });

        try {
          await service.setInitialPassword({
            changePasswordToken: 'jwt_password_change_token_admin-1',
            newPassword: 'BrandNewPassword2026!',
          });
          fail('Should throw');
        } catch (err: any) {
          expect(err).toBeInstanceOf(UnauthorizedException);
          expect(err.getResponse().code).toBe('AUTH.SESSION_REVOKED');
        }
      });
    });
  });

  describe('Staff password reset: forgotStaffPassword & resetStaffPassword (Task 0082)', () => {
    const mockStaffUser = {
      id: 'staff-42',
      phone: '+77015554433',
      email: 'dispatcher@shanyraq.kz',
      role: UserRole.DISPATCHER,
      tenantId: 'tenant-1',
      isActive: true,
      mustChangePassword: false,
      tokenVersion: 3,
      passwordHash: 'old_hashed_pwd',
    };

    describe('forgotStaffPassword', () => {
      it('должен отклонять запрос, если пользователь не найден, и НЕ вызывать requestOtp', async () => {
        prismaMock.user.findUnique.mockResolvedValue(null);
        const requestOtpSpy = jest.spyOn(service, 'requestOtp');

        await expect(service.forgotStaffPassword('+77010000000')).rejects.toThrow(
          NotFoundException,
        );
        expect(requestOtpSpy).not.toHaveBeenCalled();
      });

      it('должен отклонять запрос, если пользователь не активен (isActive: false), и НЕ вызывать requestOtp', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          ...mockStaffUser,
          isActive: false,
        } as any);
        const requestOtpSpy = jest.spyOn(service, 'requestOtp');

        await expect(service.forgotStaffPassword('+77015554433')).rejects.toThrow(
          NotFoundException,
        );
        expect(requestOtpSpy).not.toHaveBeenCalled();
      });

      it('должен отклонять запрос для жильца (RESIDENT_OWNER), и НЕ вызывать requestOtp', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          ...mockStaffUser,
          role: UserRole.RESIDENT_OWNER,
        } as any);
        const requestOtpSpy = jest.spyOn(service, 'requestOtp');

        await expect(service.forgotStaffPassword('+77015554433')).rejects.toThrow(
          NotFoundException,
        );
        expect(requestOtpSpy).not.toHaveBeenCalled();
      });

      it('должен отклонять запрос для SUPERADMIN (только роли персонала ЖК), и НЕ вызывать requestOtp', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          ...mockStaffUser,
          role: UserRole.SUPERADMIN,
        } as any);
        const requestOtpSpy = jest.spyOn(service, 'requestOtp');

        await expect(service.forgotStaffPassword('+77015554433')).rejects.toThrow(
          NotFoundException,
        );
        expect(requestOtpSpy).not.toHaveBeenCalled();
      });

      it('должен успешно вызывать requestOtp для активного сотрудника (DISPATCHER)', async () => {
        prismaMock.user.findUnique.mockResolvedValue(mockStaffUser as any);
        const requestOtpSpy = jest.spyOn(service, 'requestOtp').mockResolvedValue({
          success: true,
          message: 'SMS-код отправлен',
          devCode: '123456',
        } as any);

        const result = await service.forgotStaffPassword('+77015554433');
        expect(requestOtpSpy).toHaveBeenCalledWith({ phone: '+77015554433' });
        expect(result.success).toBe(true);
        requestOtpSpy.mockRestore();
      });
    });

    describe('resetStaffPassword', () => {
      const validPhone = '+77015554433';
      const validCode = '123456';
      const now = Date.now();

      it('должен отклонять сброс при неверном или истекшем коде из Redis', async () => {
        // Нет записи в Redis
        redisMock.get.mockResolvedValue(null);

        await expect(
          service.resetStaffPassword(validPhone, validCode, 'NewSecurePassword123!'),
        ).rejects.toThrow(BadRequestException);
      });

      it('должен отклонять пароль короче 8 символов', async () => {
        const otpRecord = JSON.stringify({
          code: validCode,
          expiresAt: now + 300000,
          lastRequestedAt: now,
          attempts: 0,
        });
        redisMock.get.mockImplementation(async (key: string) => {
          if (key.startsWith('otp:lockout:')) return null;
          if (key.startsWith('otp:')) return otpRecord;
          return null;
        });
        prismaMock.user.findUnique.mockResolvedValue(mockStaffUser as any);

        await expect(
          service.resetStaffPassword(validPhone, validCode, 'short'),
        ).rejects.toThrow(BadRequestException);
      });

      it('должен успешно сбрасывать пароль: обновлять passwordHash, сбрасывать mustChangePassword, инкрементировать tokenVersion и НЕ возвращать токены', async () => {
        const otpRecord = JSON.stringify({
          code: validCode,
          expiresAt: now + 300000,
          lastRequestedAt: now,
          attempts: 0,
        });
        redisMock.get.mockImplementation(async (key: string) => {
          if (key.startsWith('otp:lockout:')) return null;
          if (key.startsWith('otp:')) return otpRecord;
          return null;
        });

        prismaMock.user.findUnique.mockResolvedValue(mockStaffUser as any);
        prismaMock.user.update.mockResolvedValue({
          ...mockStaffUser,
          tokenVersion: 4,
          mustChangePassword: false,
        } as any);

        const result = await service.resetStaffPassword(
          validPhone,
          validCode,
          'BrandNewStrongPassword2026!',
        );

        // Проверяем, что ответ успешен и НЕ содержит токенов
        expect(result.success).toBe(true);
        expect((result as any).accessToken).toBeUndefined();
        expect((result as any).refreshToken).toBeUndefined();

        // Проверяем вызов prisma.user.update
        expect(prismaMock.user.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: mockStaffUser.id },
            data: expect.objectContaining({
              mustChangePassword: false,
              tokenVersion: { increment: 1 },
            }),
          }),
        );
      });
    });
  });

  describe('getMe (Task 0086: безопасный профиль пользователя)', () => {
    it('должен использовать select-белый список и НЕ запрашивать / НЕ возвращать passwordHash, accessPinHash, tokenVersion', async () => {
      const mockRawUserInDb = {
        id: 'user-safe-1',
        phone: '+77019998877',
        email: 'safe@example.com',
        passwordHash: '$2a$10$insecureHashLeakShouldNeverReturn',
        accessPinHash: '$2a$10$pinHashLeakShouldNeverReturn',
        tokenVersion: 5,
        firstName: 'Алихан',
        lastName: 'Бокейхан',
        iin: '900101300123',
        role: UserRole.RESIDENT_OWNER,
        tenantId: 'tenant-1',
        isActive: true,
        isVerified: true,
        accessPinSetAt: new Date('2026-01-01'),
        mustChangePassword: false,
        hidePhoneInListings: true,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
        tenant: {
          id: 'tenant-1',
          name: 'ЖК Байтерек',
          address: 'ул. Достык 10',
          city: 'Астана',
        },
        ownerships: [
          {
            id: 'own-1',
            unitId: 'unit-1',
            ownershipType: 'OWNER',
            sharePercent: 100,
            isVerified: true,
            unit: {
              id: 'unit-1',
              unitNumber: '42',
              floor: 5,
              entrance: 1,
              type: 'APARTMENT',
              area: 75,
              building: {
                id: 'b-1',
                blockName: 'Блок А',
              },
            },
          },
        ],
      };

      prismaMock.user.findUnique.mockImplementation(async (args: any) => {
        if (!args?.select) {
          return mockRawUserInDb;
        }
        const projected: any = {};
        for (const [key, val] of Object.entries(args.select)) {
          if (val && key in mockRawUserInDb) {
            projected[key] = (mockRawUserInDb as any)[key];
          }
        }
        return projected;
      });

      const result = await service.getMe('user-safe-1');

      // 1. Проверяем аргументы prisma.user.findUnique
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-safe-1' },
        select: expect.objectContaining({
          id: true,
          phone: true,
          firstName: true,
          lastName: true,
          role: true,
          tenantId: true,
          tenant: true,
          isVerified: true,
          ownerships: expect.any(Object),
          hidePhoneInListings: true,
        }),
      });

      const callArgs = prismaMock.user.findUnique.mock.calls[0][0];
      expect(callArgs.select).not.toHaveProperty('passwordHash');
      expect(callArgs.select).not.toHaveProperty('accessPinHash');
      expect(callArgs.select).not.toHaveProperty('tokenVersion');

      // 2. Проверяем, что секреты физически отсутствуют в возвращённом объекте
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('accessPinHash');
      expect(result).not.toHaveProperty('tokenVersion');

      // 3. Проверяем, что все поля, необходимые клиентам (mobile/web), присутствуют
      expect(result.id).toBe('user-safe-1');
      expect(result.phone).toBe('+77019998877');
      expect(result.firstName).toBe('Алихан');
      expect(result.lastName).toBe('Бокейхан');
      expect(result.role).toBe(UserRole.RESIDENT_OWNER);
      expect(result.tenantId).toBe('tenant-1');
      expect(result.isVerified).toBe(true);
      expect(result.hidePhoneInListings).toBe(true);
      expect(result.tenant).toBeDefined();
      expect(result.tenant.name).toBe('ЖК Байтерек');
      expect(result.ownerships).toHaveLength(1);
      expect(result.ownerships[0].unit.building.blockName).toBe('Блок А');
      // Проверяем маскирование открытого ИИН
      expect(result.iin).toBe('******0123');
    });

    it('маскирует зашифрованный ИИН (v1:...) в ответе getMe', async () => {
      const encryptedIin = encryptPii('950202400567');
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-enc-1',
        phone: '+77015556677',
        firstName: 'Ербол',
        lastName: 'Омаров',
        iin: encryptedIin,
        role: UserRole.RESIDENT_OWNER,
        ownerships: [],
      });

      const result = await service.getMe('user-enc-1');
      expect(result.iin).toBe('******0567');
    });

    it('возвращает null для iin, если он не указан у пользователя', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-no-iin',
        phone: '+77015556678',
        firstName: 'Айдар',
        lastName: 'Смагулов',
        iin: null,
        role: UserRole.RESIDENT_OWNER,
        ownerships: [],
      });

      const result = await service.getMe('user-no-iin');
      expect(result.iin).toBeNull();
    });

    it('должен выбрасывать UnauthorizedException AUTH.USER_NOT_FOUND, если пользователь не найден', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.getMe('non-existent-user')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});

