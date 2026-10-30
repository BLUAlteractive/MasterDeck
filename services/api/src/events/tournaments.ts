import { randomUUID, randomBytes } from 'node:crypto';
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
import type { Prisma, PrismaClient } from '@deckforge/database';
import { tournamentBracket, tournamentWinner } from '@deckforge/game-core';
import { allocatePokerPots } from '@deckforge/game-poker';
import {
  tournamentReadySchema,
  tournamentDisputeSchema,
  tournamentCreateSchema,
  tournamentCommandSchema,
  tournamentReplaySchema,
  tournamentListQuerySchema,
  tournamentViewSchema,
  type TournamentPolicy,
} from '@deckforge/contracts';
import type { AuthService, Principal } from '../auth/service';
import { ApiFailure } from '../auth/errors';
import { lockPrincipal, hash, json } from '../rooms/shared';
import {
  MatchSettlementService,
  type ClassicAdmissionPolicy,
} from '../rooms/settlement';
import { PokerRoomService } from '../rooms/service';
const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const p = schema.safeParse(body);
  if (!p.success) throw new ApiFailure('INVALID_REQUEST', 400);
  return p.data;
};
export class TournamentService {
  constructor(
    readonly db: PrismaClient,
    readonly policy: TournamentPolicy | null,
    readonly admission: ClassicAdmissionPolicy | null,
  ) {}
  private configured() {
    if (!this.policy || !this.admission)
      throw new ApiFailure('TOURNAMENT_NOT_CONFIGURED', 503);
    return { policy: this.policy, admission: this.admission };
  }
  private async admin(tx: Prisma.TransactionClient, p: Principal) {
    await lockPrincipal(tx, p);
    const u = await tx.user.findUniqueOrThrow({ where: { id: p.userId } });
    if (u.role !== 'ADMIN' || u.isGuest || p.claims.aal !== 'aal2')
      throw new ApiFailure('FORBIDDEN', 403);
  }
  async create(p: Principal, body: unknown) {
    const input = parse(tournamentCreateSchema, body),
      config = this.configured();
    return this.db.$transaction(async (tx) => {
      await this.admin(tx, p);
      const prior = await tx.tournamentAudit.findUnique({
        where: {
          actorId_commandId: { actorId: p.userId, commandId: input.commandId },
        },
      });
      if (prior) {
        if (prior.requestHash !== hash(input))
          throw new ApiFailure('IDEMPOTENCY_CONFLICT', 409);
        return prior.result;
      }
      const [clock] = await tx.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      if (new Date(input.startsAt) <= clock!.now)
        throw new ApiFailure('INVALID_SCHEDULE', 422);
      const id = randomUUID();
      await tx.tournament.create({
        data: {
          id,
          name: input.name,
          capacity: input.capacity,
          startsAt: new Date(input.startsAt),
          title: input.title,
          policy: json(config.policy),
          admissionPolicy: json(config.admission),
        },
      });
      const result = { id };
      await tx.tournamentAudit.create({
        data: {
          id: randomUUID(),
          actorId: p.userId,
          commandId: input.commandId,
          tournamentId: id,
          action: 'CREATE',
          reason: input.reason,
          requestHash: hash(input),
          result,
        },
      });
      return result;
    });
  }
  async register(p: Principal, id: string, body: unknown) {
    parse(z.uuid(), id);
    parse(tournamentCommandSchema, body);
    this.configured();
    return this.db.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      const user = await tx.user.findUniqueOrThrow({ where: { id: p.userId } });
      if (user.isGuest) throw new ApiFailure('PERMANENT_ACCOUNT_REQUIRED', 403);
      await tx.$queryRaw`SELECT "id" FROM "Tournament" WHERE "id"=${id}::uuid FOR UPDATE`;
      const t = await tx.tournament.findUnique({
        where: { id },
        include: { entries: true },
      });
      if (!t) throw new ApiFailure('TOURNAMENT_UNAVAILABLE', 404);
      const own = t.entries.find((e) => e.userId === p.userId);
      if (own) return { seed: own.seed };
      const [clock] = await tx.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      if (
        t.status !== 'REGISTRATION' ||
        t.startsAt <= clock!.now ||
        hash(t.policy) !== hash(this.policy)
      )
        throw new ApiFailure('REGISTRATION_CLOSED', 409);
      if (t.entries.length >= t.capacity)
        throw new ApiFailure('TOURNAMENT_FULL', 409);
      const seed = t.entries.length + 1;
      await tx.tournamentEntry.create({
        data: { id: randomUUID(), tournamentId: id, userId: p.userId, seed },
      });
      return { seed };
    });
  }
  /** Scheduled start is server-clock only; underfilled fields are cancelled without any fee. */
  async startDue(id: string) {
    this.configured();
    await this.db.$transaction(async (tx) => {
      const before = await tx.tournamentEntry.findMany({
        where: { tournamentId: id },
        orderBy: { userId: 'asc' },
      });
      for (const e of before)
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${e.userId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "Tournament" WHERE "id"=${id}::uuid FOR UPDATE`;
      const t = await tx.tournament.findUnique({
        where: { id },
        include: {
          entries: { include: { user: true }, orderBy: { seed: 'asc' } },
        },
      });
      const [clock] = await tx.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      if (!t || t.status !== 'REGISTRATION' || t.startsAt > clock!.now) return;
      if (t.entries.some((e) => !before.some((b) => b.id === e.id))) return; // registration changed before locks: retry safely
      if (
        hash(t.policy) !== hash(this.policy) ||
        hash(t.admissionPolicy) !== hash(this.admission)
      )
        return;
      if (
        t.entries.length !== t.capacity ||
        t.entries.some((e) => e.user.isGuest || e.user.status !== 'ACTIVE')
      ) {
        await tx.tournament.update({
          where: { id },
          data: { status: 'CANCELLED', completedAt: clock!.now },
        });
        return;
      }
      await tx.tournamentMatch.createMany({
        data: tournamentBracket(t.capacity).map((m) => ({
          id: randomUUID(),
          tournamentId: id,
          round: m.round,
          slot: m.slot,
          leftEntryId: m.leftSeed ? t.entries[m.leftSeed - 1]!.id : null,
          rightEntryId: m.rightSeed ? t.entries[m.rightSeed - 1]!.id : null,
        })),
      });
      await tx.tournament.update({
        where: { id },
        data: { status: 'RUNNING' },
      });
    });
  }
  async ready(p: Principal, matchId: string, body: unknown) {
    parse(z.uuid(), matchId);
    const input = parse(tournamentReadySchema, body);
    this.configured();
    const admission = await this.db.$transaction(async (tx) => {
      const before = await tx.tournamentMatch.findUnique({
        where: { id: matchId },
      });
      if (!before) throw new ApiFailure('MATCH_UNAVAILABLE', 404);
      const entries = await tx.tournamentEntry.findMany({
        where: {
          id: {
            in: [before.leftEntryId, before.rightEntryId].filter(
              (x): x is string => !!x,
            ),
          },
        },
      });
      if (!entries.some((e) => e.userId === p.userId))
        throw new ApiFailure('MATCH_UNAVAILABLE', 404);
      for (const userId of [
        ...new Set([p.userId, ...entries.map((e) => e.userId)]),
      ].sort())
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId}::uuid FOR UPDATE`;
      await lockPrincipal(tx, p);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(42819)::text`;
      await tx.$queryRaw`SELECT "id" FROM "Tournament" WHERE "id"=${before.tournamentId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "TournamentMatch" WHERE "id"=${matchId}::uuid FOR UPDATE`;
      const m = await tx.tournamentMatch.findUniqueOrThrow({
        where: { id: matchId },
        include: { tournament: true },
      });
      if (input.attempt !== m.attempt)
        throw new ApiFailure('STALE_TOURNAMENT_ATTEMPT', 409);
      if (
        m.leftEntryId !== before.leftEntryId ||
        m.rightEntryId !== before.rightEntryId
      )
        throw new ApiFailure('MATCH_CHANGED', 409);
      if (
        m.tournament.status !== 'RUNNING' ||
        m.status === 'COMPLETE' ||
        entries.length !== 2 ||
        hash(m.tournament.policy) !== hash(this.policy) ||
        hash(m.tournament.admissionPolicy) !== hash(this.admission)
      )
        throw new ApiFailure('MATCH_NOT_READY', 409);
      const prior = await tx.tournamentBinding.findUnique({
        where: { matchId_attempt: { matchId, attempt: m.attempt } },
      });
      if (prior) {
        const lobby = await tx.lobby.findUniqueOrThrow({
          where: { id: prior.lobbyId },
        });
        return {
          lobbyId: prior.lobbyId,
          hostId: lobby.hostId,
          gameId: prior.roomId,
        };
      }
      // Every attempt requires fresh consent. Existing table membership must be left explicitly.
      if (
        await tx.lobbySeat.count({
          where: { userId: { in: entries.map((e) => e.userId) } },
        })
      )
        throw new ApiFailure('PLAYER_ALREADY_SEATED', 409);
      await tx.tournamentReady.createMany({
        data: [{ matchId, attempt: m.attempt, userId: p.userId }],
        skipDuplicates: true,
      });
      const count = await tx.tournamentReady.count({
        where: { matchId, attempt: m.attempt },
      });
      if (count !== 2) return null;
      const lobbyId = randomUUID();
      await tx.lobby.create({
        data: {
          id: lobbyId,
          kind: 'PRIVATE',
          capacity: 2,
          hostId: p.userId,
          inviteHash: hash(randomBytes(32).toString('hex')),
          seats: {
            create: entries
              .sort((a, b) => a.seed - b.seed)
              .map((e, seat) => ({ userId: e.userId, seat, ready: true })),
          },
        },
      });
      await tx.tournamentBinding.create({
        data: { lobbyId, matchId, attempt: m.attempt },
      });
      return { lobbyId, hostId: p.userId, gameId: null };
    });
    let gameId = admission?.gameId ?? null;
    if (admission && !gameId && admission.hostId === p.userId) {
      const started = await new MatchSettlementService(
        this.db,
        this.admission,
      ).start(p, { lobbyId: admission.lobbyId, commandId: admission.lobbyId });
      gameId = started.gameId;
    }
    return { recorded: true as const, gameId };
  }
  async ingest(roomId: string) {
    await this.db.$transaction(
      async (tx) => {
        const b = await tx.tournamentBinding.findUnique({
          where: { roomId },
          include: { match: true },
        });
        if (!b) return;
        const entries = await tx.tournamentEntry.findMany({
          where: { id: { in: [b.match.leftEntryId!, b.match.rightEntryId!] } },
          orderBy: { userId: 'asc' },
        });
        for (const e of entries)
          await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${e.userId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "Tournament" WHERE "id"=${b.match.tournamentId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "TournamentMatch" WHERE "id"=${b.matchId}::uuid FOR UPDATE`;
        if (await tx.tournamentResult.findUnique({ where: { roomId } })) return;
        const m = await tx.tournamentMatch.findUniqueOrThrow({
            where: { id: b.matchId },
            include: { tournament: true },
          }),
          result = await tx.gameResult.findUnique({ where: { roomId } });
        if (!result) return;
        if (
          m.status !== 'PLAYING' ||
          m.attempt !== b.attempt ||
          m.tournament.status !== 'RUNNING'
        )
          throw new Error('TOURNAMENT_STATE_MISMATCH');
        const state = await new PokerRoomService(this.db).trustedState(
            tx,
            roomId,
          ),
          allocation = allocatePokerPots(state);
        if (
          state.rulesetVersion !== 'CLASSIC_NLHE_V1' ||
          state.street !== 'COMPLETE' ||
          hash(allocation) !== hash(result.allocation) ||
          entries.length !== 2 ||
          allocation.players.length !== 2 ||
          !allocation.players.every((p) =>
            entries.some((e) => e.userId === p.playerId),
          )
        )
          throw new Error('TOURNAMENT_REPLAY_MISMATCH');
        const userId = tournamentWinner(
            allocation.players.map((p) => ({
              id: p.playerId,
              finalStack: p.finalStack,
            })),
          ),
          winner = entries.find((e) => e.userId === userId)?.id ?? null;
        await tx.tournamentResult.create({
          data: {
            roomId,
            matchId: m.id,
            attempt: b.attempt,
            winnerEntryId: winner,
            allocationHash: hash(allocation),
          },
        });
        if (!winner) {
          await tx.tournamentMatch.update({
            where: { id: m.id },
            data: { status: 'WAITING', attempt: { increment: 1 } },
          });
          return;
        }
        await tx.tournamentMatch.update({
          where: { id: m.id },
          data: { status: 'COMPLETE', winnerEntryId: winner },
        });
        const next = await tx.tournamentMatch.findUnique({
          where: {
            tournamentId_round_slot: {
              tournamentId: m.tournamentId,
              round: m.round + 1,
              slot: Math.floor(m.slot / 2),
            },
          },
        });
        if (next) {
          await tx.tournamentMatch.update({
            where: { id: next.id },
            data:
              m.slot % 2 === 0
                ? { leftEntryId: winner }
                : { rightEntryId: winner },
          });
        } else {
          await tx.tournamentAward.create({
            data: {
              tournamentId: m.tournamentId,
              entryId: winner,
              title: m.tournament.title,
            },
          });
          await tx.tournament.update({
            where: { id: m.tournamentId },
            data: {
              status: 'COMPLETED',
              championEntryId: winner,
              completedAt: new Date(),
            },
          });
        }
      },
      { timeout: 30000 },
    );
    console.info(JSON.stringify({ event: 'tournament.ingest', status: 'ok' }));
  }
  async recover(stopping: () => boolean = () => false) {
    const due = await this.db.tournament.findMany({
      where: {
        status: 'REGISTRATION',
        startsAt: { lte: new Date() },
        policy: { equals: json(this.policy) },
        admissionPolicy: { equals: json(this.admission) },
      },
      take: 20,
      orderBy: { startsAt: 'asc' },
    });
    for (const t of due) {
      if (stopping()) return;
      try {
        await this.startDue(t.id);
      } catch {
        console.warn(
          JSON.stringify({ event: 'tournament.start', status: 'retry' }),
        );
      }
    }
    const pending = await this.db.$queryRaw<
      { roomId: string }[]
    >`SELECT b."roomId" FROM "TournamentBinding" b JOIN "GameResult" g ON g."roomId"=b."roomId" LEFT JOIN "TournamentResult" r ON r."roomId"=b."roomId" WHERE r."roomId" IS NULL ORDER BY g."createdAt" LIMIT 20`;
    for (const b of pending) {
      if (stopping()) return;
      try {
        await this.ingest(b.roomId);
      } catch {
        console.warn(
          JSON.stringify({ event: 'tournament.ingest', status: 'retry' }),
        );
      }
    }
  }
  async replay(p: Principal, id: string, body: unknown) {
    parse(z.uuid(), id);
    const input = parse(tournamentReplaySchema, body);
    return this.db.$transaction(
      async (tx) => {
        await this.admin(tx, p);
        const prior = await tx.tournamentAudit.findUnique({
          where: {
            actorId_commandId: {
              actorId: p.userId,
              commandId: input.commandId,
            },
          },
        });
        if (prior) {
          if (prior.requestHash !== hash({ id, ...input }))
            throw new ApiFailure('IDEMPOTENCY_CONFLICT', 409);
          return prior.result;
        }
        const t = await tx.tournament.findUnique({
          where: { id },
          include: { matches: { include: { results: true } }, award: true },
        });
        if (!t) throw new ApiFailure('TOURNAMENT_UNAVAILABLE', 404);
        let checked = 0;
        for (const m of t.matches)
          for (const r of m.results) {
            const state = await new PokerRoomService(this.db).trustedState(
                tx,
                r.roomId,
              ),
              allocation = allocatePokerPots(state);
            const winner = tournamentWinner(
                allocation.players.map((x) => ({
                  id: x.playerId,
                  finalStack: x.finalStack,
                })),
              ),
              entry = winner
                ? await tx.tournamentEntry.findUnique({
                    where: {
                      tournamentId_userId: { tournamentId: id, userId: winner },
                    },
                  })
                : null;
            if (
              hash(allocation) !== r.allocationHash ||
              r.winnerEntryId !== (entry?.id ?? null)
            )
              throw new Error('TOURNAMENT_AUDIT_MISMATCH');
            checked++;
          }
        const result = {
          reports: await tx.tournamentDispute.findMany({
            where: { tournamentId: id },
            select: { id: true, matchId: true, code: true },
            orderBy: { createdAt: 'asc' },
            take: 100,
          }),
          consistent: true,
          checkedResults: checked,
          awards: t.award ? 1 : 0,
        };
        await tx.tournamentAudit.create({
          data: {
            id: randomUUID(),
            actorId: p.userId,
            commandId: input.commandId,
            tournamentId: id,
            action: 'REPLAY',
            reason: input.reason,
            requestHash: hash({ id, ...input }),
            result,
          },
        });
        return result;
      },
      { timeout: 30000, isolationLevel: 'RepeatableRead' },
    );
  }
  async report(p: Principal, id: string, body: unknown) {
    parse(z.uuid(), id);
    const input = parse(tournamentDisputeSchema, body);
    return this.db.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      const prior = await tx.tournamentDispute.findUnique({
        where: {
          userId_commandId: { userId: p.userId, commandId: input.commandId },
        },
      });
      if (prior) {
        if (
          prior.tournamentId !== id ||
          prior.matchId !== input.matchId ||
          prior.code !== input.code
        )
          throw new ApiFailure('IDEMPOTENCY_CONFLICT', 409);
        return { id: prior.id, recorded: true as const };
      }
      const t = await tx.tournament.findUnique({
          where: { id },
          include: { entries: true },
        }),
        m = await tx.tournamentMatch.findUnique({
          where: { id: input.matchId },
        });
      if (
        !t ||
        !m ||
        m.tournamentId !== id ||
        !t.entries.some(
          (e) =>
            e.userId === p.userId &&
            [m.leftEntryId, m.rightEntryId].includes(e.id),
        )
      )
        throw new ApiFailure('MATCH_UNAVAILABLE', 404);
      const [clock] = await tx.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      if (
        t.status !== 'COMPLETED' ||
        !t.completedAt ||
        clock!.now.getTime() >=
          t.completedAt.getTime() +
            (t.policy as { disputeWindowHours: number }).disputeWindowHours *
              3600000
      )
        throw new ApiFailure('REPORT_WINDOW_CLOSED', 409);
      const report = await tx.tournamentDispute.create({
        data: {
          id: randomUUID(),
          tournamentId: id,
          matchId: m.id,
          userId: p.userId,
          commandId: input.commandId,
          code: input.code,
        },
      });
      return { id: report.id, recorded: true as const };
    });
  }
  async list(p: Principal, query: unknown) {
    const q = parse(tournamentListQuerySchema, query);
    return this.db.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      if (
        q.cursor &&
        !(await tx.tournament.findUnique({ where: { id: q.cursor } }))
      )
        throw new ApiFailure('INVALID_CURSOR', 400);
      const rows = await tx.tournament.findMany({
        orderBy: { id: 'asc' },
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      });
      const items = [];
      for (const t of rows.slice(0, q.limit))
        items.push(await this.view(tx, p, t.id));
      return {
        items,
        nextCursor: rows.length > q.limit ? rows[q.limit - 1]!.id : null,
      };
    });
  }
  async read(p: Principal, id: string) {
    parse(z.uuid(), id);
    return this.db.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      return this.view(tx, p, id);
    });
  }
  private async view(tx: Prisma.TransactionClient, p: Principal, id: string) {
    const t = await tx.tournament.findUnique({
      where: { id },
      include: {
        entries: true,
        matches: {
          include: { ready: true, bindings: true },
          orderBy: [{ round: 'asc' }, { slot: 'asc' }],
        },
      },
    });
    if (!t) throw new ApiFailure('TOURNAMENT_UNAVAILABLE', 404);
    const user = await tx.user.findUniqueOrThrow({ where: { id: p.userId } }),
      own = t.entries.find((e) => e.userId === p.userId),
      seed = (entryId: string | null) =>
        t.entries.find((e) => e.id === entryId)?.seed ?? null;
    const available =
      !!this.policy &&
      !!this.admission &&
      hash(t.policy) === hash(this.policy) &&
      hash(t.admissionPolicy) === hash(this.admission);
    const current = own
      ? t.matches.find(
          (m) =>
            m.status !== 'COMPLETE' &&
            [m.leftEntryId, m.rightEntryId].includes(own.id),
        )
      : null;
    const binding = current?.bindings.find(
      (b) => b.attempt === current.attempt,
    );
    const nextAction =
      t.status === 'CANCELLED'
        ? 'CANCELLED'
        : t.status === 'COMPLETED'
          ? 'COMPLETE'
          : binding?.roomId
            ? 'PLAY'
            : !available || user.isGuest
              ? 'INELIGIBLE'
              : !own
                ? t.status === 'REGISTRATION' &&
                  t.entries.length < t.capacity &&
                  t.startsAt > new Date()
                  ? 'REGISTER'
                  : 'INELIGIBLE'
                : t.status === 'REGISTRATION'
                  ? 'WAIT_START'
                  : binding?.roomId
                    ? 'PLAY'
                    : current?.leftEntryId && current.rightEntryId
                      ? current.ready.some(
                          (r) =>
                            r.attempt === current.attempt &&
                            r.userId === p.userId,
                        ) && !binding
                        ? 'WAIT_OPPONENT'
                        : 'READY'
                      : current
                        ? 'WAIT_OPPONENT'
                        : 'COMPLETE';
    return tournamentViewSchema.parse({
      id: t.id,
      name: t.name,
      status: t.status,
      startsAt: t.startsAt.toISOString(),
      capacity: t.capacity,
      registered: t.entries.length,
      format: 'CLASSIC_HEADS_UP_SINGLE_HAND_V1',
      rulesetVersion: 'CLASSIC_NLHE_V1',
      entryFee: 0,
      handBuyIn: (t.admissionPolicy as { buyIn: number }).buyIn,
      prizeTitle: t.title,
      eligibility: !available
        ? 'CONFIGURATION_REVIEW_REQUIRED'
        : user.isGuest
          ? 'PERMANENT_ACCOUNT_REQUIRED'
          : t.status !== 'REGISTRATION' || t.startsAt <= new Date()
            ? 'CLOSED'
            : t.entries.length >= t.capacity
              ? 'FULL'
              : 'AVAILABLE',
      ownEntry: own?.seed ?? null,
      nextAction,
      matches: t.matches.map((m) => ({
        id: m.id,
        round: m.round,
        slot: m.slot,
        attempt: m.attempt,
        leftSeed: seed(m.leftEntryId),
        rightSeed: seed(m.rightEntryId),
        winnerSeed: seed(m.winnerEntryId),
        status: m.status,
        ownReady: m.ready.some(
          (r) => r.attempt === m.attempt && r.userId === p.userId,
        ),
        gameId:
          own && [m.leftEntryId, m.rightEntryId].includes(own.id)
            ? (m.bindings.find((b) => b.attempt === m.attempt)?.roomId ?? null)
            : null,
      })),
      championSeed: seed(t.championEntryId),
      reportUntil:
        t.completedAt && t.status === 'COMPLETED'
          ? new Date(
              t.completedAt.getTime() +
                (t.policy as { disputeWindowHours: number })
                  .disputeWindowHours *
                  3600000,
            ).toISOString()
          : null,
      standings: t.entries
        .map((e) => ({
          seed: e.seed,
          wins: t.matches.filter((m) => m.winnerEntryId === e.id).length,
          champion: t.championEntryId === e.id,
        }))
        .sort(
          (a, b) =>
            Number(b.champion) - Number(a.champion) ||
            b.wins - a.wins ||
            a.seed - b.seed,
        ),
    });
  }
}
export function startTournamentWorker(service: TournamentService) {
  let closed = false,
    running: Promise<void> | null = null;
  const tick = () => {
    if (closed || running) return;
    running = service
      .recover(() => closed)
      .catch(() =>
        console.warn(
          JSON.stringify({ event: 'tournament.recovery', status: 'retry' }),
        ),
      )
      .finally(() => {
        running = null;
      });
  };
  const timer = setInterval(tick, 1000);
  timer.unref();
  tick();
  return async () => {
    closed = true;
    clearInterval(timer);
    await running;
  };
}
@Controller('v1/tournaments')
export class TournamentController {
  constructor(
    @Inject('AUTH_SERVICE') readonly auth: AuthService | null,
    @Inject('TOURNAMENT_SERVICE') readonly service: TournamentService | null,
  ) {}
  private async principal(req: Request) {
    if (!this.auth || !this.service)
      throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    return this.auth.authenticate(req.headers.authorization);
  }
  @Get() async list(@Req() r: Request, @Query() q: unknown) {
    const p = await this.principal(r);
    return this.service!.list(p, q);
  }
  @Get(':id') async read(@Req() r: Request, @Param('id') id: string) {
    const p = await this.principal(r);
    return this.service!.read(p, id);
  }
  @Post() @HttpCode(200) async create(@Req() r: Request, @Body() b: unknown) {
    const p = await this.principal(r);
    return this.service!.create(p, b);
  }
  @Post(':id/register') @HttpCode(200) async register(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const p = await this.principal(r);
    return this.service!.register(p, id, b);
  }
  @Post('matches/:id/ready') @HttpCode(200) async ready(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const p = await this.principal(r);
    return this.service!.ready(p, id, b);
  }
  @Post(':id/reports') @HttpCode(200) async report(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const p = await this.principal(r);
    return this.service!.report(p, id, b);
  }
  @Post(':id/replay') @HttpCode(200) async replay(
    @Req() r: Request,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const p = await this.principal(r);
    return this.service!.replay(p, id, b);
  }
}
