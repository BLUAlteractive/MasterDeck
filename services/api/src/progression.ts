import { Controller, Get, Inject, Req } from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { advanceProgress, progressWindow } from '@deckforge/card-domain';
import {
  allocatePokerPots,
  evaluateSevenCardHand,
} from '@deckforge/game-poker';
import type { Prisma, PrismaClient } from '@deckforge/database';
import {
  progressionPolicySchema,
  progressGoalSchema,
  progressViewSchema,
  missionsViewSchema,
  type ProgressionPolicy,
  type ProgressGoal,
} from '@deckforge/contracts';
import { PokerRoomService } from './rooms/service';
import { SpadesRoomService } from './rooms/spades';
import { hash, json, lockPrincipal } from './rooms/shared';
import { ApiFailure } from './auth/errors';
import type { AuthService, Principal } from './auth/service';
export type ProgressSourceKind = 'POKER' | 'SPADES' | 'FUSION';
type Fact = { userId: string; kinds: string[] };
export async function applyProgressGoal(
  tx: Prisma.TransactionClient,
  userId: string,
  goalId: string,
  goal: ProgressGoal,
  event: { id: string; kind: string; occurredAt: Date },
) {
  if (event.kind !== goal.kind) return;
  const windowKey = progressWindow(goal, event.occurredAt);
  if (windowKey === null) return;
  const key = { userId, goalId, windowKey };
  const counter = await tx.progressCounter.findUnique({
    where: { userId_goalId_windowKey: key },
  });
  if ((counter?.count ?? 0) >= goal.target) return;
  if (
    await tx.progressConsumption.findUnique({
      where: {
        eventId_goalId_windowKey: { eventId: event.id, goalId, windowKey },
      },
    })
  )
    return;
  const next = advanceProgress(counter?.count ?? 0, goal.target, false);
  await tx.progressConsumption.create({
    data: { eventId: event.id, goalId, windowKey },
  });
  await tx.progressCounter.upsert({
    where: { userId_goalId_windowKey: key },
    create: { ...key, count: next.count },
    update: { count: next.count },
  });
  if (next.award)
    await tx.progressAward.create({
      data: { id: randomUUID(), ...key, badge: goal.badge },
    });
}
export class ProgressionService {
  constructor(
    readonly db: PrismaClient,
    readonly policy: ProgressionPolicy | null = null,
  ) {}
  async ingest(kind: ProgressSourceKind, sourceId: string) {
    if (!this.policy)
      throw new ApiFailure('PROGRESSION_POLICY_NOT_CONFIGURED', 503);
    const policy = progressionPolicySchema.parse(this.policy),
      key = kind + ':' + sourceId;
    return this.db.$transaction(
      async (tx) => {
        // Serialize sources before sorted user locks; no game/inventory writer acquires this mutex.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key},7943))::text`;
        const prior = await tx.progressSource.findUnique({ where: { key } });
        if (prior) return { replayed: true };
        let facts: Fact[],
          occurredAt: Date,
          commands = 0;
        if (kind === 'POKER') {
          const result = await tx.gameResult.findUnique({
            where: { roomId: sourceId },
          });
          if (!result) throw new ApiFailure('RESULT_NOT_READY', 409);
          const state = await new PokerRoomService(this.db).trustedState(
            tx,
            sourceId,
          );
          if (
            state.street !== 'COMPLETE' ||
            state.stateVersion !== result.stateVersion ||
            hash(allocatePokerPots(state)) !== hash(result.allocation)
          )
            throw new Error('RESULT_INTEGRITY');
          const allocation = allocatePokerPots(state);
          commands = await tx.gameEvent.count({
            where: { roomId: sourceId, source: 'PLAYER' },
          });
          facts = state.players.map((p) => ({
            userId: p.id,
            kinds: [
              'POKER_COMPLETED',
              ...(allocation.pots.some((pot) => pot.winners.includes(p.id))
                ? ['POKER_WIN']
                : []),
              ...(!p.folded &&
              state.completionReason === 'SHOWDOWN' &&
              evaluateSevenCardHand([...p.hole, ...state.board]).rank
                .category === 'FULL_HOUSE'
                ? ['POKER_FULL_HOUSE']
                : []),
            ],
          }));
          occurredAt = result.createdAt;
        } else if (kind === 'SPADES') {
          const result = await tx.spadesResult.findUnique({
            where: { roomId: sourceId },
          });
          if (!result) throw new ApiFailure('RESULT_NOT_READY', 409);
          const state = await new SpadesRoomService(this.db).trustedState(
            tx,
            sourceId,
          );
          if (
            state.phase !== 'MATCH_COMPLETE' ||
            state.stateVersion !== result.stateVersion ||
            state.winner !== result.winner
          )
            throw new Error('RESULT_INTEGRITY');
          facts = state.deal.players.map((userId, seat) => ({
            userId,
            kinds: [
              'SPADES_COMPLETED',
              ...(seat % 2 === result.winner ? ['SPADES_WIN'] : []),
            ],
          }));
          commands = await tx.spadesEvent.count({
            where: { roomId: sourceId, actorUserId: { not: null } },
          });
          occurredAt = result.createdAt;
        } else {
          const job = await tx.fusionJob.findUnique({
            where: { id: sourceId },
            include: { ingredients: true },
          });
          if (!job || job.ingredients.length !== 5)
            throw new ApiFailure('RESULT_NOT_READY', 409);
          facts = [{ userId: job.ownerId, kinds: ['FUSION_COMPLETED'] }];
          occurredAt = job.createdAt;
        }
        const ids = facts.map((f) => f.userId).sort();
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=ANY(${ids}::uuid[]) ORDER BY "id" FOR UPDATE`;
        const users = await tx.user.findMany({
          where: {
            id: { in: ids },
            status: 'ACTIVE',
            ...(policy.requirePermanent ? { isGuest: false } : {}),
          },
        });
        await tx.progressSource.create({
          data: { key, kind, sourceId, policy: json(policy) },
        });
        for (const fact of facts) {
          if (
            !users.some((u) => u.id === fact.userId) ||
            (kind !== 'FUSION' &&
              (users.length - 1 < policy.minimumOpponents ||
                commands < policy.minimumPlayerCommands))
          )
            continue;
          for (const eventKind of fact.kinds) {
            const event = await tx.progressEvent.create({
              data: {
                id: randomUUID(),
                sourceKey: key,
                userId: fact.userId,
                kind: eventKind,
                occurredAt,
              },
            });
            for (const goal of policy.goals) {
              const goalId = policy.version + ':' + goal.id;
              await tx.progressGoal.createMany({
                data: [
                  {
                    id: goalId,
                    definition: json(goal),
                    policyHash: hash(policy),
                  },
                ],
                skipDuplicates: true,
              });
              const existing = await tx.progressGoal.findUniqueOrThrow({
                where: { id: goalId },
              });
              if (existing.policyHash !== hash(policy))
                throw new ApiFailure('PROGRESSION_POLICY_CHANGED', 409);
              await applyProgressGoal(tx, fact.userId, goalId, goal, event);
            }
          }
        }
        return { replayed: false };
      },
      { timeout: 30000, maxWait: 15000 },
    );
  }
  async recover(stopping: () => boolean = () => false) {
    if (!this.policy) return;
    const poker = await this.db.$queryRaw<
      { id: string }[]
    >`SELECT "roomId" AS id FROM "GameResult" r WHERE NOT EXISTS(SELECT 1 FROM "ProgressSource" p WHERE p."kind"='POKER' AND p."sourceId"=r."roomId") ORDER BY r."createdAt",r."roomId" LIMIT 20`;
    const spades = await this.db.$queryRaw<
      { id: string }[]
    >`SELECT "roomId" AS id FROM "SpadesResult" r WHERE NOT EXISTS(SELECT 1 FROM "ProgressSource" p WHERE p."kind"='SPADES' AND p."sourceId"=r."roomId") ORDER BY r."createdAt",r."roomId" LIMIT 20`;
    const fusion = await this.db.$queryRaw<
      { id: string }[]
    >`SELECT r."id" FROM "FusionJob" r WHERE NOT EXISTS(SELECT 1 FROM "ProgressSource" p WHERE p."kind"='FUSION' AND p."sourceId"=r."id") ORDER BY r."createdAt",r."id" LIMIT 20`;
    for (const [kind, rows] of [
      ['POKER', poker],
      ['SPADES', spades],
      ['FUSION', fusion],
    ] as const)
      for (const row of rows) {
        if (stopping()) return;
        try {
          await this.ingest(kind, row.id);
        } catch {
          console.warn(
            JSON.stringify({ event: 'progression.source', status: 'retry' }),
          );
        }
      }
  }
  async recoverGoals(stopping: () => boolean = () => false) {
    if (!this.policy) return;
    const policy = progressionPolicySchema.parse(this.policy);
    for (const goal of policy.goals) {
      if (stopping()) return;
      const goalId = policy.version + ':' + goal.id;
      await this.db.progressGoal.createMany({
        data: [
          { id: goalId, definition: json(goal), policyHash: hash(policy) },
        ],
        skipDuplicates: true,
      });
      const stored = await this.db.progressGoal.findUniqueOrThrow({
        where: { id: goalId },
      });
      if (stored.policyHash !== hash(policy))
        throw new ApiFailure('PROGRESSION_POLICY_CHANGED', 409);
      const rows = await this.db.$queryRaw<
        { id: string; userId: string; kind: string; occurredAt: Date }[]
      >`SELECT e."id",e."userId",e."kind",e."occurredAt" FROM "ProgressEvent" e JOIN "ProgressSource" s ON s."key"=e."sourceKey" JOIN "ProgressGoal" g ON g."id"=${goalId} WHERE e."kind"=${goal.kind} AND (s."policy"->>'requirePermanent')::boolean=${policy.requirePermanent} AND (s."policy"->>'minimumOpponents')::integer=${policy.minimumOpponents} AND (s."policy"->>'minimumPlayerCommands')::integer=${policy.minimumPlayerCommands} AND progress_window(g."definition",e."occurredAt") IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "ProgressConsumption" c WHERE c."eventId"=e."id" AND c."goalId"=g."id" AND c."windowKey"=progress_window(g."definition",e."occurredAt")) AND NOT EXISTS(SELECT 1 FROM "ProgressAward" a WHERE a."userId"=e."userId" AND a."goalId"=g."id" AND a."windowKey"=progress_window(g."definition",e."occurredAt")) ORDER BY e."occurredAt",e."id" LIMIT 100`;
      for (const event of rows) {
        if (stopping()) return;
        await this.db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${event.userId}::uuid FOR UPDATE`;
          if (
            (await tx.user.findUniqueOrThrow({ where: { id: event.userId } }))
              .status !== 'ACTIVE'
          )
            return;
          await applyProgressGoal(tx, event.userId, goalId, goal, event);
        });
      }
    }
  }
  async missions(p: Principal) {
    return this.db.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      const [clock] = await tx.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      const at = clock!.now,
        missions = [];
      for (const goal of this.policy?.goals ?? []) {
        if (goal.window === 'LIFETIME') continue;
        const windowKey = progressWindow(goal, at);
        if (windowKey === null) continue;
        const goalId = this.policy!.version + ':' + goal.id;
        const counter = await tx.progressCounter.findUnique({
          where: {
            userId_goalId_windowKey: { userId: p.userId, goalId, windowKey },
          },
        });
        missions.push({
          goalId,
          definition: goal,
          windowKey,
          progress: counter?.count ?? 0,
          completed: (counter?.count ?? 0) >= goal.target,
        });
      }
      return missionsViewSchema.parse({
        available: this.policy !== null,
        asOf: at.toISOString(),
        missions,
      });
    });
  }
  async view(p: Principal) {
    return this.db.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      const counters = await tx.progressCounter.findMany({
          where: { userId: p.userId },
          include: { goal: true },
          orderBy: { goalId: 'asc' },
          take: 100,
        }),
        awards = await tx.progressAward.findMany({
          where: { userId: p.userId },
          orderBy: { awardedAt: 'desc' },
          take: 100,
        });
      return progressViewSchema.parse({
        available: this.policy !== null,
        goals: counters.map((c) => ({
          id: c.goalId,
          definition: progressGoalSchema.parse(c.goal.definition),
          count: c.count,
          windowKey: c.windowKey,
          awarded: awards.some(
            (a) => a.goalId === c.goalId && a.windowKey === c.windowKey,
          ),
        })),
        awards: awards.map((a) => ({
          id: a.id,
          goalId: a.goalId,
          windowKey: a.windowKey,
          badge: a.badge,
          awardedAt: a.awardedAt.toISOString(),
        })),
      });
    });
  }
}
export function startProgressWorker(service: ProgressionService) {
  let running: Promise<void> | null = null,
    closed = false;
  const tick = () => {
    if (closed || running) return;
    running = service
      .recover(() => closed)
      .then(() => service.recoverGoals(() => closed))
      .catch(() => {
        console.warn(
          JSON.stringify({ event: 'progression.worker', status: 'retry' }),
        );
      })
      .finally(() => {
        running = null;
      });
  };
  const timer = setInterval(tick, 5000);
  timer.unref();
  tick();
  return async () => {
    closed = true;
    clearInterval(timer);
    await running;
  };
}
@Controller('v1/progression')
export class ProgressionController {
  constructor(
    @Inject('AUTH_SERVICE') readonly auth: AuthService | null,
    @Inject('PROGRESSION_POLICY') readonly policy: ProgressionPolicy | null,
  ) {}
  @Get('missions') async missions(@Req() req: Request) {
    if (!this.auth) throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    return new ProgressionService(this.auth.database, this.policy).missions(
      await this.auth.authenticate(req.headers.authorization),
    );
  }
  @Get() async view(@Req() req: Request) {
    if (!this.auth) throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    return new ProgressionService(this.auth.database, this.policy).view(
      await this.auth.authenticate(req.headers.authorization),
    );
  }
}
