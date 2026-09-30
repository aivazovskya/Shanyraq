import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { RedisService } from './redis.service';

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  /**
   * Атомарный Lua-скрипт для Redis:
   * 1. Проверяет наличие активной временной блокировки (blockKey).
   * 2. Инкрементирует счетчик запросов (key), при первом хите устанавливает TTL (PX).
   * 3. При превышении лимита (hits > limit) активирует блокировку (blockKey) на blockDuration (или ttl).
   * 4. Возвращает массив [hits, timeToExpire (сек), isBlocked (0|1), timeToBlockExpire (сек)].
   */
  private readonly incrementScript = `
    local key = KEYS[1]
    local ttl = tonumber(ARGV[1])
    local limit = tonumber(ARGV[2])
    local blockDuration = tonumber(ARGV[3])

    local blockKey = key .. ':blocked'
    local blockTtl = redis.call('pttl', blockKey)
    if blockTtl > 0 then
      local hits = tonumber(redis.call('get', key) or limit)
      return {hits, math.ceil(blockTtl / 1000), 1, math.ceil(blockTtl / 1000)}
    end

    local hits = redis.call('incr', key)
    if hits == 1 then
      redis.call('pexpire', key, ttl)
    end

    local pttl = redis.call('pttl', key)
    if pttl < 0 then
      redis.call('pexpire', key, ttl)
      pttl = ttl
    end

    local timeToExpire = math.ceil(pttl / 1000)

    if hits > limit then
      local bDuration = blockDuration > 0 and blockDuration or ttl
      redis.call('set', blockKey, '1', 'PX', bDuration)
      local bTtl = math.ceil(bDuration / 1000)
      return {hits, timeToExpire, 1, bTtl}
    end

    return {hits, timeToExpire, 0, 0}
  `;

  constructor(private readonly redisService: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const isSensitive = this.isSensitiveKey(key, throttlerName);
    const cleanKey = key.endsWith(':failclosed')
      ? key.slice(0, -':failclosed'.length)
      : key;
    const redisKey = `ratelimit:${cleanKey}`;

    try {
      const client = this.redisService.getClient();
      const result = (await client.eval(
        this.incrementScript,
        1,
        redisKey,
        ttl,
        limit,
        blockDuration,
      )) as [number, number, number, number];

      const [totalHits, timeToExpire, isBlockedNum, timeToBlockExpire] = result;

      return {
        totalHits: Number(totalHits),
        timeToExpire: Number(timeToExpire),
        isBlocked: Number(isBlockedNum) === 1,
        timeToBlockExpire: Number(timeToBlockExpire),
      };
    } catch (err: any) {
      if (err instanceof ServiceUnavailableException) {
        throw err;
      }

      if (isSensitive) {
        this.logger.error(
          `[FAIL-CLOSED] Сбой Redis при проверке чувствительного лимита (${cleanKey}): ${err.message}`,
        );
        throw new ServiceUnavailableException({
          code: 'AUTH.SERVICE_UNAVAILABLE',
          message: 'Сервис временно недоступен, попробуйте позже',
        });
      }

      this.logger.warn(
        `[FAIL-OPEN] Сбой Redis при проверке глобального лимита (${cleanKey}): ${err.message}. Запрос пропущен.`,
      );

      // Fail-open для глобального нечувствительного лимита
      return {
        totalHits: 1,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }

  /**
   * Определяет, является ли проверяемый эндпоинт чувствительным:
   * Только при наличии явного флага/суффикса :failclosed (от декоратора @FailClosedThrottle)
   * или throttlerName === 'failclosed'. Никакой подстроковой эвристики.
   */
  public isSensitiveKey(key: string, throttlerName?: string): boolean {
    if (throttlerName === 'failclosed') {
      return true;
    }
    return key.endsWith(':failclosed');
  }
}
