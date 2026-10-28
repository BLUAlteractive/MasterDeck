import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  healthResponseSchema,
  type HealthResponse,
} from '@deckforge/contracts';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { IdentityController } from './auth/controller';
import type { AuthService } from './auth/service';
import { SafeErrorFilter } from './auth/errors';
import { attachAuthSocket } from './auth/socket';
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
@Module({})
class AppModule {}

export async function createApp(
  origins: string[] = [],
  auth: AuthService | null = null,
) {
  let stopSocket = () => {};
  const app = await NestFactory.create<NestExpressApplication>(
    {
      module: AppModule,
      controllers: [HealthController, IdentityController],
      providers: [
        { provide: 'AUTH_SERVICE', useValue: auth },
        {
          provide: 'AUTH_SHUTDOWN',
          useValue: {
            beforeApplicationShutdown: () => stopSocket(),
            onApplicationShutdown: async () => {
              if (auth) await auth.database.$disconnect();
            },
          },
        },
      ],
    },
    {
      logger: ['error', 'warn', 'log'],
    },
  );
  app.useBodyParser('json', { limit: '16kb' });
  app.useGlobalFilters(new SafeErrorFilter());
  stopSocket = attachAuthSocket(app.getHttpServer(), auth, origins);
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
