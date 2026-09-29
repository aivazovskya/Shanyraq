import { ExecutionContext, HttpException, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  PhoneOtpRateLimitGuard,
  normalizePhoneForRateLimit,
  hashPhoneForRateLimit,
} from './phone-otp-rate-limit.guard';
import { RedisService } from '../../redis/redis.service';

describe('PhoneOtpRateLimitGuard', () => {
  let guard: PhoneOtpRateLimitGuard;
  let mockPipeline: {
    incr: jest.Mock;
    ttl: jest.Mock;
    exec: jest.Mock;
  };
  let mockRedisClient: {
    pipeline: jest.Mock;
    expire: jest.Mock;
  };
  let mockRedisService: {
    getClient: jest.Mock;
  };

  const createMockContext = (body: any, ip = '127.0.0.1') => {
    const headers: Record<string, any> = {};
    const req = {
      body,
      ip,
      headers: {},
      socket: { remoteAddress: ip },
    };
    const res = {
      setHeader: jest.fn((key: string, val: any) => {
        headers[key] = val;
      }),
      header: jest.fn((key: string, val: any) => {
        headers[key] = val;
      }),
      headers,
    };

    const context = {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext;

    return { context, req, res };
  };

  beforeEach(() => {
    mockPipeline = {
      incr: jest.fn().mockReturnThis(),
      ttl: jest.fn().mockReturnThis(),
      exec: jest.fn(),
    };

    mockRedisClient = {
      pipeline: jest.fn().mockReturnValue(mockPipeline),
      expire: jest.fn().mockResolvedValue(1),
    };

    mockRedisService = {
      getClient: jest.fn().mockReturnValue(mockRedisClient),
    };

    guard = new PhoneOtpRateLimitGuard(mockRedisService as unknown as RedisService);
  });

  describe('phone normalization and hashing', () => {
    it('should normalize 8701... to +7701...', () => {
      expect(normalizePhoneForRateLimit('87011234567')).toBe('+77011234567');
      expect(normalizePhoneForRateLimit('+7 (701) 123-45-67')).toBe('+77011234567');
    });

    it('should generate SHA-256 hex hash from normalized phone', () => {
      const phone = '+77011234567';
      const expectedHash = crypto.createHash('sha256').update(phone).digest('hex');
      expect(hashPhoneForRateLimit(phone)).toBe(expectedHash);
    });

    it('should hash normalized phone without plaintext phone in Redis key', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 1],
        [null, 600],
      ]);

      const phone = '+7 (701) 123-45-67';
      const expectedHash = hashPhoneForRateLimit('+77011234567');
      const { context } = createMockContext({ phone });

      await guard.canActivate(context);

      const expectedRedisKey = `ratelimit:phone_otp:${expectedHash}`;
      expect(mockPipeline.incr).toHaveBeenCalledWith(expectedRedisKey);
      expect(expectedRedisKey).not.toContain(phone);
      expect(expectedRedisKey).not.toContain('7011234567');
    });
  });

  describe('rate limiting behavior', () => {
    it('should allow 3 requests within window', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 3],
        [null, 500],
      ]);

      const { context } = createMockContext({ phone: '+77011234567' });
      const canProceed = await guard.canActivate(context);

      expect(canProceed).toBe(true);
    });

    it('should block 4th request with 429 and Retry-After header', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 4],
        [null, 450],
      ]);

      const { context, res } = createMockContext({ phone: '+77011234567' });

      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);

      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', 450);

      try {
        await guard.canActivate(context);
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(err.getResponse()).toMatchObject({
          code: 'AUTH.PHONE_RATE_LIMITED',
        });
      }
    });

    it('should NOT be bypassed by changing IP address', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 4],
        [null, 300],
      ]);

      // Request from IP 1.2.3.4
      const ctx1 = createMockContext({ phone: '+77011234567' }, '1.2.3.4').context;
      await expect(guard.canActivate(ctx1)).rejects.toThrow(HttpException);

      // Request from IP 5.6.7.8 with the same phone
      const ctx2 = createMockContext({ phone: '+77011234567' }, '5.6.7.8').context;
      await expect(guard.canActivate(ctx2)).rejects.toThrow(HttpException);

      // Verify that same key was incremented regardless of IP
      const expectedHash = hashPhoneForRateLimit('+77011234567');
      expect(mockPipeline.incr).toHaveBeenNthCalledWith(1, `ratelimit:phone_otp:${expectedHash}`);
      expect(mockPipeline.incr).toHaveBeenNthCalledWith(2, `ratelimit:phone_otp:${expectedHash}`);
    });

    it('should set expiration on first request', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 1],
        [null, -1],
      ]);

      const { context } = createMockContext({ phone: '+77011234567' });
      await guard.canActivate(context);

      expect(mockRedisClient.expire).toHaveBeenCalledWith(
        expect.stringContaining('ratelimit:phone_otp:'),
        600,
      );
    });

    it('should bypass guard if phone is missing in body (let DTO validation handle it)', async () => {
      const { context } = createMockContext({});
      const canProceed = await guard.canActivate(context);

      expect(canProceed).toBe(true);
      expect(mockRedisService.getClient).not.toHaveBeenCalled();
    });
  });

  describe('fail-closed on Redis failure', () => {
    it('should throw ServiceUnavailableException 503 AUTH.SERVICE_UNAVAILABLE on Redis error', async () => {
      mockPipeline.exec.mockRejectedValue(new Error('Redis connection down'));

      const { context } = createMockContext({ phone: '+77011234567' });

      await expect(guard.canActivate(context)).rejects.toThrow(ServiceUnavailableException);

      try {
        await guard.canActivate(context);
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
        expect(err.getResponse()).toEqual({
          code: 'AUTH.SERVICE_UNAVAILABLE',
          message: 'Сервис временно недоступен, попробуйте позже',
        });
      }
    });
  });
});
