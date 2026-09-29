import { ServiceUnavailableException } from '@nestjs/common';
import { RedisThrottlerStorage } from './redis-throttler.storage';
import { RedisService } from './redis.service';

describe('RedisThrottlerStorage', () => {
  let storage: RedisThrottlerStorage;
  let mockRedisClient: { eval: jest.Mock };
  let mockRedisService: { getClient: jest.Mock };

  beforeEach(() => {
    mockRedisClient = {
      eval: jest.fn(),
    };
    mockRedisService = {
      getClient: jest.fn().mockReturnValue(mockRedisClient),
    };
    storage = new RedisThrottlerStorage(mockRedisService as unknown as RedisService);
  });

  describe('increment', () => {
    it('should increment key and return ThrottlerStorageRecord when below limit', async () => {
      mockRedisClient.eval.mockResolvedValue([1, 60, 0, 0]);

      const record = await storage.increment('test-key', 60000, 5, 0, 'default');

      expect(mockRedisService.getClient).toHaveBeenCalled();
      expect(mockRedisClient.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'ratelimit:test-key',
        60000,
        5,
        0,
      );
      expect(record).toEqual({
        totalHits: 1,
        timeToExpire: 60,
        isBlocked: false,
        timeToBlockExpire: 0,
      });
    });

    it('should return isBlocked: true when limit is exceeded', async () => {
      mockRedisClient.eval.mockResolvedValue([6, 60, 1, 60]);

      const record = await storage.increment('test-key', 60000, 5, 60000, 'default');

      expect(record).toEqual({
        totalHits: 6,
        timeToExpire: 60,
        isBlocked: true,
        timeToBlockExpire: 60,
      });
    });

    it('should fail-closed on Redis error for sensitive endpoints (throwing 503)', async () => {
      mockRedisClient.eval.mockRejectedValue(new Error('Connection refused'));

      await expect(
        storage.increment('auth:login:127.0.0.1', 60000, 5, 0, 'default'),
      ).rejects.toThrow(ServiceUnavailableException);

      try {
        await storage.increment('auth:login:127.0.0.1', 60000, 5, 0, 'default');
      } catch (err: any) {
        expect(err.getResponse()).toEqual({
          code: 'AUTH.SERVICE_UNAVAILABLE',
          message: 'Сервис временно недоступен, попробуйте позже',
        });
      }
    });

    it('should fail-closed for any non-default throttlerName', async () => {
      mockRedisClient.eval.mockRejectedValue(new Error('Redis timeout'));

      await expect(
        storage.increment('custom-key', 60000, 5, 0, 'customThrottler'),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('should fail-open on Redis error for global non-sensitive limits (returning 1 hit)', async () => {
      mockRedisClient.eval.mockRejectedValue(new Error('Connection dropped'));

      const record = await storage.increment('general:tenant:127.0.0.1', 60000, 60, 0, 'default');

      expect(record).toEqual({
        totalHits: 1,
        timeToExpire: 60,
        isBlocked: false,
        timeToBlockExpire: 0,
      });
    });
  });

  describe('isSensitiveKey', () => {
    it('should detect sensitive keywords in key name', () => {
      expect(storage.isSensitiveKey('auth_request_otp_127.0.0.1', 'default')).toBe(true);
      expect(storage.isSensitiveKey('verify_otp_127.0.0.1', 'default')).toBe(true);
      expect(storage.isSensitiveKey('login_password_127.0.0.1', 'default')).toBe(true);
      expect(storage.isSensitiveKey('pin_reset_127.0.0.1', 'default')).toBe(true);
      expect(storage.isSensitiveKey('refresh_token_127.0.0.1', 'default')).toBe(true);
      expect(storage.isSensitiveKey('votings_cast_vote_127.0.0.1', 'default')).toBe(true);
    });

    it('should return false for regular general endpoints', () => {
      expect(storage.isSensitiveKey('announcements_list_127.0.0.1', 'default')).toBe(false);
      expect(storage.isSensitiveKey('properties_units_127.0.0.1', 'default')).toBe(false);
    });

    it('should return true if throttlerName is not default', () => {
      expect(storage.isSensitiveKey('any_key', 'strictThrottler')).toBe(true);
    });
  });
});
