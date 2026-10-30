import { SpadesAdmissionController } from './rooms/spades-admission';
import { spadesPolicySchema, type SpadesPolicy } from '@deckforge/contracts';
import { GameRooms } from './rooms/router';
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
import { ChipController } from './rooms/chip-controller';
import {
  MatchSettlementService,
  startSettlementWorker,
  type ClassicAdmissionPolicy,
} from './rooms/settlement';
import { LobbyController } from './rooms/lobby';
import { PokerRoomController } from './rooms/controller';
import { PokerRoomService, startTimeoutWorker } from './rooms/service';
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
  admissionPolicy: ClassicAdmissionPolicy | null = null,
  spadesPolicy: SpadesPolicy | null = null,
) {
  if (spadesPolicy) spadesPolicy = spadesPolicySchema.parse(spadesPolicy);
  let stopSocket = async () => {};
  let stopTimeouts = async () => {};
  let stopSettlements = async () => {};
  const pokerRooms = auth ? new PokerRoomService(auth.database) : null;
  const gameRooms = auth ? new GameRooms(auth.database) : null;
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
        ChipController,
        SpadesAdmissionController,
      ],
      providers: [
        { provide: 'AUTH_SERVICE', useValue: auth },
        { provide: 'ADMISSION_POLICY', useValue: admissionPolicy },
        { provide: 'SPADES_POLICY', useValue: spadesPolicy },
        { provide: 'POKER_ROOMS', useValue: gameRooms },
        {
          provide: 'STARTER_SERVICE',
          useValue: auth ? new StarterService(auth) : null,
        },
        { provide: 'CATALOG_DATABASE', useValue: catalogDatabase },
        {
          provide: 'AUTH_SHUTDOWN',
          useValue: {
            beforeApplicationShutdown: async () => {
              await stopTimeouts();
              await stopSettlements();
              await stopSocket();
            },
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
    gameRooms,
  );
  if (pokerRooms) stopTimeouts = startTimeoutWorker(pokerRooms);
  if (auth)
    stopSettlements = startSettlementWorker(
      new MatchSettlementService(auth.database, admissionPolicy),
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
