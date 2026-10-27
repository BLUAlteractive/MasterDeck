import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  healthResponseSchema,
  type HealthResponse,
} from '@deckforge/contracts';
import { rateLimit } from 'express-rate-limit';

@Controller('health')
class HealthController {
  @Get()
  health(): HealthResponse {
    return healthResponseSchema.parse({
      service: 'deckforge-api',
      status: 'ok',
    });
  }
}
@Module({ controllers: [HealthController] })
class AppModule {}

export async function createApp(origins: string[] = []) {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  app.enableCors({ origin: origins });
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 60,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
  );
  app.enableShutdownHooks();
  return app;
}
