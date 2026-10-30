import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  healthResponseSchema,
  type HealthResponse,
} from '@deckforge/contracts';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { IdentityController } from './auth/controller';
import type { PrismaClient } from '@deckforge/database';
import { CatalogController } from './catalog';
import { CardHistoryController } from './history';
import { LoadoutController } from './loadouts';
import { FavoriteController } from './favorites';
import { ArchiveController } from './archive';
import { LobbyController } from './rooms/lobby';
import { PokerRoomController } from './rooms/controller';
import { PokerRoomService } from './rooms/service';
import { StarterController, StarterService } from './starter';
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
  catalogDatabase: PrismaClient | null = auth?.database ?? null,
) {
  let stopSocket = () => {};
  const pokerRooms = auth ? new PokerRoomService(auth.database) : null;
  const app = await NestFactory.create<NestExpressApplication>(
    {
      module: AppModule,
      controllers: [
        HealthController,
        IdentityController,
        CatalogController,
        StarterController,
        CardHistoryController,
        LoadoutController,
        FavoriteController,
        ArchiveController,
        PokerRoomController,
        LobbyController,
      ],
      providers: [
        { provide: 'AUTH_SERVICE', useValue: auth },
        { provide: 'POKER_ROOMS', useValue: pokerRooms },
        {
          provide: 'STARTER_SERVICE',
          useValue: auth ? new StarterService(auth) : null,
        },
        { provide: 'CATALOG_DATABASE', useValue: catalogDatabase },
        {
          provide: 'AUTH_SHUTDOWN',
          useValue: {
            beforeApplicationShutdown: () => stopSocket(),
            onApplicationShutdown: async () => {
              if (auth) await auth.database.$disconnect();
              if (catalogDatabase && catalogDatabase !== auth?.database)
                await catalogDatabase.$disconnect();
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
  stopSocket = await attachAuthSocket(
    app.getHttpServer(),
    auth,
    origins,
    pokerRooms,
  );
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
