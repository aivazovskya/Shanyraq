import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { RequestOtpDto, VerifyOtpDto, LoginPasswordDto } from './dto/auth.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  // In-memory OTP storage for development / pilot (TTL 5 mins)
  private otpStorage = new Map<string, { code: string; expiresAt: number }>();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async requestOtp(dto: RequestOtpDto) {
    const { phone } = dto;
    
    // Generate 4-digit OTP code (for test numbers in dev: '1234')
    const code = phone.startsWith('+7700') || phone.startsWith('+7701') ? '1234' : Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000;

    this.otpStorage.set(phone, { code, expiresAt });

    console.log(`[SMS-SERVICE] 📨 SMS отправлен на ${phone}: "Код подтверждения Shanyraq: ${code}"`);

    return {
      success: true,
      message: 'Код подтверждения успешно отправлен по SMS',
      // В dev режиме возвращаем код для быстрого тестирования в Swagger/Postman
      devCode: process.env.NODE_ENV !== 'production' ? code : undefined,
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const { phone, code } = dto;
    const record = this.otpStorage.get(phone);

    // Development backdoor: code '1234' always allowed in dev mode
    const isValidDevCode = process.env.NODE_ENV !== 'production' && code === '1234';

    if (!isValidDevCode) {
      if (!record || record.expiresAt < Date.now()) {
        throw new BadRequestException('Срок действия SMS-кода истек. Запросите новый код');
      }
      if (record.code !== code) {
        throw new BadRequestException('Неверный SMS-код');
      }
    }

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
      // Auto-register new resident with RESIDENT_OWNER role pending property link
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

    const tokens = this.generateTokens(user.id, user.phone, user.role);

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

    const tokens = this.generateTokens(user.id, user.phone, user.role);

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

  private generateTokens(userId: string, phone: string, role: string) {
    const payload = { sub: userId, phone, role };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '7d' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '30d' });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: 604800, // 7 days in seconds
    };
  }
}
