import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  phone: string;
  role: string;
  tenantId?: string | null;
  type: 'access' | 'refresh' | 'password_change';
  tokenVersion?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const secret = configService.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error(
        'КРИТИЧЕСКАЯ ОШИБКА БЕЗОПАСНОСТИ: JWT_ACCESS_SECRET не задан в переменных окружения!',
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    // Defense against token type confusion: refresh tokens cannot be used as access tokens
    if (!payload || payload.type !== 'access') {
      throw new UnauthorizedException({
        code: 'AUTH.INVALID_TOKEN_TYPE',
        message: 'Недопустимый тип токена. Refresh-токен не может использоваться для авторизации запросов',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
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

    return user;
  }
}
