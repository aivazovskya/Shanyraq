import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

export interface LivenessResponse {
  status: 'ok';
  timestamp: string;
}

export interface ReadinessDetails {
  database: 'up' | 'down';
  redis: 'up' | 'down';
}

export interface ReadinessResponse {
  status: 'ok' | 'error';
  details: ReadinessDetails;
  timestamp: string;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Liveness probe: возвращает 200 без обращения к БД и Redis.
   */
  getLiveness(): LivenessResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness probe: проверяет доступность PostgreSQL (SELECT 1) и Redis (PING).
   * Выбрасывает ServiceUnavailableException (503), если один из компонентов недоступен.
   */
  async getReadiness(): Promise<ReadinessResponse> {
    let databaseStatus: 'up' | 'down' = 'down';
    let redisStatus: 'up' | 'down' = 'down';

    // 1. Проверка PostgreSQL
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      databaseStatus = 'up';
    } catch (err) {
      this.logger.error(
        `Database readiness check failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 2. Проверка Redis
    try {
      const pingResult = await this.redis.ping();
      if (pingResult === 'PONG') {
        redisStatus = 'up';
      } else {
        this.logger.warn(
          `Redis readiness check returned unexpected response: ${pingResult}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Redis readiness check failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const timestamp = new Date().toISOString();
    const details: ReadinessDetails = {
      database: databaseStatus,
      redis: redisStatus,
    };

    if (databaseStatus !== 'up' || redisStatus !== 'up') {
      throw new ServiceUnavailableException({
        status: 'error',
        details,
        timestamp,
      });
    }

    return {
      status: 'ok',
      details,
      timestamp,
    };
  }
}
