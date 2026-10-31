import { randomBytes, randomUUID, createHash } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { createCardWithOrigin } from '@deckforge/database';
import { rewardPoolTotal, rewardPoolIndex } from '@deckforge/card-domain';
import {
  packCancelResultSchema,
  pendingPackSchema,
  packHistoryQuerySchema,
  packHistorySchema,
  packOpenSchema,
  packDefinitionSchema,
  packOpeningSchema,
  supplyViewSchema,
  type PackOpeningReceipt,
} from '@deckforge/contracts';
import type { AuthService, Principal } from '../auth/service';
import { ApiFailure } from '../auth/errors';
import { hash, json, lockPrincipal } from '../rooms/shared';
import { moveRestrictedCurrency } from '../wallets';
import { sealBilling, openBilling } from '../billing/vault';
import { PackCatalogService, validatePackContents } from './catalog';
import { packDraws } from './rng';
import { changeTrailInk } from './supplies';
export type PackOpeningConfig = {
  approvalReference: string;
  encryptionKey: Buffer;
  keyVersion: string;
  regionResolver?: (userId: string) => Promise<string | null>;
};
export class PackOpeningService {
  constructor(
    readonly catalog: PackCatalogService,
    readonly config: PackOpeningConfig | null = null,
  ) {
    if (
      config &&
      (config.encryptionKey.length !== 32 ||
        config.approvalReference.length < 8 ||
        !config.keyVersion)
    )
      throw new Error('REVIEWED_PACK_RNG_CONFIG_REQUIRED');
  }
  async open(p: Principal, packId: string, body: unknown) {
    const parsed = packOpenSchema.safeParse(body);
    if (!z.uuid().safeParse(packId).success || !parsed.success)
      throw new ApiFailure('INVALID_REQUEST', 400);
    const input = parsed.data,
      digest = hash({ packId, ...input });
    // Recover committed results before calling an optional external region provider.
    const prior = await this.catalog.db.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      return tx.packOpening.findUnique({
        where: {
          userId_commandId: { userId: p.userId, commandId: input.commandId },
        },
      });
    });
    if (prior) {
      if (prior.requestHash !== digest)
        throw new ApiFailure('IDEMPOTENCY_CONFLICT', 409);
      return packOpeningSchema.parse(prior.result);
    }
    const offer = await this.catalog.db.packDefinition.findUnique({
      where: { id: packId },
    });
    const needsRegion =
      offer && packDefinitionSchema.parse(offer.definition).regions.length > 0;
    const region =
      needsRegion && this.config?.regionResolver
        ? await this.config.regionResolver(p.userId)
        : null;
    const receipt = await this.catalog.db.$transaction(
      async (tx) => {
        await lockPrincipal(tx, p);
        const old = await tx.packOpening.findUnique({
          where: {
            userId_commandId: { userId: p.userId, commandId: input.commandId },
          },
        });
        if (old) {
          if (old.requestHash !== digest)
            throw new ApiFailure('IDEMPOTENCY_CONFLICT', 409);
          return packOpeningSchema.parse(old.result);
        }
        if (
          await tx.operationRecord.findUnique({
            where: {
              userId_operation_key: {
                userId: p.userId,
                operation: 'PACK_CANCEL',
                key: input.commandId,
              },
            },
          })
        )
          throw new ApiFailure('PACK_OPENING_CANCELLED', 409);
        if (
          !this.config ||
          !this.catalog.policy ||
          !this.catalog.policy.allowedPackIds.includes(packId)
        )
          throw new ApiFailure('PACK_OPENING_NOT_CONFIGURED', 503);
        if (
          (await tx.user.findUniqueOrThrow({ where: { id: p.userId } })).isGuest
        )
          throw new ApiFailure('PERMANENT_ACCOUNT_REQUIRED', 403);
        await tx.$queryRaw`SELECT id FROM "PackDefinition" WHERE id=${packId}::uuid FOR SHARE`;
        const pack = await tx.packDefinition.findUnique({
          where: { id: packId },
        });
        if (!pack || pack.status !== 'PUBLISHED')
          throw new ApiFailure('PACK_UNAVAILABLE', 404);
        const definition = packDefinitionSchema.parse(pack.definition);
        if (hash(definition) !== pack.definitionHash)
          throw new Error('PACK_INTEGRITY');
        if (input.expectedDefinitionHash !== pack.definitionHash)
          throw new ApiFailure('PACK_OFFER_CHANGED', 409);
        if (definition.kind !== 'DISCOVERY')
          throw new ApiFailure('FIXED_PACK_REQUIRES_VERIFIED_BILLING', 422);
        if (
          definition.regions.length &&
          (!region || !definition.regions.includes(region))
        )
          throw new ApiFailure('PACK_REGION_UNVERIFIED', 403);
        await tx.packStock.upsert({
          where: { packId },
          create: { packId },
          update: {},
        });
        await tx.$queryRaw`SELECT "packId" FROM "PackStock" WHERE "packId"=${packId}::uuid FOR UPDATE`;
        const stock = await tx.packStock.findUniqueOrThrow({
            where: { packId },
          }),
          [clock] = await tx.$queryRaw<
            { now: Date }[]
          >`SELECT clock_timestamp() AS now`;
        if (
          clock!.now < new Date(definition.startsAt) ||
          clock!.now >= new Date(definition.endsAt) ||
          (definition.stockLimit !== null &&
            stock.issued >= definition.stockLimit)
        )
          throw new ApiFailure('PACK_UNAVAILABLE', 409);
        await validatePackContents(tx, definition, this.catalog.storefront);
        const id = randomUUID(),
          seed = randomBytes(32),
          seedCommitment = createHash('sha256').update(seed).digest('hex'),
          draws = packDraws(
            seed,
            rewardPoolTotal(definition.pool),
            definition.drawCount,
          ),
          outcomes: PackOpeningReceipt['outcomes'] = [];
        const transfer = await moveRestrictedCurrency(tx, {
          userId: p.userId,
          currency: 'TRAIL_CREDITS',
          purpose: 'BUY_EARNED_PACK',
          amount: BigInt(definition.price),
          sourceKey: 'pack:' + id + ':debit',
          operatorId: 'system.earned-pack',
          proofReference: pack.definitionHash,
          policyVersion: this.catalog.policy.version,
        });
        let ink = 0;
        for (const [index, draw] of draws.entries()) {
          const reward =
            definition.pool[rewardPoolIndex(definition.pool, draw)]!.reward;
          if (reward.kind === 'TRAIL_INK') {
            ink += reward.units;
            outcomes.push({ kind: 'TRAIL_INK', units: reward.units });
            continue;
          }
          const template = await tx.cardTemplate.findUniqueOrThrow({
            where: { id: reward.templateId },
          });
          const card = await createCardWithOrigin(
            tx,
            {
              ownerId: p.userId,
              templateId: template.id,
              seriesId: template.seriesId,
              faceId: template.faceId,
              branch: reward.branch,
              level: reward.branch === 'BLUE' ? 1 : 2,
              rarity: template.rarity,
            },
            {
              operatorId: 'system.earned-pack',
              actorUserId: p.userId,
              sourceKey: 'pack:' + id + ':card:' + index,
              reason: 'EARNED_PACK',
            },
          );
          outcomes.push({
            kind: 'CARD',
            instanceId: card.id,
            templateId: template.id,
            faceId: card.faceId,
            branch: card.branch,
            level: card.level,
            rarity: card.rarity,
          });
        }
        if (ink)
          await changeTrailInk(tx, {
            userId: p.userId,
            delta: ink,
            sourceKey: 'pack:' + id + ':ink',
            reason: 'PACK_OPEN',
          });
        const result = packOpeningSchema.parse({
          openingId: id,
          packId,
          definitionHash: pack.definitionHash,
          currency: 'TRAIL_CREDITS',
          charged: String(definition.price),
          rngVersion: 'HMAC_SHA256_V1',
          seedCommitment,
          outcomes,
        });
        await tx.packOpening.create({
          data: {
            id,
            packId,
            userId: p.userId,
            commandId: input.commandId,
            requestHash: digest,
            definitionHash: pack.definitionHash,
            snapshot: json(definition),
            result: json(result),
            draws: json(draws),
            rngBox: sealBilling(
              { seed: seed.toString('hex') },
              this.config.encryptionKey,
              'deckforge.pack.v1:' + id,
            ),
            rngKeyVersion: this.config.keyVersion,
            transferId: transfer.transferId,
            createdAt: clock!.now,
          },
        });
        await tx.packStock.update({
          where: { packId },
          data: { issued: { increment: 1 }, version: { increment: 1 } },
        });
        return result;
      },
      { timeout: 30000 },
    );
    console.info(JSON.stringify({ event: 'pack.open', status: 'recorded' }));
    return receipt;
  }
  async receipt(p: Principal, id: string) {
    if (!z.uuid().safeParse(id).success)
      throw new ApiFailure('INVALID_REQUEST', 400);
    return this.catalog.db.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      const row = await tx.packOpening.findUnique({ where: { id } });
      if (!row || row.userId !== p.userId)
        throw new ApiFailure('OPENING_UNAVAILABLE', 404);
      return packOpeningSchema.parse(row.result);
    });
  }
  async cancel(p: Principal, body: unknown) {
    const parsed = pendingPackSchema.safeParse(body);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    const { packId, command } = parsed.data,
      digest = hash({ packId, ...command });
    return this.catalog.db.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      const old = await tx.packOpening.findUnique({
        where: {
          userId_commandId: { userId: p.userId, commandId: command.commandId },
        },
      });
      if (old) {
        if (old.requestHash !== digest)
          throw new ApiFailure('IDEMPOTENCY_CONFLICT', 409);
        return packCancelResultSchema.parse({
          status: 'COMMITTED',
          receipt: packOpeningSchema.parse(old.result),
        });
      }
      const key = {
          userId: p.userId,
          operation: 'PACK_CANCEL',
          key: command.commandId,
        },
        prior = await tx.operationRecord.findUnique({
          where: { userId_operation_key: key },
        });
      if (prior) {
        if (prior.requestHash !== digest)
          throw new ApiFailure('IDEMPOTENCY_CONFLICT', 409);
        return packCancelResultSchema.parse(prior.result);
      }
      const result = packCancelResultSchema.parse({
        status: 'CANCELLED',
        commandId: command.commandId,
      });
      await tx.operationRecord.create({
        data: { ...key, requestHash: digest, result: json(result) },
      });
      return result;
    });
  }
  async history(p: Principal, query: unknown) {
    const parsed = packHistoryQuerySchema.safeParse(query);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    const input = parsed.data;
    return this.catalog.db.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      if (input.cursor) {
        const cursor = await tx.packOpening.findUnique({
          where: { id: input.cursor },
        });
        if (!cursor || cursor.userId !== p.userId)
          throw new ApiFailure('OPENING_UNAVAILABLE', 404);
      }
      const rows = await tx.packOpening.findMany({
        where: { userId: p.userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: { id: true, result: true, createdAt: true },
      });
      const page = rows.slice(0, input.limit);
      return packHistorySchema.parse({
        items: page.map((r) => ({
          openedAt: r.createdAt.toISOString(),
          receipt: packOpeningSchema.parse(r.result),
        })),
        nextCursor: rows.length > input.limit ? page.at(-1)!.id : null,
      });
    });
  }
  async supplies(p: Principal) {
    return this.catalog.db.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      const row = await tx.supplyBalance.findUnique({
        where: { userId_kind: { userId: p.userId, kind: 'TRAIL_INK' } },
      });
      return supplyViewSchema.parse({
        trailInk: String(row?.units ?? 0),
        transferable: false,
        purchasable: false,
      });
    });
  }
  /** Trusted internal replay, never expose seed/ciphertext in a player or support payload. */
  async audit(id: string) {
    const row = await this.catalog.db.packOpening.findUniqueOrThrow({
      where: { id },
    });
    if (!this.config || this.config.keyVersion !== row.rngKeyVersion)
      throw new Error('PACK_RNG_KEY_UNAVAILABLE');
    const { seed } = z
      .object({ seed: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict()
      .parse(
        openBilling(
          row.rngBox,
          this.config.encryptionKey,
          'deckforge.pack.v1:' + id,
        ),
      );
    const definition = packDefinitionSchema.parse(row.snapshot),
      result = packOpeningSchema.parse(row.result);
    if (
      definition.kind !== 'DISCOVERY' ||
      hash(definition) !== row.definitionHash ||
      createHash('sha256').update(Buffer.from(seed, 'hex')).digest('hex') !==
        result.seedCommitment
    )
      throw new Error('PACK_INTEGRITY');
    const draws = packDraws(
      Buffer.from(seed, 'hex'),
      rewardPoolTotal(definition.pool),
      definition.drawCount,
    );
    if (
      hash(draws) !== hash(row.draws) ||
      result.outcomes.length !== draws.length
    )
      throw new Error('PACK_INTEGRITY');
    for (const [i, draw] of draws.entries()) {
      const expected =
          definition.pool[rewardPoolIndex(definition.pool, draw)]!.reward,
        actual = result.outcomes[i]!;
      if (expected.kind !== actual.kind) throw new Error('PACK_INTEGRITY');
      if (
        expected.kind === 'TRAIL_INK' &&
        actual.kind === 'TRAIL_INK' &&
        expected.units !== actual.units
      )
        throw new Error('PACK_INTEGRITY');
      if (
        expected.kind === 'CARD' &&
        actual.kind === 'CARD' &&
        (expected.templateId !== actual.templateId ||
          expected.branch !== actual.branch)
      )
        throw new Error('PACK_INTEGRITY');
    }
    return { valid: true as const, drawCount: draws.length };
  }
}
@Controller('v1/packs')
export class PackOpeningController {
  constructor(
    @Inject('AUTH_SERVICE') readonly auth: AuthService | null,
    @Inject('PACK_OPENINGS') readonly service: PackOpeningService | null,
  ) {}
  private enabled() {
    if (!this.auth || !this.service)
      throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    return { auth: this.auth, service: this.service };
  }
  @Post(':packId/open') @HttpCode(200) async open(
    @Req() r: Request,
    @Param('packId') id: string,
    @Body() b: unknown,
  ) {
    const s = this.enabled();
    return s.service.open(
      await s.auth.authenticate(r.headers.authorization),
      id,
      b,
    );
  }
  @Post('cancel') @HttpCode(200) async cancel(
    @Req() r: Request,
    @Body() body: unknown,
  ) {
    const s = this.enabled();
    return s.service.cancel(
      await s.auth.authenticate(r.headers.authorization),
      body,
    );
  }
  @Get('openings') async history(@Req() r: Request, @Query() query: unknown) {
    const s = this.enabled();
    return s.service.history(
      await s.auth.authenticate(r.headers.authorization),
      query,
    );
  }
  @Get('openings/:id') async receipt(
    @Req() r: Request,
    @Param('id') id: string,
  ) {
    const s = this.enabled();
    return s.service.receipt(
      await s.auth.authenticate(r.headers.authorization),
      id,
    );
  }
  @Get('supplies') async supplies(@Req() r: Request) {
    const s = this.enabled();
    return s.service.supplies(
      await s.auth.authenticate(r.headers.authorization),
    );
  }
}
