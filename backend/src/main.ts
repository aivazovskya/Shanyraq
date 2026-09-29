import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { NestExpressApplication } from '@nestjs/platform-express';
import { validationExceptionFactory } from './common/pipes/validation-exception.factory';
import { validatePiiCryptoConfig } from './common/crypto/pii-crypto.helper';

async function bootstrap() {
  // Fail-fast проверка обязательных ключей шифрования ПДн (AES-256-GCM)
  validatePiiCryptoConfig();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Настройка Trust Proxy (Express)
  // 0 (по умолчанию в dev) — отключено, защищает от подделки X-Forwarded-For
  // 1 (в production за Nginx/ALB) — доверяет 1 хопу прокси для точного определения req.ip
  const trustProxyEnv = process.env.TRUST_PROXY ?? '0';
  const trustProxyHops = parseInt(trustProxyEnv, 10);
  const trustProxy = !isNaN(trustProxyHops)
    ? trustProxyHops
    : trustProxyEnv.toLowerCase() === 'true';
  app.set('trust proxy', trustProxy);

  // Security Headers
  app.use(helmet());

  // Enable CORS for web-admin and mobile clients
  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim())
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:8081'];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow mobile apps, curl, or dev servers
      if (!origin || process.env.NODE_ENV !== 'production' || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  });

  // Global prefix: /api/v1 (исключая health-эндпоинты для Docker / K8s probes)
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/(.*)'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      exceptionFactory: validationExceptionFactory,
    }),
  );

  // OpenAPI / Swagger Documentation (gated behind non-production)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Shanyraq (Шаңырақ) Core API')
      .setDescription(
        'Цифровая экосистема для жильцов, ОСИ и управляющих компаний Казахстана.\n\n' +
        'Включает:\n' +
        '- Легитимные голосования ОСС с расчетом кворума по полезной площади (Закон РК «О жилищных отношениях»)\n' +
        '- Управление доступом (шлагбаум Pal-ES, RTSP/WebRTC камеры, гостевые пропуска)\n' +
        '- Service Desk заявок на обслуживание и диспетчеризация\n' +
        '- Реестр жилого фонда и верификация собственников',
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 4000;
  await app.listen(port);

  console.log(`\n=============================================================`);
  console.log(`🚀 Сервер «Shanyraq» успешно запущен!`);
  console.log(`📡 API эндпоинты: http://localhost:${port}/api/v1`);
  console.log(`📑 Swagger документация: http://localhost:${port}/api/docs`);
  console.log(`=============================================================\n`);
}

bootstrap();
