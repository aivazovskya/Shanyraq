import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthService, LivenessResponse, ReadinessResponse } from './health.service';

@ApiTags('Health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness probe (всегда возвращает 200)' })
  @ApiResponse({ status: 200, description: 'Сервер запущен и обрабатывает запросы' })
  getLiveness(): LivenessResponse {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Readiness probe (проверяет доступность Postgres и Redis)' })
  @ApiResponse({ status: 200, description: 'Все инфраструктурные зависимости готовы' })
  @ApiResponse({ status: 503, description: 'Одна или несколько зависимостей недоступны' })
  async getReadiness(): Promise<ReadinessResponse> {
    return this.healthService.getReadiness();
  }
}
