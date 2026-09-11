import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisService } from './redis.service';

const mockRedisInstance = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  quit: jest.fn(),
  disconnect: jest.fn(),
  on: jest.fn(),
};

const MockRedisConstructor = jest.fn().mockImplementation(() => mockRedisInstance);

jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation((...args) => MockRedisConstructor(...args)),
    Redis: jest.fn().mockImplementation((...args) => MockRedisConstructor(...args)),
  };
});

describe('RedisService', () => {
  let service: RedisService;
  let configService: ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization and configuration', () => {
    it('should initialize Redis with default options when environment variables are omitted', () => {
      configService = {
        get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
          if (key === 'REDIS_HOST') return defaultValue ?? 'localhost';
          if (key === 'REDIS_PORT') return defaultValue ?? '6379';
          if (key === 'REDIS_PASSWORD') return undefined;
          return defaultValue;
        }),
      } as unknown as ConfigService;

      service = new RedisService(configService);

      expect(MockRedisConstructor).toHaveBeenCalledWith({
        host: 'localhost',
        port: 6379,
        password: undefined,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: expect.any(Function),
      });
      expect(mockRedisInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should initialize Redis with provided custom config', () => {
      configService = {
        get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
          if (key === 'REDIS_HOST') return 'redis.internal';
          if (key === 'REDIS_PORT') return '6380';
          if (key === 'REDIS_PASSWORD') return 'secret_pass';
          return defaultValue;
        }),
      } as unknown as ConfigService;

      service = new RedisService(configService);

      expect(MockRedisConstructor).toHaveBeenCalledWith({
        host: 'redis.internal',
        port: 6380,
        password: 'secret_pass',
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: expect.any(Function),
      });
    });

    it('should register an error event listener that logs warnings without throwing', () => {
      let registeredErrorHandler: ((err: Error) => void) | undefined;
      mockRedisInstance.on.mockImplementation((event: string, callback: any) => {
        if (event === 'error') {
          registeredErrorHandler = callback;
        }
      });

      configService = {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService;

      service = new RedisService(configService);

      expect(registeredErrorHandler).toBeDefined();
      expect(() => registeredErrorHandler!(new Error('Test connection reset'))).not.toThrow();
    });

    it('should correctly configure retryStrategy backoff and cutoff', () => {
      configService = {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService;

      service = new RedisService(configService);

      const redisConstructorCalls = MockRedisConstructor.mock.calls;
      const lastCallArgs = redisConstructorCalls[redisConstructorCalls.length - 1][0];
      const retryStrategy = lastCallArgs.retryStrategy;

      expect(retryStrategy(1)).toBe(100);
      expect(retryStrategy(2)).toBe(200);
      expect(retryStrategy(3)).toBe(300);
      expect(retryStrategy(4)).toBeNull();
      expect(retryStrategy(5)).toBeNull();
    });
  });

  describe('getClient', () => {
    it('should return the underlying Redis client instance', () => {
      configService = {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService;

      service = new RedisService(configService);
      expect(service.getClient()).toBe(mockRedisInstance);
    });
  });

  describe('data operations', () => {
    beforeEach(() => {
      configService = {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService;
      service = new RedisService(configService);
    });

    it('should delegate get() to client.get()', async () => {
      mockRedisInstance.get.mockResolvedValue('test_value');

      const result = await service.get('my_key');

      expect(mockRedisInstance.get).toHaveBeenCalledWith('my_key');
      expect(result).toBe('test_value');
    });

    it('should delegate set() without TTL to client.set(key, value)', async () => {
      mockRedisInstance.set.mockResolvedValue('OK');

      const result = await service.set('my_key', 'my_val');

      expect(mockRedisInstance.set).toHaveBeenCalledWith('my_key', 'my_val');
      expect(result).toBe('OK');
    });

    it('should delegate set() with positive TTL to client.set(key, value, "EX", ttlSeconds)', async () => {
      mockRedisInstance.set.mockResolvedValue('OK');

      const result = await service.set('my_key', 'my_val', 120);

      expect(mockRedisInstance.set).toHaveBeenCalledWith('my_key', 'my_val', 'EX', 120);
      expect(result).toBe('OK');
    });

    it('should delegate set() with TTL === 0 to client.set(key, value) without EX', async () => {
      mockRedisInstance.set.mockResolvedValue('OK');

      const result = await service.set('my_key', 'my_val', 0);

      expect(mockRedisInstance.set).toHaveBeenCalledWith('my_key', 'my_val');
      expect(result).toBe('OK');
    });

    it('should delegate set() with negative TTL to client.set(key, value) without EX', async () => {
      mockRedisInstance.set.mockResolvedValue('OK');

      const result = await service.set('my_key', 'my_val', -10);

      expect(mockRedisInstance.set).toHaveBeenCalledWith('my_key', 'my_val');
      expect(result).toBe('OK');
    });

    it('should delegate del() to client.del(key)', async () => {
      mockRedisInstance.del.mockResolvedValue(1);

      const result = await service.del('my_key');

      expect(mockRedisInstance.del).toHaveBeenCalledWith('my_key');
      expect(result).toBe(1);
    });

    it('should delegate incr() to client.incr(key)', async () => {
      mockRedisInstance.incr.mockResolvedValue(5);

      const result = await service.incr('my_counter');

      expect(mockRedisInstance.incr).toHaveBeenCalledWith('my_counter');
      expect(result).toBe(5);
    });

    it('should delegate expire() to client.expire(key, seconds)', async () => {
      mockRedisInstance.expire.mockResolvedValue(1);

      const result = await service.expire('my_key', 3600);

      expect(mockRedisInstance.expire).toHaveBeenCalledWith('my_key', 3600);
      expect(result).toBe(1);
    });
  });

  describe('onModuleDestroy', () => {
    beforeEach(() => {
      configService = {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService;
      service = new RedisService(configService);
    });

    it('should cleanly call quit() when disconnect succeeds', async () => {
      mockRedisInstance.quit.mockResolvedValue('OK');

      await service.onModuleDestroy();

      expect(mockRedisInstance.quit).toHaveBeenCalledTimes(1);
      expect(mockRedisInstance.disconnect).not.toHaveBeenCalled();
    });

    it('should fallback to disconnect() when quit() throws', async () => {
      mockRedisInstance.quit.mockRejectedValue(new Error('Quit failed / connection broken'));

      await service.onModuleDestroy();

      expect(mockRedisInstance.quit).toHaveBeenCalledTimes(1);
      expect(mockRedisInstance.disconnect).toHaveBeenCalledTimes(1);
    });
  });
});
