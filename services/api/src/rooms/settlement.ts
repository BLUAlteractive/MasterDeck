import { bindTournamentRoom } from '../events/binding';
import { randomUUID } from 'node:crypto';
import { type PrismaClient, writeCardTransition } from '@deckforge/database';
import { validateLoadout } from '@deckforge/card-domain';
import { allocatePokerPots } from '@deckforge/game-poker';
import {
  gameStartSchema,
  gameFinishSchema,
  gameResultSchema,
  playChipBalanceSchema,
} from '@deckforge/contracts';
import { z } from 'zod';
import type { Principal } from '../auth/service';
import { ApiFailure } from '../auth/errors';
import { hash, json, lockPrincipal } from './shared';
import { playerAccount, transferChips } from './chips';
import { initializePokerRoomTx, PokerRoomService } from './service';
export const classicAdmissionPolicySchema = z
  .object({
    version: z.string().min(1).max(128),
    approvalReference: z.string().min(1).max(200),
    buyIn: z.number().int().min(1).max(166666666),
    smallBlind: z.number().int().positive(),
    bigBlind: z.number().int().positive(),
    turnTimeoutMs: z.number().int().min(1000).max(300000),
  })
  .strict()
  .refine((p) => p.smallBlind <= p.bigBlind && p.bigBlind <= p.buyIn);
export type ClassicAdmissionPolicy = z.infer<
  typeof classicAdmissionPolicySchema
>;
const snapshotSchema = z
  .array(
    z
      .object({
        instanceId: z.uuid(),
        faceId: z.string(),
        stateVersion: z.number().int().positive(),
        level: z.number().int().min(1).max(6),
        branch: z.enum(['BLUE', 'RED']),
        rarity: z.enum(['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY']),
        playStyleFamily: z.string(),
        seriesId: z.uuid(),
      })
      .strict(),
  )
  .length(52);
export class MatchSettlementService {
  constructor(
    readonly database: PrismaClient,
    readonly policy: ClassicAdmissionPolicy | null = null,
  ) {}
  async balance(p: Principal) {
    return this.database.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      const account = await tx.playChipAccount.findUnique({
        where: { userId: p.userId },
      });
      return playChipBalanceSchema.parse({
        currency: 'PLAY_CHIPS',
        balance: (account?.balance ?? 0n).toString(),
      });
    });
  }
  async start(p: Principal, body: unknown) {
    const parsed = gameStartSchema.safeParse(body);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    if (!this.policy) throw new ApiFailure('GAME_POLICY_NOT_CONFIGURED', 503);
    const policy = classicAdmissionPolicySchema.parse(this.policy),
      input = parsed.data;
    const receipt = await this.database.$transaction(
      async (tx) => {
        const before = await tx.lobbySeat.findMany({
          where: { lobbyId: input.lobbyId },
          orderBy: { userId: 'asc' },
        });
        for (const userId of [
          ...new Set([p.userId, ...before.map((s) => s.userId)]),
        ].sort())
          await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId}::uuid FOR UPDATE`;
        await lockPrincipal(tx, p);
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(42819)::text`;
        const prior = await tx.operationRecord.findUnique({
          where: {
            userId_operation_key: {
              userId: p.userId,
              operation: 'GAME_START',
              key: input.commandId,
            },
          },
        });
        if (prior) {
          if (prior.requestHash !== hash(input))
            throw new ApiFailure('IDEMPOTENCY_CONFLICT', 409);
          return z.object({ gameId: z.uuid() }).strict().parse(prior.result);
        }
        const lobby = await tx.lobby.findUnique({
          where: { id: input.lobbyId },
          include: { seats: { orderBy: { seat: 'asc' } } },
        });
        if (!lobby || lobby.hostId !== p.userId)
          throw new ApiFailure('LOBBY_UNAVAILABLE', 404);
        const old = await tx.gameAdmission.findUnique({
          where: { lobbyId: lobby.id },
        });
        if (old) {
          await tx.operationRecord.create({
            data: {
              userId: p.userId,
              operation: 'GAME_START',
              key: input.commandId,
              requestHash: hash(input),
              result: { gameId: old.roomId },
            },
          });
          return { gameId: old.roomId };
        }
        if (
          lobby.status !== 'OPEN' ||
          lobby.mode !== 'CLASSIC' ||
          lobby.rulesetVersion !== 'CLASSIC_NLHE_V1' ||
          lobby.seats.length < 2 ||
          !lobby.seats.every((s) => s.ready) ||
          lobby.seats.some(
            (s) =>
              !before.some((b) => b.userId === s.userId && b.seat === s.seat),
          )
        )
          throw new ApiFailure('LOBBY_NOT_READY', 409);
        for (const seat of lobby.seats) {
          if (
            (await tx.user.findUniqueOrThrow({ where: { id: seat.userId } }))
              .status !== 'ACTIVE'
          )
            throw new ApiFailure('LOBBY_NOT_READY', 409);
        }
        const selections = [];
        for (const seat of lobby.seats) {
          const loadout = await tx.loadout.findUnique({
            where: { userId: seat.userId },
            include: { cards: true },
          });
          if (!loadout) throw new ApiFailure('INVALID_LOADOUT', 422);
          selections.push({ seat, loadout });
        }
        const ids = selections.flatMap((s) =>
          s.loadout.cards.map((c) => c.instanceId),
        );
        await tx.$queryRaw`SELECT "id" FROM "CardInstance" WHERE "id"=ANY(${ids}::uuid[]) ORDER BY "id" FOR UPDATE`;
        const cards = await tx.cardInstance.findMany({
          where: { id: { in: ids } },
          include: { template: true },
        });
        for (const s of selections) {
          if (
            !validateLoadout(
              s.seat.userId,
              Object.fromEntries(
                s.loadout.cards.map((c) => [c.faceId, c.instanceId]),
              ),
              cards,
            ).valid
          )
            throw new ApiFailure('INVALID_LOADOUT', 422);
          const account = await playerAccount(tx, s.seat.userId);
          if (account.balance < BigInt(policy.buyIn))
            throw new ApiFailure('INSUFFICIENT_PLAY_CHIPS', 422);
        }
        const gameId = await initializePokerRoomTx(
          tx,
          {
            players: lobby.seats.map((s) => ({
              id: s.userId,
              stack: policy.buyIn,
            })),
            dealer: 0,
            smallBlind: policy.smallBlind,
            bigBlind: policy.bigBlind,
          },
          policy.turnTimeoutMs,
        );
        await bindTournamentRoom(
          tx,
          lobby.id,
          gameId,
          lobby.seats.map((s) => s.userId),
          policy,
        );
        const escrow = await tx.playChipAccount.create({
          data: { id: randomUUID(), kind: 'ESCROW', roomId: gameId },
        });
        await tx.gameAdmission.create({
          data: {
            roomId: gameId,
            lobbyId: lobby.id,
            buyIn: policy.buyIn,
            policyVersion: policy.version,
            policySnapshot: json(policy),
          },
        });
        for (const s of selections) {
          const account = await playerAccount(tx, s.seat.userId);
          await transferChips(tx, {
            sourceKey: 'game:' + gameId + ':reserve:' + s.seat.userId,
            kind: 'RESERVE',
            operatorId: 'system.game-admission',
            entries: [
              { accountId: account.id, amount: -BigInt(policy.buyIn) },
              { accountId: escrow.id, amount: BigInt(policy.buyIn) },
            ],
          });
          const snapshot = [];
          for (const selection of s.loadout.cards) {
            const card = cards.find((c) => c.id === selection.instanceId)!;
            const locked = await writeCardTransition(tx, {
              instanceId: card.id,
              ownerId: card.ownerId,
              expectedVersion: card.stateVersion,
              command: {
                action: 'LOCK',
                lockToken: gameId,
                lockReason: 'POKER_HAND',
              },
              actorUserId: p.userId,
              operatorId: 'system.game-admission',
              sourceKey: 'game:' + gameId + ':lock:' + card.id,
              reason: 'GAME_ADMISSION',
            });
            snapshot.push({
              instanceId: card.id,
              faceId: card.faceId,
              stateVersion: locked.card.stateVersion,
              level: card.level,
              branch: card.branch,
              rarity: card.rarity,
              playStyleFamily: card.template.playStyleFamily,
              seriesId: card.seriesId,
            });
          }
          await tx.gameReservation.create({
            data: {
              roomId: gameId,
              userId: s.seat.userId,
              snapshot: json(snapshotSchema.parse(snapshot)),
            },
          });
        }
        await tx.lobby.update({
          where: { id: lobby.id },
          data: { status: 'STARTED', version: { increment: 1 } },
        });
        await tx.operationRecord.create({
          data: {
            userId: p.userId,
            operation: 'GAME_START',
            key: input.commandId,
            requestHash: hash(input),
            result: { gameId },
          },
        });
        return { gameId };
      },
      { timeout: 30000 },
    );
    console.info(JSON.stringify({ event: 'game.admission', status: 'ok' }));
    return receipt;
  }
  async finish(p: Principal, body: unknown) {
    const parsed = gameFinishSchema.safeParse(body);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    return this.complete(parsed.data.gameId, p);
  }
  /** Durable recovery worker: no client reported winner, balance or finish proof. */
  async complete(gameId: string, principal?: Principal) {
    const result = await this.database.$transaction(
      async (tx) => {
        const members = await tx.gameParticipant.findMany({
          where: { roomId: gameId },
          orderBy: { userId: 'asc' },
        });
        for (const userId of [
          ...new Set([
            ...members.map((m) => m.userId),
            ...(principal ? [principal.userId] : []),
          ]),
        ].sort())
          await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId}::uuid FOR UPDATE`;
        if (principal) {
          await lockPrincipal(tx, principal);
          if (!members.some((m) => m.userId === principal.userId))
            throw new ApiFailure('ROOM_UNAVAILABLE', 404);
        }
        await tx.$queryRaw`SELECT "id" FROM "GameRoom" WHERE "id"=${gameId}::uuid FOR UPDATE`;
        const admission = await tx.gameAdmission.findUnique({
          where: { roomId: gameId },
        });
        if (!admission) throw new ApiFailure('ROOM_UNAVAILABLE', 404);
        const prior = await tx.gameResult.findUnique({
          where: { roomId: gameId },
        });
        if (prior)
          return gameResultSchema.parse({
            gameId,
            rulesetVersion: prior.rulesetVersion,
            stateVersion: prior.stateVersion,
            allocation: prior.allocation,
          });
        const state = await new PokerRoomService(this.database).trustedState(
          tx,
          gameId,
        );
        if (state.street !== 'COMPLETE')
          throw new ApiFailure('HAND_IN_PROGRESS', 409);
        const allocation = allocatePokerPots(state),
          escrow = await tx.playChipAccount.findUniqueOrThrow({
            where: { roomId: gameId },
          });
        if (escrow.balance !== BigInt(admission.buyIn * members.length))
          throw new Error('ESCROW_RECONCILIATION_FAILED');
        const entries = [{ accountId: escrow.id, amount: -escrow.balance }];
        for (const player of allocation.players) {
          const account = await playerAccount(tx, player.playerId);
          if (player.finalStack > 0)
            entries.push({
              accountId: account.id,
              amount: BigInt(player.finalStack),
            });
        }
        await transferChips(tx, {
          sourceKey: 'game:' + gameId + ':settle',
          kind: 'SETTLE',
          operatorId: 'system.game-settlement',
          entries,
        });
        const reservations = await tx.gameReservation.findMany({
          where: { roomId: gameId },
          orderBy: { userId: 'asc' },
        });
        if (reservations.length !== members.length)
          throw new Error('RESERVATION_RECONCILIATION_FAILED');
        for (const reservation of reservations) {
          for (const card of snapshotSchema.parse(reservation.snapshot))
            await writeCardTransition(tx, {
              instanceId: card.instanceId,
              ownerId: reservation.userId,
              expectedVersion: card.stateVersion,
              command: { action: 'UNLOCK', lockToken: gameId },
              operatorId: 'system.game-settlement',
              sourceKey: 'game:' + gameId + ':unlock:' + card.instanceId,
              reason: 'GAME_SETTLED',
            });
        }
        await tx.lobby.update({
          where: { id: admission.lobbyId },
          data: { status: 'CLOSED', version: { increment: 1 } },
        });
        await tx.lobbySeat.deleteMany({
          where: { lobbyId: admission.lobbyId },
        });
        await tx.gameResult.create({
          data: {
            roomId: gameId,
            stateVersion: state.stateVersion,
            rulesetVersion: state.rulesetVersion,
            allocation: json(allocation),
          },
        });
        await tx.$queryRaw`SELECT pg_notify('deckforge_game_updates',${gameId})::text`;
        return gameResultSchema.parse({
          gameId,
          rulesetVersion: state.rulesetVersion,
          stateVersion: state.stateVersion,
          allocation,
        });
      },
      { timeout: 30000 },
    );
    console.info(JSON.stringify({ event: 'game.settlement', status: 'ok' }));
    return result;
  }
  async recover(stopping: () => boolean = () => false) {
    const due = await this.database.gameAdmission.findMany({
      where: { room: { status: 'COMPLETE', result: null } },
      take: 100,
      orderBy: { roomId: 'asc' },
    });
    for (const item of due) {
      if (stopping()) break;
      try {
        await this.complete(item.roomId);
      } catch {
        console.warn(
          JSON.stringify({ event: 'game.settlement', status: 'retry' }),
        );
      }
    }
  }
  async audit() {
    const mismatches = await this.database.$queryRaw<
      { count: number }[]
    >`SELECT count(*)::int AS count FROM "PlayChipAccount" a WHERE a."balance" IS DISTINCT FROM (SELECT COALESCE(sum(e."amount"),0) FROM "PlayChipEntry" e WHERE e."accountId"=a."id")`;
    const totals = await this.database.playChipAccount.aggregate({
      _sum: { balance: true },
    });
    return {
      balanced:
        mismatches[0]!.count === 0 && (totals._sum.balance ?? 0n) === 0n,
      mismatches: mismatches[0]!.count,
      total: (totals._sum.balance ?? 0n).toString(),
    };
  }
}
export function startSettlementWorker(service: MatchSettlementService) {
  let running: Promise<void> | null = null,
    closed = false;
  const tick = () => {
    if (closed || running) return;
    running = service
      .recover(() => closed)
      .catch(() => {
        console.warn(
          JSON.stringify({ event: 'game.settlement', status: 'retry' }),
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
