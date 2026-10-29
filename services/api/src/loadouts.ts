import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  validateLoadout,
  validateManagerSelection,
} from '@deckforge/card-domain';
import {
  emptyCommandSchema,
  loadoutCommandSchema,
  loadoutSavedSchema,
  currentLoadoutSchema,
  managerCommandSchema,
  managerSavedSchema,
  managerViewSchema,
} from '@deckforge/contracts';
import type { Prisma } from '@deckforge/database';
import type { AuthService, Principal } from './auth/service';
import { ApiFailure } from './auth/errors';
async function active(
  tx: Prisma.TransactionClient,
  principal: Principal,
  write: boolean,
) {
  if (write)
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${principal.userId}::uuid FOR UPDATE`;
  else
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${principal.userId}::uuid FOR SHARE`;
  await tx.$queryRaw`SELECT "id" FROM "AuthSession" WHERE "id"=${principal.sessionId}::uuid FOR SHARE`;
  const user = await tx.user.findUnique({ where: { id: principal.userId } });
  const session = await tx.authSession.findUnique({
    where: { id: principal.sessionId },
  });
  if (
    !user ||
    user.status !== 'ACTIVE' ||
    !session ||
    session.revokedAt ||
    session.identityId !== principal.identityId ||
    (!user.isGuest && principal.claims.is_anonymous) ||
    principal.claims.exp <= Math.floor(Date.now() / 1000)
  )
    throw new ApiFailure('UNAUTHORIZED', 401);
}
async function selectedCards(
  tx: Prisma.TransactionClient,
  userId: string,
  ids: string[],
) {
  // Parameterized UUID array; fixed ordering agrees with inventory multi-card lock discipline.
  await tx.$queryRaw`SELECT "id" FROM "CardInstance" WHERE "ownerId"=${userId}::uuid AND "id"=ANY(${ids}::uuid[]) ORDER BY "id" FOR SHARE`;
  return tx.cardInstance.findMany({
    where: { ownerId: userId, id: { in: ids } },
    select: { id: true, ownerId: true, faceId: true, status: true },
  });
}
function mapping(rows: { faceId: string; instanceId: string }[]) {
  return Object.fromEntries(rows.map((row) => [row.faceId, row.instanceId]));
}
function log(event: string, started: number, status = 'ok') {
  console.info(
    JSON.stringify({ event, status, durationMs: Date.now() - started }),
  );
}

@Controller('v1')
export class LoadoutController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly auth: AuthService | null,
  ) {}
  private service() {
    if (!this.auth) throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    return this.auth;
  }
  @Get('loadouts/current')
  async current(@Req() req: Request, @Query() query: unknown) {
    if (!emptyCommandSchema.safeParse(query).success)
      throw new ApiFailure('INVALID_REQUEST', 400);
    const auth = this.service();
    const principal = await auth.authenticate(req.headers.authorization);
    const started = Date.now();
    const result = await auth.database.$transaction(async (tx) => {
      await active(tx, principal, false);
      const loadout = await tx.loadout.findUnique({
        where: { userId: principal.userId },
        include: { cards: { orderBy: { faceId: 'asc' } } },
      });
      if (!loadout) return { loadout: null };
      const cards = await selectedCards(
        tx,
        principal.userId,
        loadout.cards.map((row) => row.instanceId),
      );
      const faceToInstanceIds = mapping(loadout.cards);
      return {
        loadout: {
          id: loadout.id,
          version: loadout.version,
          faceToInstanceIds,
          validation: validateLoadout(
            principal.userId,
            faceToInstanceIds,
            cards,
          ),
        },
      };
    });
    log('collection.loadout.read', started);
    return currentLoadoutSchema.parse(result);
  }
  @Put('loadouts/:loadoutId')
  @HttpCode(200)
  async save(
    @Req() req: Request,
    @Param('loadoutId') loadoutId: string,
    @Body() body: unknown,
  ) {
    const auth = this.service();
    const input = loadoutCommandSchema.safeParse(body);
    if (!z.uuid().safeParse(loadoutId).success || !input.success)
      throw new ApiFailure('INVALID_REQUEST', 400);
    loadoutId = loadoutId.toLowerCase();
    const principal = await auth.authenticate(req.headers.authorization);
    const started = Date.now();
    const { expectedVersion, idempotencyKey } = input.data;
    const faceToInstanceIds = Object.fromEntries(
      Object.entries(input.data.faceToInstanceIds).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
    );
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ loadoutId, expectedVersion, faceToInstanceIds }))
      .digest('hex');
    const result = await auth.database.$transaction(
      async (tx) => {
        await active(tx, principal, true);
        const scope = {
          userId: principal.userId,
          operation: 'collection.loadout',
          key: idempotencyKey,
        };
        const prior = await tx.operationRecord.findUnique({
          where: { userId_operation_key: scope },
        });
        if (prior) {
          if (prior.requestHash !== requestHash)
            throw new ApiFailure('IDEMPOTENCY_CONFLICT', 409);
          return loadoutSavedSchema.parse(prior.result);
        }
        const existing = await tx.loadout.findUnique({
          where: { id: loadoutId },
        });
        if (existing && existing.userId !== principal.userId)
          throw new ApiFailure('LOADOUT_NOT_FOUND', 404);
        const primary = await tx.loadout.findUnique({
          where: { userId: principal.userId },
        });
        if (primary && primary.id !== loadoutId)
          throw new ApiFailure('LOADOUT_ALREADY_EXISTS', 409);
        if ((existing?.version ?? 0) !== expectedVersion)
          throw new ApiFailure('STALE_SELECTION', 409);
        const cards = await selectedCards(
          tx,
          principal.userId,
          Object.values(faceToInstanceIds),
        );
        if (!validateLoadout(principal.userId, faceToInstanceIds, cards).valid)
          throw new ApiFailure('INVALID_LOADOUT', 409);
        const version = expectedVersion + 1;
        if (existing) {
          await tx.loadoutCard.deleteMany({ where: { loadoutId } });
          await tx.loadout.update({
            where: { id: loadoutId },
            data: { version },
          });
        } else
          await tx.loadout.create({
            data: { id: loadoutId, userId: principal.userId, version },
          });
        await tx.loadoutCard.createMany({
          data: Object.entries(faceToInstanceIds).map(
            ([faceId, instanceId]) => ({
              loadoutId,
              userId: principal.userId,
              loadoutVersion: version,
              faceId,
              instanceId,
            }),
          ),
        });
        const result = loadoutSavedSchema.parse({
          id: loadoutId,
          version,
          faceToInstanceIds,
        });
        await tx.operationRecord.create({
          data: { ...scope, requestHash, result },
        });
        return result;
      },
      { isolationLevel: 'ReadCommitted', maxWait: 15000, timeout: 15000 },
    );
    log('collection.loadout.save', started);
    return result;
  }
  @Get('collection/manager')
  async manager(@Req() req: Request, @Query() query: unknown) {
    if (!emptyCommandSchema.safeParse(query).success)
      throw new ApiFailure('INVALID_REQUEST', 400);
    const auth = this.service();
    const principal = await auth.authenticate(req.headers.authorization);
    const started = Date.now();
    const result = await auth.database.$transaction(async (tx) => {
      await active(tx, principal, false);
      const manager = await tx.collectionManager.findUnique({
        where: { userId: principal.userId },
        include: { slots: { orderBy: { slot: 'asc' } } },
      });
      const cards = await selectedCards(
        tx,
        principal.userId,
        manager?.slots.map((slot) => slot.instanceId) ?? [],
      );
      const statuses = new Map(cards.map((card) => [card.id, card.status]));
      const slots = (manager?.slots ?? []).map((row) => {
        const status = statuses.get(row.instanceId)!;
        return {
          slot: row.slot,
          instanceId: row.instanceId,
          status,
          active: status === 'OWNED' || status === 'LOCKED',
        };
      });
      const activeInventoryCount = await tx.cardInstance.count({
        where: {
          ownerId: principal.userId,
          status: { in: ['OWNED', 'LOCKED'] },
        },
      });
      return {
        version: manager?.version ?? 0,
        maxSlots: 100 as const,
        slots,
        activeInventoryCount,
        unmanagedCount:
          activeInventoryCount - slots.filter((slot) => slot.active).length,
      };
    });
    log('collection.manager.read', started);
    return managerViewSchema.parse(result);
  }
  @Put('collection/manager')
  @HttpCode(200)
  async saveManager(@Req() req: Request, @Body() body: unknown) {
    const auth = this.service();
    const input = managerCommandSchema.safeParse(body);
    if (!input.success) throw new ApiFailure('INVALID_REQUEST', 400);
    const principal = await auth.authenticate(req.headers.authorization);
    const started = Date.now();
    const { expectedVersion, idempotencyKey } = input.data;
    const slots = [...input.data.slots].sort((a, b) => a.slot - b.slot);
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ expectedVersion, slots }))
      .digest('hex');
    const result = await auth.database.$transaction(
      async (tx) => {
        await active(tx, principal, true);
        const scope = {
          userId: principal.userId,
          operation: 'collection.manager',
          key: idempotencyKey,
        };
        const prior = await tx.operationRecord.findUnique({
          where: { userId_operation_key: scope },
        });
        if (prior) {
          if (prior.requestHash !== requestHash)
            throw new ApiFailure('IDEMPOTENCY_CONFLICT', 409);
          return managerSavedSchema.parse(prior.result);
        }
        const manager = await tx.collectionManager.findUnique({
          where: { userId: principal.userId },
        });
        if ((manager?.version ?? 0) !== expectedVersion)
          throw new ApiFailure('STALE_SELECTION', 409);
        const cards = await selectedCards(
          tx,
          principal.userId,
          slots.map((slot) => slot.instanceId),
        );
        if (!validateManagerSelection(principal.userId, slots, cards))
          throw new ApiFailure('INVALID_MANAGER_SELECTION', 409);
        const version = expectedVersion + 1;
        if (manager) {
          await tx.collectionManagerSlot.deleteMany({
            where: { userId: principal.userId },
          });
          await tx.collectionManager.update({
            where: { userId: principal.userId },
            data: { version },
          });
        } else
          await tx.collectionManager.create({
            data: { userId: principal.userId, version },
          });
        if (slots.length)
          await tx.collectionManagerSlot.createMany({
            data: slots.map((slot) => ({
              ...slot,
              userId: principal.userId,
              managerVersion: version,
            })),
          });
        const result = managerSavedSchema.parse({ version, slots });
        await tx.operationRecord.create({
          data: { ...scope, requestHash, result },
        });
        return result;
      },
      { isolationLevel: 'ReadCommitted', maxWait: 15000, timeout: 15000 },
    );
    log('collection.manager.save', started);
    return result;
  }
}
