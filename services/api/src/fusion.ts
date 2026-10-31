import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { fusionRecipe } from '@deckforge/card-domain';
import {
  createCardWithOrigin,
  writeCardTransition,
  type Prisma,
  type PrismaClient,
} from '@deckforge/database';
import {
  fusionPolicySchema,
  fusionPolicyResponseSchema,
  fusionSelectionSchema,
  fusionConfirmSchema,
  fusionPreviewSchema,
  fusionReceiptSchema,
  fusionLineageSchema,
  type FusionPolicy,
  type FusionPreview,
} from '@deckforge/contracts';
import type { AuthService, Principal } from './auth/service';
import { ApiFailure } from './auth/errors';
import { hash, json, lockPrincipal } from './rooms/shared';

async function proposal(
  tx: Prisma.TransactionClient,
  ownerId: string,
  ids: string[],
  childId: string,
  policy: FusionPolicy,
) {
  await tx.$queryRaw`SELECT "id" FROM "CardInstance" WHERE "ownerId"=${ownerId}::uuid AND "id"=ANY(${ids}::uuid[]) ORDER BY "id" FOR UPDATE`;
  const cards = await tx.cardInstance.findMany({
    where: { ownerId, id: { in: ids } },
    orderBy: { id: 'asc' },
  });
  if (cards.length !== 5) throw new ApiFailure('SOURCES_UNAVAILABLE', 404);
  if (
    await tx.pressJob.count({
      where: {
        userId: ownerId,
        cardId: { in: ids },
        status: { in: ['ACTIVE', 'PAUSED', 'READY_TO_CLAIM'] },
      },
    })
  )
    throw new ApiFailure('CARD_RESERVED_FOR_PRESS', 409);
  let output;
  try {
    output = fusionRecipe(ownerId, cards, policy.eligibleSeries);
  } catch {
    throw new ApiFailure('INELIGIBLE_FUSION', 409);
  }
  const loadout = await tx.loadout.findUnique({
    where: { userId: ownerId },
    include: { cards: { where: { instanceId: { in: ids } } } },
  });
  const manager = await tx.collectionManager.findUnique({
    where: { userId: ownerId },
    include: {
      slots: { where: { instanceId: { in: ids } }, orderBy: { slot: 'asc' } },
    },
  });
  const favorites = await tx.cardFavorite.findMany({
    where: { userId: ownerId, instanceId: { in: ids }, favorite: true },
    orderBy: { instanceId: 'asc' },
  });
  return {
    policy,
    sources: cards.map((c) => ({
      id: c.id,
      stateVersion: c.stateVersion,
      level: c.level,
      faceId: c.faceId,
    })),
    child: { id: childId, ...output },
    effects: {
      loadout: loadout?.cards[0]
        ? {
            id: loadout.id,
            version: loadout.version,
            sourceId: loadout.cards[0].instanceId,
          }
        : null,
      manager: manager?.slots.length
        ? { version: manager.version, slots: manager.slots.map((s) => s.slot) }
        : null,
      favoriteSources: favorites.map((f) => f.instanceId),
    },
  };
}
async function applySelections(
  tx: Prisma.TransactionClient,
  ownerId: string,
  preview: FusionPreview,
) {
  const { child, effects } = preview;
  if (effects.loadout) {
    const l = effects.loadout;
    await tx.loadout.update({
      where: { id: l.id },
      data: { version: { increment: 1 } },
    });
    await tx.loadoutCard.updateMany({
      where: { loadoutId: l.id },
      data: { loadoutVersion: l.version + 1 },
    });
    await tx.loadoutCard.update({
      where: { loadoutId_faceId: { loadoutId: l.id, faceId: child.faceId } },
      data: { instanceId: child.id },
    });
  }
  if (effects.manager) {
    const m = effects.manager;
    await tx.collectionManagerSlot.deleteMany({
      where: { userId: ownerId, slot: { in: m.slots } },
    });
    await tx.collectionManager.update({
      where: { userId: ownerId },
      data: { version: { increment: 1 } },
    });
    await tx.collectionManagerSlot.updateMany({
      where: { userId: ownerId },
      data: { managerVersion: m.version + 1 },
    });
    await tx.collectionManagerSlot.create({
      data: {
        userId: ownerId,
        managerVersion: m.version + 1,
        slot: m.slots[0]!,
        instanceId: child.id,
      },
    });
  }
  if (effects.favoriteSources.length)
    await tx.cardFavorite.create({
      data: { userId: ownerId, instanceId: child.id, favorite: true },
    });
}
export class FusionService {
  constructor(
    readonly db: PrismaClient,
    readonly policy: FusionPolicy | null = null,
  ) {}
  async preview(p: Principal, body: unknown) {
    const parsed = fusionSelectionSchema.safeParse(body);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    if (!this.policy) throw new ApiFailure('FUSION_POLICY_NOT_CONFIGURED', 503);
    const policy = fusionPolicySchema.parse(this.policy);
    return this.db.$transaction(
      async (tx) => {
        await lockPrincipal(tx, p);
        const previewId = randomUUID(),
          childId = randomUUID();
        const ids = parsed.data.sourceIds.map((id) => id.toLowerCase()).sort();
        const data = await proposal(tx, p.userId, ids, childId, policy);
        const [clock] = await tx.$queryRaw<
          { expiresAt: Date }[]
        >`SELECT clock_timestamp() + interval '5 minutes' AS "expiresAt"`;
        const expiresAt = clock!.expiresAt;
        const previewHash = hash({
          ownerId: p.userId,
          previewId,
          expiresAt: expiresAt.toISOString(),
          ...data,
        });
        const result = fusionPreviewSchema.parse({
          previewId,
          previewHash,
          expiresAt: expiresAt.toISOString(),
          ...data,
        });
        await tx.fusionPreview.create({
          data: {
            id: previewId,
            ownerId: p.userId,
            childId,
            snapshot: json(result),
            fingerprint: previewHash,
            expiresAt,
          },
        });
        return result;
      },
      { timeout: 15000 },
    );
  }
  async confirm(p: Principal, body: unknown) {
    const parsed = fusionConfirmSchema.safeParse(body);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    const input = parsed.data;
    return this.db.$transaction(
      async (tx) => {
        await lockPrincipal(tx, p);
        const scope = {
          userId: p.userId,
          operation: 'FUSION_COMMIT',
          key: input.commandId,
        };
        const previous = await tx.operationRecord.findUnique({
          where: { userId_operation_key: scope },
        });
        if (previous) {
          if (previous.requestHash !== hash(input))
            throw new ApiFailure('IDEMPOTENCY_CONFLICT', 409);
          return fusionReceiptSchema.parse(previous.result);
        }
        const stored = await tx.fusionPreview.findUnique({
          where: { id: input.previewId },
          include: { job: true },
        });
        if (!stored || stored.ownerId !== p.userId)
          throw new ApiFailure('PREVIEW_UNAVAILABLE', 404);
        if (stored.fingerprint !== input.previewHash)
          throw new ApiFailure('PREVIEW_CHANGED', 409);
        let receipt;
        if (stored.job) receipt = fusionReceiptSchema.parse(stored.job.receipt);
        else {
          const preview = fusionPreviewSchema.parse(stored.snapshot);
          if (
            !this.policy ||
            hash(fusionPolicySchema.parse(this.policy)) !== hash(preview.policy)
          )
            throw new ApiFailure('FUSION_POLICY_CHANGED', 409);
          const [clock] = await tx.$queryRaw<
            { now: Date }[]
          >`SELECT clock_timestamp() AS now`;
          if (clock!.now >= stored.expiresAt)
            throw new ApiFailure('PREVIEW_EXPIRED', 409);
          const ids = preview.sources.map((s) => s.id);
          const current = await proposal(
            tx,
            p.userId,
            ids,
            preview.child.id,
            preview.policy,
          );
          const fingerprint = hash({
            ownerId: p.userId,
            previewId: preview.previewId,
            expiresAt: preview.expiresAt,
            ...current,
          });
          if (fingerprint !== stored.fingerprint)
            throw new ApiFailure('STALE_FUSION_PREVIEW', 409);
          const jobId = randomUUID();
          for (const source of preview.sources)
            await writeCardTransition(tx, {
              instanceId: source.id,
              ownerId: p.userId,
              expectedVersion: source.stateVersion,
              command: { action: 'FUSION_CONSUME' },
              actorUserId: p.userId,
              operatorId: 'fusion',
              sourceKey: `fusion:${jobId}:consume:${source.id}`,
              reason: 'Confirmed five-card fusion',
            });
          await createCardWithOrigin(
            tx,
            { ...preview.child, ownerId: p.userId },
            {
              actorUserId: p.userId,
              operatorId: 'fusion',
              sourceKey: `fusion:${jobId}:child`,
              reason: 'Confirmed five-card fusion',
              action: 'FUSION_CREATE',
            },
          );
          await applySelections(tx, p.userId, preview);
          receipt = fusionReceiptSchema.parse({
            jobId,
            previewId: preview.previewId,
            previewHash: preview.previewHash,
            child: preview.child,
            consumed: ids,
            effects: preview.effects,
          });
          await tx.fusionJob.create({
            data: {
              id: jobId,
              previewId: preview.previewId,
              ownerId: p.userId,
              childId: preview.child.id,
              receipt: json(receipt),
            },
          });
          await tx.fusionIngredient.createMany({
            data: preview.sources.map((s) => ({
              parentId: s.id,
              jobId,
              expectedVersion: s.stateVersion,
            })),
          });
        }
        await tx.operationRecord.create({
          data: { ...scope, requestHash: hash(input), result: json(receipt) },
        });
        return receipt;
      },
      { maxWait: 15000, timeout: 15000 },
    );
  }
  async lineage(p: Principal, id: string) {
    if (!z.uuid().safeParse(id).success)
      throw new ApiFailure('INVALID_REQUEST', 400);
    return this.db.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      const card = await tx.cardInstance.findUnique({
        where: { id },
        include: {
          fusionChild: { include: { ingredients: true } },
          fusionIngredient: { include: { job: true } },
        },
      });
      if (!card || card.ownerId !== p.userId)
        throw new ApiFailure('CARD_NOT_FOUND', 404);
      return fusionLineageSchema.parse({
        instanceId: id,
        parents:
          card.fusionChild?.ingredients.map((i) => i.parentId).sort() ?? [],
        children: card.fusionIngredient
          ? [card.fusionIngredient.job.childId]
          : [],
      });
    });
  }
}
@Controller('v1/fusion')
export class FusionController {
  constructor(
    @Inject('AUTH_SERVICE') readonly auth: AuthService | null,
    @Inject('FUSION_POLICY') readonly policy: FusionPolicy | null,
  ) {}
  private async context(req: Request) {
    if (!this.auth) throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    return {
      p: await this.auth.authenticate(req.headers.authorization),
      service: new FusionService(this.auth.database, this.policy),
    };
  }
  @Get('policy') async configuration(@Req() req: Request) {
    await this.context(req);
    return fusionPolicyResponseSchema.parse({ policy: this.policy });
  }
  @Post('preview') @HttpCode(200) async preview(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const { p, service } = await this.context(req);
    const start = Date.now();
    const result = await service.preview(p, body);
    console.info(
      JSON.stringify({
        event: 'fusion.preview',
        durationMs: Date.now() - start,
      }),
    );
    return result;
  }
  @Post('confirm') @HttpCode(200) async confirm(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const { p, service } = await this.context(req);
    const start = Date.now();
    const result = await service.confirm(p, body);
    console.info(
      JSON.stringify({
        event: 'fusion.confirm',
        durationMs: Date.now() - start,
      }),
    );
    return result;
  }
  @Get('lineage/:id') async lineage(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    const { p, service } = await this.context(req);
    return service.lineage(p, id);
  }
}
