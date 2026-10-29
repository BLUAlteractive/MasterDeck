import { randomUUID, createHash } from 'node:crypto';
import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Prisma } from '@deckforge/database';
import {
  starterGrantCommandSchema,
  starterGrantResponseSchema,
} from '@deckforge/contracts';
import { ApiFailure } from './auth/errors';
import { AuthService, type Principal } from './auth/service';
import { readCatalogManifest } from './catalog';

/** Per-process defense in addition to the global HTTP limiter and permanent DB uniqueness. */
export class StarterLimiter {
  private readonly buckets = new Map<
    string,
    { started: number; count: number }
  >();
  constructor(private readonly now = Date.now) {}
  take(userId: string) {
    const now = this.now();
    for (const [key, bucket] of this.buckets)
      if (now - bucket.started >= 60_000) this.buckets.delete(key);
    let bucket = this.buckets.get(userId);
    if (!bucket) {
      if (this.buckets.size >= 10_000)
        throw new ApiFailure('RATE_LIMITED', 429);
      bucket = { started: now, count: 0 };
      this.buckets.set(userId, bucket);
    }
    if (++bucket.count > 20) throw new ApiFailure('RATE_LIMITED', 429);
  }
}

export class StarterService {
  readonly limiter = new StarterLimiter();
  constructor(private readonly auth: AuthService) {}
  async grantStarterDeck(
    principal: Principal,
    input: { seriesId: string; idempotencyKey: string },
  ) {
    const parsed = starterGrantCommandSchema.safeParse(input);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    this.limiter.take(principal.userId);
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ seriesId: input.seriesId }))
      .digest('hex');
    const started = Date.now();
    const outcome = await this.auth.database.$transaction(
      async (tx) => {
        // Same lock order as guest linking and deletion: user first, then session.
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${principal.userId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "AuthSession" WHERE "id" = ${principal.sessionId}::uuid FOR SHARE`;
        const user = await tx.user.findUnique({
          where: { id: principal.userId },
        });
        const session = await tx.authSession.findUnique({
          where: { id: principal.sessionId },
          include: { identity: true },
        });
        if (
          !user ||
          user.status !== 'ACTIVE' ||
          !session ||
          session.revokedAt ||
          session.identity.userId !== user.id ||
          session.identityId !== principal.identityId ||
          (!user.isGuest && principal.claims.is_anonymous) ||
          principal.claims.exp <= Math.floor(Date.now() / 1000)
        )
          throw new ApiFailure('UNAUTHORIZED', 401);
        const previous = await tx.operationRecord.findUnique({
          where: {
            userId_operation_key: {
              userId: user.id,
              operation: 'cards.starter',
              key: input.idempotencyKey,
            },
          },
        });
        if (previous) {
          if (previous.requestHash !== requestHash)
            throw new ApiFailure('IDEMPOTENCY_CONFLICT', 409);
          return {
            result: starterGrantResponseSchema.parse(previous.result),
            replay: true,
          };
        }
        const granted = await tx.starterGrant.findUnique({
          where: { userId: user.id },
        });
        if (granted) {
          if (granted.seriesId !== input.seriesId)
            throw new ApiFailure('STARTER_ALREADY_GRANTED', 409);
          return {
            result: starterGrantResponseSchema.parse(granted.result),
            replay: true,
          };
        }
        // Lock publication/rights while validating and minting; never grant a draft preview.
        await tx.$queryRaw`SELECT "id" FROM "CardSeries" WHERE "id" = ${input.seriesId}::uuid FOR SHARE`;
        const series = await tx.cardSeries.findUnique({
          where: { id: input.seriesId },
        });
        if (!series || series.status !== 'PUBLISHED' || !series.starterEligible)
          throw new ApiFailure('STARTER_UNAVAILABLE', 409);
        await tx.$queryRaw`SELECT a."id" FROM "DesignAsset" a WHERE a."id" IN (
        SELECT "frontAssetId" FROM "CardTemplate" WHERE "seriesId" = ${series.id}::uuid AND "version" = ${series.manifestVersion}
        UNION SELECT "backAssetId" FROM "CardTemplate" WHERE "seriesId" = ${series.id}::uuid AND "version" = ${series.manifestVersion}
      ) ORDER BY a."id" FOR SHARE`;
        const { templates } = await readCatalogManifest(tx, series);
        if (
          templates.some((template) => template.rarity !== 'COMMON') ||
          new Set(templates.map((template) => template.playStyleFamily))
            .size !== 1
        )
          throw new ApiFailure('STARTER_UNAVAILABLE', 409);
        const grantId = randomUUID();
        const cards = templates.map((template) => ({
          instanceId: randomUUID(),
          faceId: template.faceId,
          level: 1,
          branch: 'BLUE' as const,
          rarity: 'COMMON' as const,
          stateVersion: 1,
        }));
        const result = starterGrantResponseSchema.parse({
          grantId,
          seriesId: series.id,
          manifestVersion: series.manifestVersion,
          cards,
        });
        await tx.starterGrant.create({
          data: {
            id: grantId,
            userId: user.id,
            seriesId: series.id,
            manifestVersion: series.manifestVersion,
            result,
          },
        });
        const origins = cards.map(() => randomUUID());
        await tx.cardInstance.createMany({
          data: cards.map((card, index) => ({
            id: card.instanceId,
            ownerId: user.id,
            templateId: templates[index]!.id,
            seriesId: series.id,
            faceId: card.faceId,
            level: 1,
            branch: 'BLUE',
            rarity: 'COMMON',
            status: 'OWNED',
            stateVersion: 1,
            starterGrantId: grantId,
            originEventId: origins[index]!,
          })),
        });
        await tx.ownershipEvent.createMany({
          data: cards.map((card, index) => ({
            id: origins[index]!,
            operatorId: 'inventory.starter',
            instanceId: card.instanceId,
            actorUserId: user.id,
            action: 'GRANT',
            sourceKey: `starter:${grantId}:${card.faceId}`,
            reason: 'STARTER_DECK',
            stateVersion: 1,
            snapshot: {
              ownerId: user.id,
              status: 'OWNED',
              lockToken: null,
              lockReason: null,
              grantId,
              seriesId: series.id,
              ...card,
            },
          })),
        });
        await tx.operationRecord.create({
          data: {
            userId: user.id,
            operation: 'cards.starter',
            key: input.idempotencyKey,
            requestHash,
            result,
          },
        });
        return { result, replay: false };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 15_000,
        timeout: 15_000,
      },
    );
    console.info(
      JSON.stringify({
        event: 'inventory.starter',
        status: outcome.replay ? 'replayed' : 'granted',
        durationMs: Date.now() - started,
        count: 52,
      }),
    );
    return outcome.result;
  }
}

@Controller('v1/cards')
export class StarterController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly auth: AuthService | null,
    @Inject('STARTER_SERVICE') private readonly starter: StarterService | null,
  ) {}
  @Post('starter')
  @HttpCode(200)
  async grant(@Req() req: Request, @Body() body: unknown) {
    if (!this.auth || !this.starter)
      throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    const input = starterGrantCommandSchema.safeParse(body);
    if (!input.success) throw new ApiFailure('INVALID_REQUEST', 400);
    return this.starter.grantStarterDeck(
      await this.auth.authenticate(req.headers.authorization),
      input.data,
    );
  }
}
