import { releaseSpadesReservations } from './spades-reservations';
import { randomUUID, randomInt } from 'node:crypto';
import { z } from 'zod';
import { shuffleFaces, getFace, type FaceId } from '@deckforge/game-core';
import {
  createSpadesMatch,
  applySpadesMatch,
  nextSpadesRound,
  projectSpadesMatch,
  type SpadesMatch,
} from '@deckforge/game-spades';
import {
  spadesRulesSchema,
  spadesCommandSchema,
  spadesRoomViewSchema,
  spadesReceiptSchema,
  pokerRoomJoinSchema,
  pokerResumeSchema,
  spadesResumeResponseSchema,
} from '@deckforge/contracts';
import type { PrismaClient, Prisma } from '@deckforge/database';
import type { Principal } from '../auth/service';
import { ApiFailure } from '../auth/errors';
import { hash, json, lockPrincipal, RoomVersionConflict } from './shared';
const genesisSchema = z
  .object({
    players: z
      .array(z.uuid())
      .length(4)
      .refine((players) => new Set(players).size === 4),
    dealer: z.number().int().min(0).max(3),
    deck: z.array(z.string().regex(/^(?:[2-9]|10|J|Q|K|A)-[CDHS]$/)).length(52),
    rules: spadesRulesSchema,
  })
  .strict();
export type SpadesGenesis = z.infer<typeof genesisSchema>;
export async function initializeSpadesRoomTx(
  tx: Prisma.TransactionClient,
  input: SpadesGenesis,
) {
  const initial = genesisSchema.parse(input),
    players = [...initial.players].sort();
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=ANY(${players}::uuid[]) ORDER BY "id" FOR UPDATE`;
  if (
    (await tx.user.count({
      where: { id: { in: players }, status: 'ACTIVE' },
    })) !== 4
  )
    throw new ApiFailure('ROOM_UNAVAILABLE', 404);
  const state = createSpadesMatch(
      initial.players,
      initial.dealer as 0 | 1 | 2 | 3,
      initial.deck as FaceId[],
      initial.rules,
    ),
    id = randomUUID();
  await tx.spadesRoom.create({
    data: {
      id,
      rulesetVersion: state.rules.version,
      stateVersion: 0,
      phase: state.phase,
      initial: json(initial),
      snapshot: json(state),
    },
  });
  await tx.spadesSeat.createMany({
    data: initial.players.map((userId, seat) => ({ roomId: id, userId, seat })),
  });
  await tx.spadesEvent.create({
    data: {
      id: randomUUID(),
      roomId: id,
      stateVersion: 0,
      command: { kind: 'GENESIS' },
      snapshot: json(state),
    },
  });
  return id;
}
/** Server-only lifecycle primitive. Public admission must validate/reserve loadouts separately. */
export async function initializeSpadesRoom(
  db: PrismaClient,
  input: SpadesGenesis,
) {
  const id = await db.$transaction((tx) => initializeSpadesRoomTx(tx, input));
  console.info(JSON.stringify({ event: 'spades.initialized', status: 'ok' }));
  return id;
}
function view(gameId: string, state: SpadesMatch, viewer: string) {
  return spadesRoomViewSchema.parse({
    gameId,
    view: projectSpadesMatch(state, viewer),
    turnDeadline: null,
    settled: state.phase === 'MATCH_COMPLETE',
  });
}
function applyPlayer(
  state: SpadesMatch,
  payload: { kind: 'BID'; tricks: number } | { kind: 'PLAY'; face: string },
  playerId: string,
) {
  const common = { playerId, expectedVersion: state.stateVersion };
  return applySpadesMatch(
    state,
    payload.kind === 'PLAY'
      ? { ...common, kind: 'PLAY', face: getFace(payload.face).id }
      : { ...common, kind: 'BID', tricks: payload.tricks },
  );
}
export class SpadesRoomService {
  constructor(readonly database: PrismaClient) {}
  async trustedState(tx: Prisma.TransactionClient, gameId: string) {
    const room = await tx.spadesRoom.findUnique({ where: { id: gameId } });
    if (!room) throw new ApiFailure('ROOM_UNAVAILABLE', 404);
    const initial = genesisSchema.parse(room.initial);
    let state = createSpadesMatch(
      initial.players,
      initial.dealer as 0 | 1 | 2 | 3,
      initial.deck as FaceId[],
      initial.rules,
    );
    const events = await tx.spadesEvent.findMany({
      where: { roomId: gameId },
      orderBy: { stateVersion: 'asc' },
    });
    if (
      events.length !== room.stateVersion + 1 ||
      events[0]?.stateVersion !== 0 ||
      hash(events[0].snapshot) !== hash(state) ||
      hash(events[0].command) !== hash({ kind: 'GENESIS' })
    )
      throw new Error('SPADES_REPLAY_INTEGRITY');
    for (const event of events.slice(1)) {
      const command = event.command as Record<string, unknown>;
      let payload: unknown;
      if (command.kind === 'CONTINUE') {
        const continued = z
          .object({
            kind: z.literal('CONTINUE'),
            deck: genesisSchema.shape.deck,
          })
          .strict()
          .parse(command);
        payload = { kind: 'CONTINUE' };
        state = nextSpadesRound(
          state,
          state.stateVersion,
          continued.deck as FaceId[],
        );
      } else {
        const input = spadesCommandSchema.parse({
          gameId,
          commandId: event.commandId,
          stateVersion: state.stateVersion,
          payload: command,
        });
        payload = input.payload;
        if (input.payload.kind === 'CONTINUE')
          throw new Error('SPADES_REPLAY_INTEGRITY');
        state = applyPlayer(state, input.payload, event.actorUserId!);
      }
      if (
        event.requestHash !==
          hash({
            gameId,
            commandId: event.commandId,
            stateVersion: event.stateVersion - 1,
            payload,
          }) ||
        state.stateVersion !== event.stateVersion ||
        hash(event.snapshot) !== hash(state)
      )
        throw new Error('SPADES_REPLAY_INTEGRITY');
    }
    if (
      hash(state) !== hash(room.snapshot) ||
      state.phase !== room.phase ||
      state.rules.version !== room.rulesetVersion
    )
      throw new Error('SPADES_REPLAY_INTEGRITY');
    return state;
  }
  private async load(
    tx: Prisma.TransactionClient,
    p: Principal,
    gameId: string,
  ) {
    await tx.$queryRaw`SELECT "id" FROM "SpadesRoom" WHERE "id"=${gameId}::uuid FOR UPDATE`;
    if (
      !(await tx.spadesSeat.findUnique({
        where: { roomId_userId: { roomId: gameId, userId: p.userId } },
      }))
    )
      throw new ApiFailure('ROOM_UNAVAILABLE', 404);
    return this.trustedState(tx, gameId);
  }
  async read(p: Principal, id: string) {
    const parsed = pokerRoomJoinSchema.safeParse({ gameId: id });
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    return this.database.$transaction(
      async (tx) => {
        await lockPrincipal(tx, p);
        return view(
          parsed.data.gameId,
          await this.load(tx, p, parsed.data.gameId),
          p.userId,
        );
      },
      { timeout: 15000 },
    );
  }
  async resume(p: Principal, body: unknown) {
    const parsed = pokerResumeSchema.safeParse(body);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    const current = await this.read(p, parsed.data.gameId);
    if (parsed.data.afterVersion > current.view.stateVersion)
      throw new ApiFailure('INVALID_CURSOR', 409);
    return spadesResumeResponseSchema.parse({
      ...current,
      continuity: 'SNAPSHOT',
    });
  }
  async command(p: Principal, body: unknown) {
    const parsed = spadesCommandSchema.safeParse(body);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    const input = parsed.data;
    const result = await this.database.$transaction(
      async (tx) => {
        const seats = await tx.spadesSeat.findMany({
          where: { roomId: input.gameId },
        });
        const userIds = [
          ...new Set([...seats.map((seat) => seat.userId), p.userId]),
        ].sort();
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=ANY(${userIds}::uuid[]) ORDER BY "id" FOR UPDATE`;
        await lockPrincipal(tx, p);
        const prior = await tx.spadesEvent.findUnique({
          where: {
            actorUserId_commandId: {
              actorUserId: p.userId,
              commandId: input.commandId,
            },
          },
        });
        if (prior) {
          if (prior.requestHash !== hash(input))
            throw new ApiFailure('IDEMPOTENCY_CONFLICT', 409);
          await this.load(tx, p, input.gameId);
          return spadesReceiptSchema.parse(prior.receipt);
        }
        const current = await this.load(tx, p, input.gameId);
        if (current.stateVersion !== input.stateVersion)
          throw new RoomVersionConflict(view(input.gameId, current, p.userId));
        let next: SpadesMatch;
        let privateCommand: unknown = input.payload;
        try {
          if (input.payload.kind === 'CONTINUE') {
            const deck = shuffleFaces(randomInt);
            next = nextSpadesRound(current, current.stateVersion, deck);
            privateCommand = { kind: 'CONTINUE', deck };
          } else next = applyPlayer(current, input.payload, p.userId);
        } catch {
          throw new ApiFailure('ILLEGAL_COMMAND', 422);
        }
        const receipt = spadesReceiptSchema.parse({
          ...view(input.gameId, next, p.userId),
          commandId: input.commandId,
          stateVersion: next.stateVersion,
        });
        await tx.spadesRoom.update({
          where: { id: input.gameId },
          data: {
            stateVersion: next.stateVersion,
            phase: next.phase,
            snapshot: json(next),
          },
        });
        await tx.spadesEvent.create({
          data: {
            id: randomUUID(),
            roomId: input.gameId,
            stateVersion: next.stateVersion,
            actorUserId: p.userId,
            commandId: input.commandId,
            requestHash: hash(input),
            command: json(privateCommand),
            snapshot: json(next),
            receipt: json(receipt),
          },
        });
        if (next.phase === 'MATCH_COMPLETE') {
          await tx.spadesResult.create({
            data: {
              roomId: input.gameId,
              stateVersion: next.stateVersion,
              rulesetVersion: next.rules.version,
              winner: next.winner!,
              teams: json(next.teams),
            },
          });
          await releaseSpadesReservations(tx, input.gameId);
        }
        await tx.$queryRaw`SELECT pg_notify('deckforge_game_updates',${input.gameId})::text`;
        return receipt;
      },
      { timeout: 15000 },
    );
    console.info(JSON.stringify({ event: 'spades.command', status: 'ok' }));
    return result;
  }
}
