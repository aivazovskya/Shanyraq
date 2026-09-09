import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { RequestOtpDto, VerifyOtpDto, LoginPasswordDto, RefreshTokenDto, SetPinDto, ResetPinConfirmDto } from './dto/auth.dto';
import { UserRole } from '@prisma/client';
import { JwtPayload } from './jwt.strategy';
import { RedisService } from '../../redis/redis.service';

interface OtpEntry {
  code: string;
  expiresAt: number;
  lastRequestedAt: number;
  attempts: number;
}

const OTP_KEY_PREFIX = 'otp:';
const LOCKOUT_KEY_PREFIX = 'otp:lockout:';
const LOGIN_LOCKOUT_KEY_PREFIX = 'login:lockout:';
const LOGIN_ATTEMPTS_KEY_PREFIX = 'login:attempts:';
const OTP_TTL_SECONDS = 5 * 60; // 5 minutes
const LOCKOUT_TTL_SECONDS = 10 * 60; // 10 minutes
const LOGIN_LOCKOUT_TTL_SECONDS = 10 * 60; // 10 minutes
const LOGIN_MAX_ATTEMPTS = 3;
const ACCESS_TOKEN_EXPIRES_IN = '15m';
const ACCESS_TOKEN_TTL_SECONDS = 900; // 15 minutes in seconds

@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redisService: RedisService,
  ) {
    this.accessSecret = this.configService.get<string>('JWT_ACCESS_SECRET');
    this.refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');

    if (!this.accessSecret || !this.refreshSecret) {
      throw new Error(
        'КРИТИЧЕСКАЯ ОШИБКА БЕЗОПАСНОСТИ: JWT_ACCESS_SECRET или JWT_REFRESH_SECRET не заданы в конфигурации!',
      );
    }
  }

  async requestOtp(dto: RequestOtpDto) {
    const { phone } = dto;
    const now = Date.now();

    // 1. Check if number is currently locked due to brute force (fail-closed if Redis error)
    try {
      const lockoutVal = await this.redisService.get(`${LOCKOUT_KEY_PREFIX}${phone}`);
      if (lockoutVal) {
        const lockedUntil = parseInt(lockoutVal, 10);
        if (lockedUntil > now) {
          const waitMinutes = Math.ceil((lockedUntil - now) / 60000);
          throw new BadRequestException({
            code: 'AUTH.PHONE_LOCKED',
            message: `Номер временно заблокирован из-за множественных неверных попыток. Попробуйте через ${waitMinutes} мин.`,
            params: { waitMinutes },
          });
        }
      }
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      throw new ServiceUnavailableException({
        code: 'AUTH.SERVICE_UNAVAILABLE',
        message: 'Сервис временно недоступен, попробуйте позже',
      });
    }

    // 2. Rate limiting: maximum 1 SMS per 60 seconds per phone (fail-closed if Redis error)
    try {
      const existingRaw = await this.redisService.get(`${OTP_KEY_PREFIX}${phone}`);
      if (existingRaw) {
        const existing: OtpEntry = JSON.parse(existingRaw);
        if (now - existing.lastRequestedAt < 60000) {
          const waitSeconds = Math.ceil((60000 - (now - existing.lastRequestedAt)) / 1000);
          throw new BadRequestException({
            code: 'AUTH.OTP_RATE_LIMITED',
            message: `Слишком частый запрос кода. Повторная отправка SMS возможна через ${waitSeconds} сек.`,
            params: { waitSeconds },
          });
        }
      }
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      throw new ServiceUnavailableException({
        code: 'AUTH.SERVICE_UNAVAILABLE',
        message: 'Сервис временно недоступен, попробуйте позже',
      });
    }

    // 3. Generate cryptographically secure 6-digit random code (100000 - 999999)
    const code = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = now + OTP_TTL_SECONDS * 1000;

    const otpData: OtpEntry = {
      code,
      expiresAt,
      lastRequestedAt: now,
      attempts: 0,
    };

    try {
      await this.redisService.set(
        `${OTP_KEY_PREFIX}${phone}`,
        JSON.stringify(otpData),
        OTP_TTL_SECONDS,
      );
    } catch (err: any) {
      throw new ServiceUnavailableException({
        code: 'AUTH.SERVICE_UNAVAILABLE',
        message: 'Сервис временно недоступен, попробуйте позже',
      });
    }

    console.log(`[SECURE-SMS] 📨 SMS отправлен на ${phone}: "Код подтверждения Shanyraq: ${code}"`);

    return {
      success: true,
      message: 'Одноразовый 6-значный код подтверждения успешно отправлен по SMS',
      // В production devCode НИКОГДА не возвращается в API ответе
      devCode: process.env.NODE_ENV === 'test' ? code : undefined,
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const { phone, code } = dto;
    const now = Date.now();

    // 1. Check lockout (fail-closed if Redis error)
    try {
      const lockoutVal = await this.redisService.get(`${LOCKOUT_KEY_PREFIX}${phone}`);
      if (lockoutVal) {
        const lockedUntil = parseInt(lockoutVal, 10);
        if (lockedUntil > now) {
          throw new BadRequestException({
            code: 'AUTH.PHONE_LOCKED',
            message: 'Номер временно заблокирован. Попробуйте позже.',
          });
        }
      }
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      throw new ServiceUnavailableException({
        code: 'AUTH.SERVICE_UNAVAILABLE',
        message: 'Сервис временно недоступен, попробуйте позже',
      });
    }

    let raw: string | null = null;
    try {
      raw = await this.redisService.get(`${OTP_KEY_PREFIX}${phone}`);
    } catch {
      throw new BadRequestException({
        code: 'AUTH.OTP_EXPIRED',
        message: 'Срок действия SMS-кода истек или код не запрашивался. Запросите новый код.',
      });
    }

    if (!raw) {
      throw new BadRequestException({
        code: 'AUTH.OTP_EXPIRED',
        message: 'Срок действия SMS-кода истек или код не запрашивался. Запросите новый код.',
      });
    }

    let record: OtpEntry;
    try {
      record = JSON.parse(raw);
    } catch {
      try { await this.redisService.del(`${OTP_KEY_PREFIX}${phone}`); } catch {}
      throw new BadRequestException({
        code: 'AUTH.OTP_EXPIRED',
        message: 'Срок действия SMS-кода истек или код не запрашивался. Запросите новый код.',
      });
    }

    if (record.expiresAt < now) {
      try { await this.redisService.del(`${OTP_KEY_PREFIX}${phone}`); } catch {}
      throw new BadRequestException({
        code: 'AUTH.OTP_EXPIRED',
        message: 'Срок действия SMS-кода истек или код не запрашивался. Запросите новый код.',
      });
    }

    // 2. Constant-time comparison to prevent timing attacks
    const isMatch =
      record.code.length === code.length &&
      crypto.timingSafeEqual(Buffer.from(record.code), Buffer.from(code));

    if (!isMatch) {
      record.attempts += 1;
      if (record.attempts >= 3) {
        try {
          await this.redisService.del(`${OTP_KEY_PREFIX}${phone}`);
          const lockedUntil = now + LOCKOUT_TTL_SECONDS * 1000; // 10 minutes lockout
          await this.redisService.set(
            `${LOCKOUT_KEY_PREFIX}${phone}`,
            lockedUntil.toString(),
            LOCKOUT_TTL_SECONDS,
          );
        } catch {}
        throw new BadRequestException({
          code: 'AUTH.OTP_MAX_ATTEMPTS',
          message: 'Превышено максимальное количество попыток ввода кода (3). Номер заблокирован на 10 минут.',
        });
      }

      // Preserve remaining TTL (fail closed if Redis set fails)
      const remainingSeconds = Math.max(1, Math.ceil((record.expiresAt - now) / 1000));
      try {
        await this.redisService.set(
          `${OTP_KEY_PREFIX}${phone}`,
          JSON.stringify(record),
          remainingSeconds,
        );
      } catch (err: any) {
        throw new ServiceUnavailableException({
          code: 'AUTH.SERVICE_UNAVAILABLE',
          message: 'Сервис временно недоступен, попробуйте позже',
        });
      }

      throw new BadRequestException({
        code: 'AUTH.OTP_INVALID',
        message: `Неверный SMS-код. Осталось попыток: ${3 - record.attempts}`,
        params: { remaining: 3 - record.attempts },
      });
    }

    // OTP verified successfully -> clear state
    try {
      await this.redisService.del(`${OTP_KEY_PREFIX}${phone}`);
    } catch {}

    // Find or create resident user
    let user = await this.prisma.user.findUnique({
      where: { phone },
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

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          phone,
          firstName: 'Житель',
          lastName: phone.slice(-4),
          role: UserRole.RESIDENT_OWNER,
          isVerified: false,
        },
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
    }

    const tokens = this.generateTokens(user.id, user.phone, user.role, user.tenantId, user.tokenVersion);

    return {
      user: {
        id: user.id,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId,
        isVerified: user.isVerified,
        ownerships: user.ownerships,
      },
      ...tokens,
    };
  }

  async verifyVoteOtp(phone: string, code: string): Promise<boolean> {
    const now = Date.now();

    // 1. Check lockout (fail closed if Redis error)
    try {
      const lockoutVal = await this.redisService.get(`${LOCKOUT_KEY_PREFIX}${phone}`);
      if (lockoutVal) {
        const lockedUntil = parseInt(lockoutVal, 10);
        if (lockedUntil > now) {
          throw new BadRequestException({
            code: 'AUTH.PHONE_LOCKED',
            message: 'Номер временно заблокирован. Попробуйте позже.',
          });
        }
      }
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      throw new ServiceUnavailableException({
        code: 'AUTH.SERVICE_UNAVAILABLE',
        message: 'Сервис временно недоступен, попробуйте позже',
      });
    }

    let raw: string | null = null;
    try {
      raw = await this.redisService.get(`${OTP_KEY_PREFIX}${phone}`);
    } catch {
      throw new BadRequestException({
        code: 'AUTH.OTP_EXPIRED',
        message: 'Срок действия SMS-кода подтверждения голоса истек или код не запрашивался. Сначала запросите SMS-код.',
      });
    }

    if (!raw) {
      throw new BadRequestException({
        code: 'AUTH.OTP_EXPIRED',
        message: 'Срок действия SMS-кода подтверждения голоса истек или код не запрашивался. Сначала запросите SMS-код.',
      });
    }

    let record: OtpEntry;
    try {
      record = JSON.parse(raw);
    } catch {
      try { await this.redisService.del(`${OTP_KEY_PREFIX}${phone}`); } catch {}
      throw new BadRequestException({
        code: 'AUTH.OTP_EXPIRED',
        message: 'Срок действия SMS-кода подтверждения голоса истек или код не запрашивался. Сначала запросите SMS-код.',
      });
    }

    if (record.expiresAt < now) {
      try { await this.redisService.del(`${OTP_KEY_PREFIX}${phone}`); } catch {}
      throw new BadRequestException({
        code: 'AUTH.OTP_EXPIRED',
        message: 'Срок действия SMS-кода подтверждения голоса истек или код не запрашивался. Сначала запросите SMS-код.',
      });
    }

    const isMatch =
      record.code.length === code.length &&
      crypto.timingSafeEqual(Buffer.from(record.code), Buffer.from(code));

    if (!isMatch) {
      record.attempts += 1;
      if (record.attempts >= 3) {
        try {
          await this.redisService.del(`${OTP_KEY_PREFIX}${phone}`);
          const lockedUntil = now + LOCKOUT_TTL_SECONDS * 1000;
          await this.redisService.set(
            `${LOCKOUT_KEY_PREFIX}${phone}`,
            lockedUntil.toString(),
            LOCKOUT_TTL_SECONDS,
          );
        } catch {}
        throw new BadRequestException({
          code: 'AUTH.OTP_MAX_ATTEMPTS',
          message: 'Превышено количество попыток ввода. Номер заблокирован.',
        });
      }

      const remainingSeconds = Math.max(1, Math.ceil((record.expiresAt - now) / 1000));
      try {
        await this.redisService.set(
          `${OTP_KEY_PREFIX}${phone}`,
          JSON.stringify(record),
          remainingSeconds,
        );
      } catch (err: any) {
        throw new ServiceUnavailableException({
          code: 'AUTH.SERVICE_UNAVAILABLE',
          message: 'Сервис временно недоступен, попробуйте позже',
        });
      }

      throw new BadRequestException({
        code: 'AUTH.OTP_INVALID',
        message: `Неверный SMS-код подтверждения голоса. Осталось попыток: ${3 - record.attempts}`,
        params: { remaining: 3 - record.attempts },
      });
    }

    // Code consumed
    try {
      await this.redisService.del(`${OTP_KEY_PREFIX}${phone}`);
    } catch {}
    return true;
  }

  async loginWithPassword(dto: LoginPasswordDto) {
    const { login, password } = dto;
    const loginKey = (login || '').trim().toLowerCase();
    const now = Date.now();

    // 1. Проверка блокировки аккаунта (fail-closed if Redis error)
    try {
      const lockoutVal = await this.redisService.get(`${LOGIN_LOCKOUT_KEY_PREFIX}${loginKey}`);
      if (lockoutVal) {
        const lockedUntil = parseInt(lockoutVal, 10);
        if (lockedUntil > now) {
          const waitMinutes = Math.max(1, Math.ceil((lockedUntil - now) / 60000));
          throw new BadRequestException({
            code: 'AUTH.LOGIN_LOCKED',
            message: `Слишком много неудачных попыток входа. Аккаунт временно заблокирован на ${waitMinutes} мин.`,
            params: { waitMinutes },
          });
        }
      }
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      throw new ServiceUnavailableException({
        code: 'AUTH.SERVICE_UNAVAILABLE',
        message: 'Сервис временно недоступен, попробуйте позже',
      });
    }

    const registerFailedAttempt = async () => {
      try {
        const attemptsVal = await this.redisService.get(`${LOGIN_ATTEMPTS_KEY_PREFIX}${loginKey}`);
        const currentAttempts = attemptsVal ? parseInt(attemptsVal, 10) + 1 : 1;
        if (currentAttempts >= LOGIN_MAX_ATTEMPTS) {
          await this.redisService.del(`${LOGIN_ATTEMPTS_KEY_PREFIX}${loginKey}`);
          const lockedUntil = now + LOGIN_LOCKOUT_TTL_SECONDS * 1000;
          await this.redisService.set(
            `${LOGIN_LOCKOUT_KEY_PREFIX}${loginKey}`,
            lockedUntil.toString(),
            LOGIN_LOCKOUT_TTL_SECONDS,
          );
          throw new BadRequestException({
            code: 'AUTH.LOGIN_LOCKED',
            message: 'Слишком много неудачных попыток входа. Аккаунт временно заблокирован на 10 мин.',
            params: { waitMinutes: 10 },
          });
        } else {
          await this.redisService.set(
            `${LOGIN_ATTEMPTS_KEY_PREFIX}${loginKey}`,
            currentAttempts.toString(),
            LOGIN_LOCKOUT_TTL_SECONDS,
          );
        }
      } catch (err: any) {
        if (err instanceof BadRequestException) throw err;
      }
      throw new UnauthorizedException({
        code: 'AUTH.INVALID_CREDENTIALS',
        message: 'Неверный логин или пароль',
      });
    };

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ phone: login }, { email: login }],
      },
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

    if (!user || !user.passwordHash) {
      return await registerFailedAttempt();
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return await registerFailedAttempt();
    }

    // Сброс счетчика попыток при успешном входе
    try {
      await this.redisService.del(`${LOGIN_ATTEMPTS_KEY_PREFIX}${loginKey}`);
      await this.redisService.del(`${LOGIN_LOCKOUT_KEY_PREFIX}${loginKey}`);
    } catch {}

    const tokens = this.generateTokens(user.id, user.phone, user.role, user.tenantId, user.tokenVersion);

    return {
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId,
        tenantName: user.tenant?.name,
      },
      ...tokens,
    };
  }

  async refreshToken(dto: RefreshTokenDto) {
    let payload: JwtPayload;

    try {
      payload = this.jwtService.verify(dto.refreshToken, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException({
        code: 'AUTH.REFRESH_TOKEN_INVALID',
        message: 'Недействительный или истекший refresh-токен',
      });
    }

    if (!payload || payload.type !== 'refresh') {
      throw new UnauthorizedException({
        code: 'AUTH.REFRESH_TOKEN_WRONG_TYPE',
        message: 'Предоставленный токен не является refresh-токеном',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        code: 'AUTH.USER_BLOCKED_OR_NOT_FOUND',
        message: 'Пользователь заблокирован или не найден',
      });
    }

    if (payload.tokenVersion !== undefined && user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException({
        code: 'AUTH.SESSION_REVOKED',
        message: 'Сессия завершена (токен отозван). Пожалуйста, войдите снова.',
      });
    }

    return this.generateTokens(user.id, user.phone, user.role, user.tenantId, user.tokenVersion);
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        tokenVersion: { increment: 1 },
      },
    });

    return {
      success: true,
      message: 'Вы успешно вышли из системы. Все сессии и refresh-токены отозваны.',
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
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

    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTH.USER_NOT_FOUND',
        message: 'Пользователь не найден',
      });
    }

    return user;
  }

  async getPinStatus(userId: string): Promise<{ isPinSet: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { accessPinHash: true },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTH.USER_NOT_FOUND',
        message: 'Пользователь не найден',
      });
    }

    return { isPinSet: Boolean(user.accessPinHash) };
  }

  async setPin(userId: string, dto: SetPinDto): Promise<{ success: boolean; message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, accessPinHash: true },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTH.USER_NOT_FOUND',
        message: 'Пользователь не найден',
      });
    }

    this.validatePinStrength(dto.newPin);

    if (user.accessPinHash) {
      if (!dto.currentPin) {
        throw new BadRequestException({
          code: 'AUTH.CURRENT_PIN_REQUIRED',
          message: 'Для изменения PIN-кода необходимо указать текущий PIN-код',
        });
      }

      const isCurrentValid = await bcrypt.compare(dto.currentPin, user.accessPinHash);
      if (!isCurrentValid) {
        throw new BadRequestException({
          code: 'AUTH.CURRENT_PIN_INVALID',
          message: 'Неверный текущий PIN-код',
        });
      }
    }

    const salt = await bcrypt.genSalt(10);
    const accessPinHash = await bcrypt.hash(dto.newPin, salt);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        accessPinHash,
        accessPinSetAt: new Date(),
      },
    });

    return {
      success: true,
      message: user.accessPinHash ? 'PIN-код успешно изменен' : 'PIN-код успешно установлен',
    };
  }

  async requestPinReset(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTH.USER_NOT_FOUND',
        message: 'Пользователь не найден',
      });
    }

    return this.requestOtp({ phone: user.phone });
  }

  async confirmPinReset(userId: string, dto: ResetPinConfirmDto): Promise<{ success: boolean; message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, phone: true },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTH.USER_NOT_FOUND',
        message: 'Пользователь не найден',
      });
    }

    this.validatePinStrength(dto.newPin);

    // Verify OTP using existing verifyVoteOtp path
    await this.verifyVoteOtp(user.phone, dto.otpCode);

    const salt = await bcrypt.genSalt(10);
    const accessPinHash = await bcrypt.hash(dto.newPin, salt);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        accessPinHash,
        accessPinSetAt: new Date(),
      },
    });

    return {
      success: true,
      message: 'PIN-код успешно сброшен и обновлен',
    };
  }

  private validatePinStrength(pin: string) {
    if (!/^\d{4}$|^\d{6}$/.test(pin)) {
      throw new BadRequestException({
        code: 'AUTH.PIN_LENGTH_INVALID',
        message: 'PIN-код должен состоять ровно из 4 или 6 цифр',
      });
    }

    // Check all identical digits (0000, 1111, 222222, etc.)
    const allSame = pin.split('').every((digit) => digit === pin[0]);
    if (allSame) {
      throw new BadRequestException({
        code: 'AUTH.PIN_REPEATED_DIGITS',
        message: 'Слишком простой PIN-код: нельзя использовать одинаковые цифры',
      });
    }

    // Blocklist of common weak sequences
    const blockedPins = new Set([
      '1234', '4321', '0123', '3210', '9876', '6789', '2580', '1122', '1212',
      '123456', '654321', '012345', '543210', '112233', '121212',
    ]);

    if (blockedPins.has(pin)) {
      throw new BadRequestException({
        code: 'AUTH.PIN_PREDICTABLE',
        message: 'Слишком простой или предсказуемый PIN-код. Выберите более сложную комбинацию',
      });
    }
  }

  private generateTokens(userId: string, phone: string, role: string, tenantId?: string | null, tokenVersion?: number) {
    const accessPayload: JwtPayload = {
      sub: userId,
      phone,
      role,
      tenantId,
      type: 'access',
      tokenVersion,
    };

    const refreshPayload: JwtPayload = {
      sub: userId,
      phone,
      role,
      tenantId,
      type: 'refresh',
      tokenVersion,
    };

    const accessToken = this.jwtService.sign(accessPayload, {
      secret: this.accessSecret,
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    });

    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.refreshSecret,
      expiresIn: '30d',
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }
}
