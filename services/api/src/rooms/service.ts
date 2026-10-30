import { createHash, randomInt, randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@deckforge/database';
import { shuffleFaces, type FaceId } from '@deckforge/game-core';
import {
  createPokerHand,
  reducePokerHand,
  projectPokerHand,
  InvalidPokerCommand,
  type PokerConfig,
  type PokerCommand,
  type PokerHand,
} from '@deckforge/game-poker';
import {
  pokerCommandSchema,
  pokerCommandReceiptSchema,
  pokerRoomViewSchema,
  type PokerRoomCommand,
} from '@deckforge/contracts';
import type { Principal } from '../auth/service';
import { ApiFailure } from '../auth/errors';
import { z } from 'zod';
const initSchema = z
  .object({
    config: z
      .object({
        players: z
          .array(
            z
              .object({ id: z.uuid(), stack: z.number().int().positive() })
              .strict(),
          )
          .min(2)
          .max(6),
        dealer: z.number().int(),
        smallBlind: z.number().int(),
        bigBlind: z.number().int(),
      })
      .strict(),
    deck: z.array(z.string()).length(52),
  })
  .strict();
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
function hash(value: unknown) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}
function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
export class StaleRoomVersion extends ApiFailure {
  constructor(readonly resync: z.infer<typeof pokerRoomViewSchema>) {
    super('STALE_VERSION', 409);
  }
}
/** Server-only lifecycle entry. No public creation/admission endpoint exists in B018.
 * B019 must supply funded, validated/reserved admission before calling this primitive.
 * Tests use isolated internal users/stacks; this never grants chips or cards.
 */
export async function initializePokerRoom(
  db: PrismaClient,
  config: PokerConfig,
) {
  const deck = shuffleFaces(randomInt),
    state = createPokerHand(config, deck),
    id = randomUUID();
  const initial = initSchema.parse({ config, deck });
  await db.$transaction(async (tx) => {
    for (const userId of config.players.map((p) => p.id).sort()) {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId}::uuid FOR UPDATE`;
      if (
        (await tx.user.findUnique({ where: { id: userId } }))?.status !==
        'ACTIVE'
      )
        throw new ApiFailure('ROOM_UNAVAILABLE', 404);
    }
    await tx.gameRoom.create({
      data: {
        id,
        rulesetVersion: state.rulesetVersion,
        stateVersion: 0,
        status: state.street === 'COMPLETE' ? 'COMPLETE' : 'ACTIVE',
        initial: json(initial),
        snapshot: json(state),
        commitment: hash(initial),
      },
    });
    await tx.gameParticipant.createMany({
      data: config.players.map((p, seat) => ({
        roomId: id,
        userId: p.id,
        seat,
      })),
    });
    await tx.gameEvent.create({
      data: {
        id: randomUUID(),
        roomId: id,
        stateVersion: 0,
        command: { type: 'INITIALIZED' },
        snapshot: json(state),
      },
    });
  });
  console.info(
    JSON.stringify({ event: 'poker.room_initialized', status: 'ok' }),
  );
  return id;
}
export class PokerRoomService {
  constructor(readonly database: PrismaClient) {}
  private async lock(
    tx: Prisma.TransactionClient,
    p: Principal,
    gameId: string,
  ) {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${p.userId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "AuthSession" WHERE "id"=${p.sessionId}::uuid FOR SHARE`;
    const user = await tx.user.findUnique({ where: { id: p.userId } }),
      session = await tx.authSession.findUnique({ where: { id: p.sessionId } });
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      !session ||
      session.revokedAt ||
      session.identityId !== p.identityId ||
      (!user.isGuest && p.claims.is_anonymous) ||
      p.claims.exp <= Math.floor(Date.now() / 1000)
    )
      throw new ApiFailure('UNAUTHORIZED', 401);
    await tx.$queryRaw`SELECT "id" FROM "GameRoom" WHERE "id"=${gameId}::uuid FOR UPDATE`;
    if (
      !(await tx.gameParticipant.findUnique({
        where: { roomId_userId: { roomId: gameId, userId: p.userId } },
      }))
    )
      throw new ApiFailure('ROOM_UNAVAILABLE', 404);
  }
  private async load(tx: Prisma.TransactionClient, gameId: string) {
    const room = await tx.gameRoom.findUniqueOrThrow({ where: { id: gameId } });
    const initial = initSchema.parse(room.initial);
    let state = createPokerHand(initial.config, initial.deck as FaceId[]);
    const events = await tx.gameEvent.findMany({
      where: { roomId: gameId },
      orderBy: { stateVersion: 'asc' },
    });
    if (
      room.commitment !== hash(initial) ||
      room.rulesetVersion !== state.rulesetVersion ||
      events.length !== room.stateVersion + 1
    )
      throw new Error('ROOM_INTEGRITY');
    const states = new Map<number, PokerHand>();
    for (const event of events) {
      if (event.stateVersion !== states.size) throw new Error('ROOM_INTEGRITY');
      if (event.stateVersion > 0) {
        const command = pokerCommandSchema.parse(event.command);
        if (
          command.gameId !== gameId ||
          command.commandId !== event.commandId ||
          command.stateVersion !== state.stateVersion ||
          event.requestHash !== this.requestHash(command)
        )
          throw new Error('ROOM_INTEGRITY');
        state = reducePokerHand(state, {
          playerId: event.actorUserId!,
          expectedVersion: command.stateVersion,
          ...command.payload,
        });
      } else if (
        canonical(event.command) !== canonical({ type: 'INITIALIZED' })
      )
        throw new Error('ROOM_INTEGRITY');
      if (hash(state) !== hash(event.snapshot))
        throw new Error('ROOM_INTEGRITY');
      states.set(state.stateVersion, state);
    }
    if (
      state.stateVersion !== room.stateVersion ||
      hash(state) !== hash(room.snapshot)
    )
      throw new Error('ROOM_INTEGRITY');
    return { state, states };
  }
  private requestHash(input: PokerRoomCommand) {
    return hash({
      gameId: input.gameId,
      stateVersion: input.stateVersion,
      payload: input.payload,
    });
  }
  async read(p: Principal, gameId: string) {
    if (!z.uuid().safeParse(gameId).success)
      throw new ApiFailure('INVALID_REQUEST', 400);
    gameId = gameId.toLowerCase();
    return this.database.$transaction(async (tx) => {
      await this.lock(tx, p, gameId);
      const { state } = await this.load(tx, gameId);
      return pokerRoomViewSchema.parse({
        gameId,
        view: projectPokerHand(state, p.userId),
      });
    });
  }
  async command(p: Principal, body: unknown) {
    const parsed = pokerCommandSchema.safeParse(body);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    const input = parsed.data,
      requestHash = this.requestHash(input),
      started = Date.now();
    let status = 'rejected';
    let committed = false;
    try {
      const result = await this.database.$transaction(
        async (tx) => {
          await this.lock(tx, p, input.gameId);
          const { state, states } = await this.load(tx, input.gameId);
          const prior = await tx.gameEvent.findUnique({
            where: {
              actorUserId_commandId: {
                actorUserId: p.userId,
                commandId: input.commandId,
              },
            },
          });
          if (prior) {
            if (
              prior.requestHash !== requestHash ||
              prior.roomId !== input.gameId
            )
              throw new ApiFailure('IDEMPOTENCY_CONFLICT', 409);
            const original = states.get(prior.stateVersion);
            if (!original) throw new Error('ROOM_INTEGRITY');
            status = 'duplicate';
            return pokerCommandReceiptSchema.parse({
              gameId: input.gameId,
              commandId: input.commandId,
              stateVersion: prior.stateVersion,
              view: projectPokerHand(original, p.userId),
            });
          }
          if (input.stateVersion !== state.stateVersion)
            throw new StaleRoomVersion(
              pokerRoomViewSchema.parse({
                gameId: input.gameId,
                view: projectPokerHand(state, p.userId),
              }),
            );
          const command: PokerCommand = {
            playerId: p.userId,
            expectedVersion: input.stateVersion,
            ...input.payload,
          };
          let next: PokerHand;
          try {
            next = reducePokerHand(state, command);
          } catch (error) {
            if (error instanceof InvalidPokerCommand)
              throw new ApiFailure(error.code, 422);
            throw error;
          }
          await tx.gameRoom.update({
            where: { id: input.gameId },
            data: {
              stateVersion: next.stateVersion,
              status: next.street === 'COMPLETE' ? 'COMPLETE' : 'ACTIVE',
              snapshot: json(next),
            },
          });
          await tx.gameEvent.create({
            data: {
              id: randomUUID(),
              roomId: input.gameId,
              stateVersion: next.stateVersion,
              actorUserId: p.userId,
              commandId: input.commandId,
              requestHash,
              command: json(input),
              snapshot: json(next),
            },
          });
          await tx.$queryRaw`SELECT pg_notify('deckforge_game_updates', ${input.gameId})::text`;
          status = 'accepted';
          return pokerCommandReceiptSchema.parse({
            gameId: input.gameId,
            commandId: input.commandId,
            stateVersion: next.stateVersion,
            view: projectPokerHand(next, p.userId),
          });
        },
        { timeout: 15000 },
      );
      committed = true;
      return result;
    } finally {
      console.info(
        JSON.stringify({
          event: 'poker.command',
          status: committed ? status : 'rejected',
          durationMs: Date.now() - started,
        }),
      );
    }
  }
}
