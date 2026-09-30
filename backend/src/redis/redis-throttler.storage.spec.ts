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

    it('should strip :failclosed suffix from Redis key when storing in Redis', async () => {
      mockRedisClient.eval.mockResolvedValue([1, 60, 0, 0]);

      await storage.increment('test-key:failclosed', 60000, 5, 0, 'default');

      expect(mockRedisClient.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'ratelimit:test-key',
        60000,
        5,
        0,
      );
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

    it('should fail-closed on Redis error for decorated endpoints with :failclosed (throwing 503)', async () => {
      mockRedisClient.eval.mockRejectedValue(new Error('Connection refused'));

      await expect(
        storage.increment('auth:login:127.0.0.1:failclosed', 60000, 5, 0, 'default'),
      ).rejects.toThrow(ServiceUnavailableException);

      try {
        await storage.increment('auth:login:127.0.0.1:failclosed', 60000, 5, 0, 'default');
      } catch (err: any) {
        expect(err.getResponse()).toEqual({
          code: 'AUTH.SERVICE_UNAVAILABLE',
          message: 'Сервис временно недоступен, попробуйте позже',
        });
      }
    });

    it('should fail-closed for throttlerName === "failclosed"', async () => {
      mockRedisClient.eval.mockRejectedValue(new Error('Redis timeout'));

      await expect(
        storage.increment('custom-key', 60000, 5, 0, 'failclosed'),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('should fail-open on Redis error for handler containing "pin" or "vote" WITHOUT decorator', async () => {
      mockRedisClient.eval.mockRejectedValue(new Error('Connection dropped'));

      // Handler name contains 'pin' and 'vote', but NOT decorated (:failclosed is absent)
      const recordPin = await storage.increment('AppController-ping-default:127.0.0.1', 60000, 60, 0, 'default');
      expect(recordPin).toEqual({
        totalHits: 1,
        timeToExpire: 60,
        isBlocked: false,
        timeToBlockExpire: 0,
      });

      const recordVote = await storage.increment('VotingsController-getVoteStats-default:127.0.0.1', 60000, 60, 0, 'default');
      expect(recordVote).toEqual({
        totalHits: 1,
        timeToExpire: 60,
        isBlocked: false,
        timeToBlockExpire: 0,
      });
    });

    it('should fail-closed on Redis error for handler containing "pin" or "vote" WITH decorator', async () => {
      mockRedisClient.eval.mockRejectedValue(new Error('Connection dropped'));

      await expect(
        storage.increment('AppController-ping-default:127.0.0.1:failclosed', 60000, 60, 0, 'default'),
      ).rejects.toThrow(ServiceUnavailableException);

      await expect(
        storage.increment('VotingsController-vote-default:127.0.0.1:failclosed', 60000, 10, 0, 'default'),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('isSensitiveKey', () => {
    it('should return true only when :failclosed suffix is present or throttlerName is failclosed', () => {
      expect(storage.isSensitiveKey('some_key:failclosed', 'default')).toBe(true);
      expect(storage.isSensitiveKey('some_key', 'failclosed')).toBe(true);
    });

    it('should return false for handlers containing "pin", "auth", "vote" WITHOUT decorator', () => {
      expect(storage.isSensitiveKey('AppController-ping-default:127.0.0.1', 'default')).toBe(false);
      expect(storage.isSensitiveKey('VotingsController-getVoteStats:127.0.0.1', 'default')).toBe(false);
      expect(storage.isSensitiveKey('AuthController-checkPinStatus:127.0.0.1', 'default')).toBe(false);
    });
  });
});
