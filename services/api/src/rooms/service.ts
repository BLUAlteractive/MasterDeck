import { randomInt, randomUUID } from 'node:crypto';
import { type Prisma, type PrismaClient } from '@deckforge/database';
import { shuffleFaces, type FaceId } from '@deckforge/game-core';
import {
  createPokerHand,
  reducePokerHand,
  projectPokerHand,
  legalPokerActions,
  InvalidPokerCommand,
  type PokerConfig,
  type PokerHand,
} from '@deckforge/game-poker';
import {
  pokerCommandSchema,
  pokerCommandReceiptSchema,
  pokerRoomViewSchema,
  pokerResumeSchema,
  pokerResumeResponseSchema,
  type PokerRoomCommand,
} from '@deckforge/contracts';
import type { Principal } from '../auth/service';
import { ApiFailure } from '../auth/errors';
import { canonical, hash, json, lockPrincipal } from './shared';
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
async function now(tx: Prisma.TransactionClient) {
  return (
    await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`
  )[0]!.now;
}
function view(
  gameId: string,
  state: PokerHand,
  userId: string,
  deadline: Date | null,
  settled = false,
) {
  return pokerRoomViewSchema.parse({
    gameId,
    view: projectPokerHand(state, userId),
    turnDeadline: deadline?.toISOString() ?? null,
    settled,
  });
}
export class StaleRoomVersion extends ApiFailure {
  constructor(readonly resync: z.infer<typeof pokerRoomViewSchema>) {
    super('STALE_VERSION', 409);
  }
}
/** Internal only; funded/loadout admission must precede this lifecycle primitive. */
export async function initializePokerRoom(
  db: PrismaClient,
  config: PokerConfig,
  turnTimeoutMs = 30000,
) {
  const id = await db.$transaction((tx) =>
    initializePokerRoomTx(tx, config, turnTimeoutMs),
  );
  console.info(
    JSON.stringify({ event: 'poker.room_initialized', status: 'ok' }),
  );
  return id;
}
export async function initializePokerRoomTx(
  tx: Prisma.TransactionClient,
  config: PokerConfig,
  turnTimeoutMs = 30000,
) {
  if (
    !Number.isInteger(turnTimeoutMs) ||
    turnTimeoutMs < 1000 ||
    turnTimeoutMs > 300000
  )
    throw new Error('INVALID_TIMEOUT_POLICY');
  const deck = shuffleFaces(randomInt),
    state = createPokerHand(config, deck),
    id = randomUUID(),
    initial = initSchema.parse({ config, deck });
  for (const userId of config.players.map((p) => p.id).sort()) {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId}::uuid FOR UPDATE`;
    if (
      (await tx.user.findUnique({ where: { id: userId } }))?.status !== 'ACTIVE'
    )
      throw new ApiFailure('ROOM_UNAVAILABLE', 404);
  }
  const time = await now(tx),
    turnDeadline =
      state.street === 'COMPLETE'
        ? null
        : new Date(time.getTime() + turnTimeoutMs);
  await tx.gameRoom.create({
    data: {
      id,
      rulesetVersion: state.rulesetVersion,
      stateVersion: 0,
      status: state.street === 'COMPLETE' ? 'COMPLETE' : 'ACTIVE',
      initial: json(initial),
      snapshot: json(state),
      commitment: hash(initial),
      turnTimeoutMs,
      turnDeadline,
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
      source: 'GENESIS',
      command: { type: 'INITIALIZED' },
      snapshot: json(state),
      turnDeadline,
      createdAt: time,
    },
  });
  return id;
}
export class PokerRoomService {
  constructor(readonly database: PrismaClient) {}
  private async lock(
    tx: Prisma.TransactionClient,
    p: Principal,
    gameId: string,
  ) {
    await lockPrincipal(tx, p);
    await tx.$queryRaw`SELECT "id" FROM "GameRoom" WHERE "id"=${gameId}::uuid FOR UPDATE`;
    if (
      !(await tx.gameParticipant.findUnique({
        where: { roomId_userId: { roomId: gameId, userId: p.userId } },
      }))
    )
      throw new ApiFailure('ROOM_UNAVAILABLE', 404);
  }
  /** Trusted server transaction only; never serialize this private return value. */
  async trustedState(tx: Prisma.TransactionClient, gameId: string) {
    return (await this.load(tx, gameId)).state;
  }
  private requestHash(input: PokerRoomCommand) {
    return hash({
      gameId: input.gameId,
      stateVersion: input.stateVersion,
      payload: input.payload,
    });
  }
  private async load(tx: Prisma.TransactionClient, gameId: string) {
    const room = await tx.gameRoom.findUniqueOrThrow({ where: { id: gameId } }),
      initial = initSchema.parse(room.initial);
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
    let previousDeadline: Date | null = null;
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
        if (event.source === 'TIMEOUT') {
          const legal = legalPokerActions(state, event.actorUserId!);
          if (
            !previousDeadline ||
            event.createdAt < previousDeadline ||
            !legal ||
            command.payload.action !== (legal.canCheck ? 'CHECK' : 'FOLD')
          )
            throw new Error('ROOM_INTEGRITY');
        } else if (
          event.source !== 'PLAYER' ||
          (previousDeadline && event.createdAt >= previousDeadline)
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
      previousDeadline = event.turnDeadline;
    }
    if (
      state.stateVersion !== room.stateVersion ||
      hash(state) !== hash(room.snapshot) ||
      previousDeadline?.getTime() !== room.turnDeadline?.getTime()
    )
      throw new Error('ROOM_INTEGRITY');
    return { room, state, states };
  }
  private async advance(
    tx: Prisma.TransactionClient,
    room: { id: string; turnTimeoutMs: number },
    state: PokerHand,
    input: PokerRoomCommand,
    userId: string,
    source: 'PLAYER' | 'TIMEOUT',
    time: Date,
  ) {
    let next: PokerHand;
    try {
      next = reducePokerHand(state, {
        playerId: userId,
        expectedVersion: input.stateVersion,
        ...input.payload,
      });
    } catch (e) {
      if (e instanceof InvalidPokerCommand) throw new ApiFailure(e.code, 422);
      throw e;
    }
    const turnDeadline =
      next.street === 'COMPLETE'
        ? null
        : new Date(time.getTime() + room.turnTimeoutMs);
    await tx.gameRoom.update({
      where: { id: room.id },
      data: {
        stateVersion: next.stateVersion,
        status: next.street === 'COMPLETE' ? 'COMPLETE' : 'ACTIVE',
        snapshot: json(next),
        turnDeadline,
      },
    });
    await tx.gameEvent.create({
      data: {
        id: randomUUID(),
        roomId: room.id,
        stateVersion: next.stateVersion,
        actorUserId: userId,
        source,
        commandId: input.commandId,
        requestHash: this.requestHash(input),
        command: json(input),
        snapshot: json(next),
        turnDeadline,
        createdAt: time,
      },
    });
    await tx.$queryRaw`SELECT pg_notify('deckforge_game_updates', ${room.id})::text`;
    return pokerCommandReceiptSchema.parse({
      ...view(room.id, next, userId, turnDeadline),
      commandId: input.commandId,
      stateVersion: next.stateVersion,
    });
  }
  async read(p: Principal, gameId: string) {
    if (!z.uuid().safeParse(gameId).success)
      throw new ApiFailure('INVALID_REQUEST', 400);
    gameId = gameId.toLowerCase();
    return this.database.$transaction(async (tx) => {
      await this.lock(tx, p, gameId);
      const { state, room } = await this.load(tx, gameId);
      const settled = !!(await tx.gameResult.findUnique({
        where: { roomId: gameId },
        select: { roomId: true },
      }));
      return view(gameId, state, p.userId, room.turnDeadline, settled);
    });
  }
  async resume(p: Principal, body: unknown) {
    const parsed = pokerResumeSchema.safeParse(body);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    const result = await this.read(p, parsed.data.gameId);
    if (parsed.data.afterVersion > result.view.stateVersion)
      throw new ApiFailure('INVALID_CURSOR', 409);
    return pokerResumeResponseSchema.parse({
      ...result,
      continuity: 'SNAPSHOT',
    });
  }
  async command(p: Principal, body: unknown) {
    const parsed = pokerCommandSchema.safeParse(body);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    const input = parsed.data,
      started = Date.now();
    let status = 'rejected',
      committed = false;
    try {
      const result = await this.database.$transaction(
        async (tx) => {
          await this.lock(tx, p, input.gameId);
          const { state, states, room } = await this.load(tx, input.gameId);
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
              prior.requestHash !== this.requestHash(input) ||
              prior.roomId !== input.gameId ||
              prior.source !== 'PLAYER'
            )
              throw new ApiFailure('IDEMPOTENCY_CONFLICT', 409);
            const original = states.get(prior.stateVersion);
            if (!original) throw new Error('ROOM_INTEGRITY');
            status = 'duplicate';
            return pokerCommandReceiptSchema.parse({
              ...view(input.gameId, original, p.userId, prior.turnDeadline),
              commandId: input.commandId,
              stateVersion: prior.stateVersion,
            });
          }
          if (input.stateVersion !== state.stateVersion)
            throw new StaleRoomVersion(
              view(input.gameId, state, p.userId, room.turnDeadline),
            );
          const time = await now(tx);
          if (room.turnDeadline && time >= room.turnDeadline)
            throw new ApiFailure('TURN_EXPIRED', 409);
          const receipt = await this.advance(
            tx,
            room,
            state,
            input,
            p.userId,
            'PLAYER',
            time,
          );
          status = 'accepted';
          return receipt;
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
  /** Server worker only. No client can claim elapsed time or impersonate this source. */
  async expire(gameId: string) {
    const result = await this.database.$transaction(
      async (tx) => {
        const members = await tx.gameParticipant.findMany({
          where: { roomId: gameId },
          orderBy: { userId: 'asc' },
        });
        for (const member of members)
          await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${member.userId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "GameRoom" WHERE "id"=${gameId}::uuid FOR UPDATE`;
        const { state, room } = await this.load(tx, gameId),
          time = await now(tx);
        if (
          state.toAct === null ||
          !room.turnDeadline ||
          time < room.turnDeadline
        )
          return false;
        const player = state.players[state.toAct]!,
          legal = legalPokerActions(state, player.id)!;
        await this.advance(
          tx,
          room,
          state,
          {
            gameId,
            commandId: 'timeout_' + gameId + '_' + state.stateVersion,
            stateVersion: state.stateVersion,
            payload: { action: legal.canCheck ? 'CHECK' : 'FOLD' },
          },
          player.id,
          'TIMEOUT',
          time,
        );
        return true;
      },
      { timeout: 15000 },
    );
    if (result)
      console.info(
        JSON.stringify({ event: 'poker.timeout', status: 'applied' }),
      );
    return result;
  }
  async expireDue(stopping: () => boolean = () => false) {
    const due = await this.database.$queryRaw<
      { id: string }[]
    >`SELECT "id" FROM "GameRoom" WHERE "status"='ACTIVE' AND "turnDeadline"<=clock_timestamp() ORDER BY "turnDeadline" LIMIT 100`;
    for (const r of due) {
      if (stopping()) break;
      try {
        await this.expire(r.id);
      } catch {
        console.warn(
          JSON.stringify({ event: 'poker.timeout', status: 'room_retry' }),
        );
      }
    }
  }
}
export function startTimeoutWorker(service: PokerRoomService) {
  let running: Promise<void> | null = null,
    closed = false;
  const tick = () => {
    if (closed || running) return;
    running = service
      .expireDue(() => closed)
      .catch(() => {
        console.warn(
          JSON.stringify({ event: 'poker.timeout', status: 'retry' }),
        );
      })
      .finally(() => {
        running = null;
      });
  };
  const timer = setInterval(tick, 500);
  timer.unref();
  tick();
  return async () => {
    closed = true;
    clearInterval(timer);
    await running;
  };
}
