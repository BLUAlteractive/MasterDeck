import {
  PackOpeningController,
  PackOpeningService,
  type PackOpeningConfig,
} from './packs/opening';
import { PackCatalogController, PackCatalogService } from './packs/catalog';
import type { PackPolicy } from '@deckforge/contracts';
import {
  ActivityController,
  ActivityService,
  startActivityWorker,
  type ActivityConfig,
} from './activity/service';
import {
  PrivacyController,
  PrivacyService,
  startPrivacyWorker,
  type PrivacyConfig,
} from './privacy/service';
import { OperationsController, RequestLatency } from './admin/operations';
import { SafetyController } from './admin/moderation';
import { ContentAdminController } from './admin/content';
import {
  TournamentController,
  TournamentService,
  startTournamentWorker,
} from './events/tournaments';
import {
  tournamentPolicySchema,
  type TournamentPolicy,
} from '@deckforge/contracts';
import { PurchaseHistoryController } from './billing/history';
import { BillingController } from './billing/controller';
import { BillingService, startBillingWorker } from './billing/service';
import type { BillingConfig } from './billing/providers';
import { StorefrontController } from './storefront';
import {
  storefrontPolicySchema,
  type StorefrontPolicy,
} from '@deckforge/contracts';
import { AccessibleQuestController } from './accessibility';
import {
  accessiblePolicySchema,
  type AccessiblePolicy,
} from '@deckforge/contracts';
import { WalletController } from './wallets';
import {
  ProgressionController,
  ProgressionService,
  startProgressWorker,
} from './progression';
import {
  progressionPolicySchema,
  type ProgressionPolicy,
} from '@deckforge/contracts';
import { FusionController } from './fusion';
import { fusionPolicySchema, type FusionPolicy } from '@deckforge/contracts';
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
import { attachAuthSocket, type SocketAdmissionPolicy } from './auth/socket';
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
  fusionPolicy: FusionPolicy | null = null,
  features: {
    progressionPolicy?: ProgressionPolicy;
    accessiblePolicy?: AccessiblePolicy;
    storefrontPolicy?: StorefrontPolicy;
    billing?: BillingConfig;
    tournamentPolicy?: TournamentPolicy;
    socketAdmissionPolicy?: SocketAdmissionPolicy;
    privacy?: PrivacyConfig;
    activity?: ActivityConfig;
    packPolicy?: PackPolicy;
    packOpening?: PackOpeningConfig;
  } = {},
) {
  const tournamentPolicy = features.tournamentPolicy
    ? tournamentPolicySchema.parse(features.tournamentPolicy)
    : null;
  if (tournamentPolicy && (!auth || !admissionPolicy))
    throw new Error(
      'Tournaments require identity and reviewed Classic admission',
    );
  const tournaments = auth
    ? new TournamentService(auth.database, tournamentPolicy, admissionPolicy)
    : null;
  let stopTournaments = async () => {};
  const privacy = auth
    ? new PrivacyService(auth, features.privacy ?? null)
    : null;
  let stopPrivacy = async () => {};
  const activity = auth
    ? new ActivityService(auth.database, features.activity ?? null)
    : null;
  let stopActivity = async () => {};
  const latency = new RequestLatency();
  const storefrontPolicy = features.storefrontPolicy
    ? storefrontPolicySchema.parse(features.storefrontPolicy)
    : null;
  if (features.billing && (!auth || !storefrontPolicy))
    throw new Error(
      'Billing requires configured identity and reviewed catalog',
    );
  const packCatalog = catalogDatabase
    ? new PackCatalogService(
        catalogDatabase,
        features.packPolicy ?? null,
        storefrontPolicy,
      )
    : null;
  const packOpenings = packCatalog
    ? new PackOpeningService(packCatalog, features.packOpening ?? null)
    : null;
  const billing =
    features.billing && auth && storefrontPolicy
      ? new BillingService(auth.database, features.billing, storefrontPolicy)
      : null;
  let stopBilling = async () => {};
  const accessiblePolicy = features.accessiblePolicy
    ? accessiblePolicySchema.parse(features.accessiblePolicy)
    : null;
  const progressionPolicy = features.progressionPolicy
    ? progressionPolicySchema.parse(features.progressionPolicy)
    : null;
  let stopProgress = async () => {};
  if (fusionPolicy) fusionPolicy = fusionPolicySchema.parse(fusionPolicy);
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
        ContentAdminController,
        SafetyController,
        OperationsController,
        PrivacyController,
        ActivityController,
        PackCatalogController,
        PackOpeningController,
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
        FusionController,
        ProgressionController,
        WalletController,
        AccessibleQuestController,
        StorefrontController,
        BillingController,
        PurchaseHistoryController,
        TournamentController,
      ],
      providers: [
        { provide: 'TOURNAMENT_SERVICE', useValue: tournaments },
        { provide: 'PRIVACY_SERVICE', useValue: privacy },
        { provide: 'ACTIVITY_SERVICE', useValue: activity },
        { provide: 'PACK_CATALOG', useValue: packCatalog },
        { provide: 'PACK_OPENINGS', useValue: packOpenings },
        { provide: 'REQUEST_LATENCY', useValue: latency },
        { provide: 'AUTH_SERVICE', useValue: auth },
        { provide: 'ADMISSION_POLICY', useValue: admissionPolicy },
        { provide: 'SPADES_POLICY', useValue: spadesPolicy },
        { provide: 'FUSION_POLICY', useValue: fusionPolicy },
        { provide: 'PROGRESSION_POLICY', useValue: progressionPolicy },
        { provide: 'ACCESSIBLE_POLICY', useValue: accessiblePolicy },
        { provide: 'STOREFRONT_POLICY', useValue: storefrontPolicy },
        { provide: 'BILLING_SERVICE', useValue: billing },
        {
          provide: 'BILLING_ENVIRONMENT',
          useValue: features.billing?.environment ?? 'PRODUCTION',
        },
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
              await stopActivity();
              await stopPrivacy();
              await stopTournaments();
              await stopBilling();
              await stopProgress();
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
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.use(
    (
      _req: unknown,
      res: import('express').Response,
      next: import('express').NextFunction,
    ) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; frame-ancestors 'none'",
      );
      next();
    },
  );
  app.use(
    (
      _req: unknown,
      res: import('express').Response,
      next: import('express').NextFunction,
    ) => {
      const start = process.hrtime.bigint();
      res.once('finish', () =>
        latency.observe(Number(process.hrtime.bigint() - start) / 1e6),
      );
      next();
    },
  );
  app.useBodyParser('json', { limit: '16kb' });
  app.useGlobalFilters(new SafeErrorFilter());
  stopSocket = await attachAuthSocket(
    app.getHttpServer(),
    auth,
    origins,
    gameRooms,
    features.socketAdmissionPolicy,
  );
  if (pokerRooms) stopTimeouts = startTimeoutWorker(pokerRooms);
  if (auth)
    stopSettlements = startSettlementWorker(
      new MatchSettlementService(auth.database, admissionPolicy),
    );
  if (auth && progressionPolicy)
    stopProgress = startProgressWorker(
      new ProgressionService(auth.database, progressionPolicy),
    );
  if (billing && features.billing?.workers !== false)
    stopBilling = startBillingWorker(billing);
  if (tournaments && tournamentPolicy?.workers)
    stopTournaments = startTournamentWorker(tournaments);
  if (activity && features.activity)
    stopActivity = startActivityWorker(activity);
  if (privacy && features.privacy) stopPrivacy = startPrivacyWorker(privacy);
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
