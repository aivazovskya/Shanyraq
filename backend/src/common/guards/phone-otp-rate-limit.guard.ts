import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { RedisService } from '../../redis/redis.service';
import { RATE_LIMITS } from '../constants/rate-limit.constants';

export function normalizePhoneForRateLimit(rawPhone: string): string {
  const digits = rawPhone.trim().replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('8') || digits.startsWith('7'))) {
    return '+7' + digits.substring(1);
  }
  if (digits.length === 10) {
    return '+7' + digits;
  }
  return rawPhone.trim().startsWith('+') ? '+' + digits : digits;
}

export function hashPhoneForRateLimit(normalizedPhone: string): string {
  return crypto.createHash('sha256').update(normalizedPhone).digest('hex');
}

@Injectable()
export class PhoneOtpRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(PhoneOtpRateLimitGuard.name);

  constructor(private readonly redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    const rawPhone = req.body?.phone;
    if (!rawPhone || typeof rawPhone !== 'string') {
      // Валидация DTO обработает отсутствующий или нестроковый телефон
      return true;
    }

    const normalizedPhone = normalizePhoneForRateLimit(rawPhone);
    const phoneHash = hashPhoneForRateLimit(normalizedPhone);
    const redisKey = `ratelimit:phone_otp:${phoneHash}`;
    const ttlSeconds = Math.ceil(RATE_LIMITS.PHONE_REQUEST_OTP.TTL / 1000); // 600s = 10 мин
    const limit = RATE_LIMITS.PHONE_REQUEST_OTP.LIMIT; // 3

    try {
      const client = this.redisService.getClient();

      // Атомарный инкремент и запрос текущего TTL через Redis Pipeline
      const pipeline = client.pipeline();
      pipeline.incr(redisKey);
      pipeline.ttl(redisKey);
      const results = await pipeline.exec();

      if (!results || results[0][0]) {
        throw new Error(results?.[0]?.[0]?.message || 'Redis pipeline failed');
      }

      const hits = Number(results[0][1]);
      let ttl = Number(results[1][1]);

      // При первом запросе или при отсутствии TTL выставляем время жизни
      if (hits === 1 || ttl < 0) {
        await client.expire(redisKey, ttlSeconds);
        ttl = ttlSeconds;
      }

      if (hits > limit) {
        const retryAfter = ttl > 0 ? ttl : ttlSeconds;
        if (res && typeof res.setHeader === 'function') {
          res.setHeader('Retry-After', retryAfter);
        } else if (res && typeof res.header === 'function') {
          res.header('Retry-After', retryAfter);
        }

        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            code: 'AUTH.PHONE_RATE_LIMITED',
            message: 'Превышен лимит запросов SMS для этого номера. Пожалуйста, повторите через 10 минут.',
            params: { retryAfter },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (err: any) {
      if (err instanceof HttpException) {
        throw err;
      }

      this.logger.error(
        `[FAIL-CLOSED] Сбой Redis при проверке лимита SMS по телефону: ${err.message}`,
      );

      // Строго fail-closed при отказе Redis: предотвращает SMS-бомбинг
      throw new ServiceUnavailableException({
        code: 'AUTH.SERVICE_UNAVAILABLE',
        message: 'Сервис временно недоступен, попробуйте позже',
      });
    }
  }
}
