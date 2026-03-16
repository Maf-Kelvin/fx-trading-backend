// ─── main.ts ───────────────────────────────────────────────────────

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for dashboard HTML files opened from browser
  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  });

  // Global validation pipe — strips unknown fields, auto-transforms types
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Swagger / OpenAPI
  const swaggerConfig = new DocumentBuilder()
    .setTitle('FX Trading API')
    .setDescription(
      [
        'Multi-currency FX trading backend.',
        'Register → verify OTP → fund wallet → convert or trade NGN / USD / EUR / GBP.',
        '',
        '**Authentication**: Use `POST /auth/login` to obtain a Bearer token,',
        'then click the Authorize button above and paste it in.',
        '',
        '**Idempotency**: Pass an optional `idempotencyKey` UUID in the request body',
        'for `/wallet/fund`, `/wallet/convert`, and `/wallet/trade` to make retries safe.',
        '',
        '**Correlation IDs**: Every response includes an `X-Request-ID` header for tracing.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀  Server:  http://localhost:${port}`);
  console.log(`📚  Swagger: http://localhost:${port}/api/docs`);
  console.log(`❤️   Health:  http://localhost:${port}/health`);
}

bootstrap();