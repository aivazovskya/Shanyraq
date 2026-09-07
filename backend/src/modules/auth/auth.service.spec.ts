import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

describe('AuthService (Аудит безопасности авторизации и OTP)', () => {
  let service: AuthService;
  let prismaMock: any;
  let jwtServiceMock: any;
  let configServiceMock: any;

  const mockAccessSecret = 'test_access_secret_12345678901234567890';
  const mockRefreshSecret = 'test_refresh_secret_12345678901234567890';

  beforeEach(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
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
    });
  });

  describe('verifyOtp & Brute Force Protection', () => {
    it('должен блокировать номер на 10 минут после 3 неверных попыток ввода', async () => {
      // Инициализация OTP
      const req = await service.requestOtp({ phone: '+77019998877' });

      // 1-я неверная попытка
      await expect(
        service.verifyOtp({ phone: '+77019998877', code: '000000' }),
      ).rejects.toThrow('Осталось попыток: 2');

      // 2-я неверная попытка
      await expect(
        service.verifyOtp({ phone: '+77019998877', code: '000001' }),
      ).rejects.toThrow('Осталось попыток: 1');

      // 3-я неверная попытка -> Блокировка
      await expect(
        service.verifyOtp({ phone: '+77019998877', code: '000002' }),
      ).rejects.toThrow('Превышено максимальное количество попыток ввода кода (3). Номер заблокирован на 10 минут.');

      // 4-я попытка даже с любым кодом сразу отклоняется блокировкой
      await expect(
        service.verifyOtp({ phone: '+77019998877', code: '000003' }),
      ).rejects.toThrow('Номер временно заблокирован');
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

      // Проверка генерации двух разных типов токенов
      expect(jwtServiceMock.sign).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'access', sub: 'user-77' }),
        expect.anything(),
      );
      expect(jwtServiceMock.sign).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'refresh', sub: 'user-77' }),
        expect.anything(),
      );
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
});
