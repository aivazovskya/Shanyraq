import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { validationExceptionFactory } from './common/pipes/validation-exception.factory';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

  // Global prefix: /api/v1
  app.setGlobalPrefix('api/v1');

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
