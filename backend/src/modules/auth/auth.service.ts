import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { RequestOtpDto, VerifyOtpDto, LoginPasswordDto, RefreshTokenDto } from './dto/auth.dto';
import { UserRole } from '@prisma/client';
import { JwtPayload } from './jwt.strategy';

interface OtpEntry {
  code: string;
  expiresAt: number;
  lastRequestedAt: number;
  attempts: number;
}

@Injectable()
export class AuthService {
  // In-memory OTP storage with rate-limit and brute-force tracking
  private otpStorage = new Map<string, OtpEntry>();
  // Temporary lockouts for brute force protection (phone -> lockedUntil timestamp)
  private lockoutStorage = new Map<string, number>();

  private readonly accessSecret: string;
  private readonly refreshSecret: string;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
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

    // 1. Check if number is currently locked due to brute force
    const lockedUntil = this.lockoutStorage.get(phone);
    if (lockedUntil && lockedUntil > now) {
      const waitMinutes = Math.ceil((lockedUntil - now) / 60000);
      throw new BadRequestException(
        `Номер временно заблокирован из-за множественных неверных попыток. Попробуйте через ${waitMinutes} мин.`,
      );
    }

    // 2. Rate limiting: maximum 1 SMS per 60 seconds per phone
    const existing = this.otpStorage.get(phone);
    if (existing && now - existing.lastRequestedAt < 60000) {
      const waitSeconds = Math.ceil((60000 - (now - existing.lastRequestedAt)) / 1000);
      throw new BadRequestException(
        `Слишком частый запрос кода. Повторная отправка SMS возможна через ${waitSeconds} сек.`,
      );
    }

    // 3. Generate cryptographically secure 6-digit random code (100000 - 999999)
    const code = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = now + 5 * 60 * 1000; // 5 minutes TTL

    this.otpStorage.set(phone, {
      code,
      expiresAt,
      lastRequestedAt: now,
      attempts: 0,
    });

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

    // 1. Check lockout
    const lockedUntil = this.lockoutStorage.get(phone);
    if (lockedUntil && lockedUntil > now) {
      throw new BadRequestException('Номер временно заблокирован. Попробуйте позже.');
    }

    const record = this.otpStorage.get(phone);
    if (!record || record.expiresAt < now) {
      this.otpStorage.delete(phone);
      throw new BadRequestException('Срок действия SMS-кода истек или код не запрашивался. Запросите новый код.');
    }

    // 2. Constant-time comparison to prevent timing attacks
    const isMatch =
      record.code.length === code.length &&
      crypto.timingSafeEqual(Buffer.from(record.code), Buffer.from(code));

    if (!isMatch) {
      record.attempts += 1;
      if (record.attempts >= 3) {
        this.otpStorage.delete(phone);
        this.lockoutStorage.set(phone, now + 10 * 60 * 1000); // 10 minutes lockout
        throw new BadRequestException(
          'Превышено максимальное количество попыток ввода кода (3). Номер заблокирован на 10 минут.',
        );
      }
      throw new BadRequestException(
        `Неверный SMS-код. Осталось попыток: ${3 - record.attempts}`,
      );
    }

    // OTP verified successfully -> clear state
    this.otpStorage.delete(phone);

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

    const tokens = this.generateTokens(user.id, user.phone, user.role, user.tenantId);

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
    const record = this.otpStorage.get(phone);
    if (!record || record.expiresAt < Date.now()) {
      throw new BadRequestException(
        'Срок действия SMS-кода подтверждения голоса истек или код не запрашивался. Сначала запросите SMS-код.',
      );
    }

    const isMatch =
      record.code.length === code.length &&
      crypto.timingSafeEqual(Buffer.from(record.code), Buffer.from(code));

    if (!isMatch) {
      record.attempts += 1;
      if (record.attempts >= 3) {
        this.otpStorage.delete(phone);
        this.lockoutStorage.set(phone, Date.now() + 10 * 60 * 1000);
        throw new BadRequestException('Превышено количество попыток ввода. Номер заблокирован.');
      }
      throw new BadRequestException(`Неверный SMS-код подтверждения голоса. Осталось попыток: ${3 - record.attempts}`);
    }

    // Code consumed
    this.otpStorage.delete(phone);
    return true;
  }

  async loginWithPassword(dto: LoginPasswordDto) {
    const { login, password } = dto;

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
      throw new UnauthorizedException('Неверный логин или пароль');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }

    const tokens = this.generateTokens(user.id, user.phone, user.role, user.tenantId);

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
      throw new UnauthorizedException('Недействительный или истекший refresh-токен');
    }

    if (!payload || payload.type !== 'refresh') {
      throw new UnauthorizedException('Предоставленный токен не является refresh-токеном');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Пользователь заблокирован или не найден');
    }

    return this.generateTokens(user.id, user.phone, user.role, user.tenantId);
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
      throw new UnauthorizedException('Пользователь не найден');
    }

    return user;
  }

  private generateTokens(userId: string, phone: string, role: string, tenantId?: string | null) {
    const accessPayload: JwtPayload = {
      sub: userId,
      phone,
      role,
      tenantId,
      type: 'access',
    };

    const refreshPayload: JwtPayload = {
      sub: userId,
      phone,
      role,
      tenantId,
      type: 'refresh',
    };

    const accessToken = this.jwtService.sign(accessPayload, {
      secret: this.accessSecret,
      expiresIn: '7d',
    });

    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.refreshSecret,
      expiresIn: '30d',
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: 604800, // 7 days in seconds
    };
  }
}
