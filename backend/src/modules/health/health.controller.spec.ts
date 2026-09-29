import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

describe('HealthController & HealthService (Liveness & Readiness probes)', () => {
  let controller: HealthController;
  let service: HealthService;
  let prismaMock: { $queryRaw: jest.Mock };
  let redisMock: { ping: jest.Mock };

  beforeEach(async () => {
    prismaMock = {
      $queryRaw: jest.fn(),
    };

    redisMock = {
      ping: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: RedisService, useValue: redisMock },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    service = module.get<HealthService>(HealthService);
  });

  describe('Liveness probe (GET /health)', () => {
    it('всегда возвращает 200 со статусом ok без обращения к БД и Redis', () => {
      const response = controller.getLiveness();

      expect(response.status).toBe('ok');
      expect(response.timestamp).toBeDefined();
      expect(new Date(response.timestamp).getTime()).not.toBeNaN();

      // Проверяем, что к внешним зависимостям запросы не выполнялись
      expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
      expect(redisMock.ping).not.toHaveBeenCalled();
    });

    it('ответ не содержит уязвимых данных (секретов, паролей, версий зависимостей)', () => {
      const response = controller.getLiveness() as Record<string, any>;

      expect(response.version).toBeUndefined();
      expect(response.secret).toBeUndefined();
      expect(response.env).toBeUndefined();
      expect(Object.keys(response)).toEqual(['status', 'timestamp']);
    });
  });

  describe('Readiness probe (GET /health/ready)', () => {
    it('возвращает 200 со статусом ok, когда и Postgres, и Redis доступны', async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
      redisMock.ping.mockResolvedValueOnce('PONG');

      const response = await controller.getReadiness();

      expect(response.status).toBe('ok');
      expect(response.details).toEqual({
        database: 'up',
        redis: 'up',
      });
      expect(response.timestamp).toBeDefined();
      expect(prismaMock.$queryRaw).toHaveBeenCalled();
      expect(redisMock.ping).toHaveBeenCalled();
    });

    it('выбрасывает 503 ServiceUnavailableException, если PostgreSQL недоступен', async () => {
      prismaMock.$queryRaw.mockRejectedValueOnce(new Error('Connection refused: 5432'));
      redisMock.ping.mockResolvedValueOnce('PONG');

      let error: any;
      try {
        await controller.getReadiness();
      } catch (err: any) {
        error = err;
      }

      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(error.getStatus()).toBe(503);
      const res = error.getResponse();
      expect(res.status).toBe('error');
      expect(res.details.database).toBe('down');
      expect(res.details.redis).toBe('up');
    });

    it('выбрасывает 503 ServiceUnavailableException, если Redis недоступен', async () => {
      prismaMock.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
      redisMock.ping.mockRejectedValueOnce(new Error('Connection refused: 6379'));

      let error: any;
      try {
        await controller.getReadiness();
      } catch (err: any) {
        error = err;
      }

      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(error.getStatus()).toBe(503);
      const res = error.getResponse();
      expect(res.status).toBe('error');
      expect(res.details.database).toBe('up');
      expect(res.details.redis).toBe('down');
    });

    it('выбрасывает 503 ServiceUnavailableException, если обе зависимости недоступны', async () => {
      prismaMock.$queryRaw.mockRejectedValueOnce(new Error('DB connection timeout'));
      redisMock.ping.mockRejectedValueOnce(new Error('Redis connection timeout'));

      let error: any;
      try {
        await controller.getReadiness();
      } catch (err: any) {
        error = err;
      }

      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(error.getStatus()).toBe(503);
      const res = error.getResponse();
      expect(res.status).toBe('error');
      expect(res.details.database).toBe('down');
      expect(res.details.redis).toBe('down');
    });
  });

  describe('Security & Public Access check', () => {
    it('контроллер не закрыт JwtAuthGuard (публичный доступ)', () => {
      const classGuards = Reflect.getMetadata('__guards__', HealthController) || [];
      expect(classGuards).not.toContain(JwtAuthGuard);

      const livenessGuards =
        Reflect.getMetadata('__guards__', HealthController.prototype.getLiveness) || [];
      expect(livenessGuards).not.toContain(JwtAuthGuard);

      const readinessGuards =
        Reflect.getMetadata('__guards__', HealthController.prototype.getReadiness) || [];
      expect(readinessGuards).not.toContain(JwtAuthGuard);
    });

    it('на контроллере установлен флаг SkipThrottle для предотвращения блокировки healthcheck probes', () => {
      const skipThrottle = Reflect.getMetadata('THROTTLER:SKIPdefault', HealthController);
      expect(skipThrottle).toBe(true);
    });
  });
});
