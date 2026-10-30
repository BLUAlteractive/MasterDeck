import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { progressWindow } from '@deckforge/card-domain';
import {
  accessiblePolicySchema,
  accessibleStartSchema,
  accessibleCommandSchema,
  accessibleStartResponseSchema,
  accessibleReceiptSchema,
  accessibleViewSchema,
  progressGoalSchema,
  type AccessiblePolicy,
} from '@deckforge/contracts';
import type { Prisma, PrismaClient } from '@deckforge/database';
import type { AuthService, Principal } from './auth/service';
import { ApiFailure } from './auth/errors';
import { hash, json, lockPrincipal } from './rooms/shared';
import { moveRestrictedCurrency } from './wallets';
async function candidates(
  tx: Prisma.TransactionClient,
  e: {
    id: string;
    userId: string;
    startedAt: Date;
    expiresAt: Date;
    definition: unknown;
    policy: unknown;
  },
) {
  const goal = progressGoalSchema.parse(e.definition),
    policy = accessiblePolicySchema.parse(e.policy);
  return tx.$queryRaw<
    { id: string; sourceKey: string }[]
  >`SELECT p."id",p."sourceKey" FROM "ProgressEvent" p JOIN "ProgressSource" s ON s."key"=p."sourceKey" WHERE p."userId"=${e.userId}::uuid AND p."kind"=${goal.kind} AND p."occurredAt">${e.startedAt} AND p."occurredAt"<${e.expiresAt} AND (s."policy"->>'requirePermanent')::boolean=${policy.requirePermanent} AND (s."policy"->>'minimumOpponents')::integer=${policy.minimumOpponents} AND (s."policy"->>'minimumPlayerCommands')::integer=${policy.minimumPlayerCommands} AND NOT EXISTS(SELECT 1 FROM "AccessibleQuestFact" f WHERE f."userId"=p."userId" AND f."sourceKey"=p."sourceKey") ORDER BY p."occurredAt",p."id" LIMIT ${goal.target}`;
}
function endWindow(
  goal: ReturnType<typeof progressGoalSchema.parse>,
  at: Date,
) {
  let end = new Date(goal.endsAt!);
  if (goal.window === 'DAILY') {
    const d = new Date(at);
    d.setUTCHours(24, 0, 0, 0);
    if (d < end) end = d;
  }
  if (goal.window === 'WEEKLY') {
    const d = new Date(at);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + 7 - ((d.getUTCDay() + 6) % 7));
    if (d < end) end = d;
  }
  return end;
}
export class AccessibleQuestService {
  constructor(
    readonly db: PrismaClient,
    readonly policy: AccessiblePolicy | null = null,
  ) {}
  async start(p: Principal, body: unknown) {
    const input = accessibleStartSchema.safeParse(body);
    if (!input.success) throw new ApiFailure('INVALID_REQUEST', 400);
    if (!this.policy)
      throw new ApiFailure('ACCESSIBLE_POLICY_NOT_CONFIGURED', 503);
    const policy = accessiblePolicySchema.parse(this.policy);
    return this.db.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      const key = {
        userId: p.userId,
        operation: 'ACCESSIBLE_START',
        key: input.data.commandId,
      };
      const prior = await tx.operationRecord.findUnique({
        where: { userId_operation_key: key },
      });
      if (prior) {
        if (prior.requestHash !== hash(input.data))
          throw new ApiFailure('IDEMPOTENCY_CONFLICT', 409);
        return accessibleStartResponseSchema.parse(prior.result);
      }
      const config = policy.goals.find((g) => g.goalId === input.data.goalId),
        stored = config
          ? await tx.progressGoal.findUnique({ where: { id: config.goalId } })
          : null;
      if (!config || !stored) throw new ApiFailure('QUEST_UNAVAILABLE', 404);
      const goal = progressGoalSchema.parse(stored.definition);
      if (
        goal.window === 'LIFETIME' ||
        goal.target > 1000 ||
        !['POKER_COMPLETED', 'SPADES_COMPLETED', 'FUSION_COMPLETED'].includes(
          goal.kind,
        )
      )
        throw new ApiFailure('QUEST_UNAVAILABLE', 404);
      if (
        policy.requirePermanent &&
        (await tx.user.findUniqueOrThrow({ where: { id: p.userId } })).isGuest
      )
        throw new ApiFailure('PERMANENT_ACCOUNT_REQUIRED', 403);
      const [clock] = await tx.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      const at = clock!.now,
        windowKey = progressWindow(goal, at);
      if (!windowKey) throw new ApiFailure('QUEST_UNAVAILABLE', 404);
      await tx.accessibleQuestEnrollment.updateMany({
        where: { userId: p.userId, status: 'ACTIVE', expiresAt: { lte: at } },
        data: { status: 'EXPIRED', version: { increment: 1 } },
      });
      const old = await tx.accessibleQuestEnrollment.findUnique({
        where: {
          userId_goalId_windowKey: {
            userId: p.userId,
            goalId: config.goalId,
            windowKey,
          },
        },
      });
      let enrollmentId: string;
      if (old) {
        if (old.status === 'CANCELLED' || old.status === 'EXPIRED')
          throw new ApiFailure('QUEST_CLOSED', 409);
        enrollmentId = old.id;
      } else {
        if (
          await tx.accessibleQuestEnrollment.count({
            where: { userId: p.userId, status: 'ACTIVE' },
          })
        )
          throw new ApiFailure('ONE_ACTIVE_QUEST', 409);
        enrollmentId = randomUUID();
        await tx.accessibleQuestEnrollment.create({
          data: {
            id: enrollmentId,
            userId: p.userId,
            goalId: config.goalId,
            windowKey,
            definition: json(goal),
            policy: json(policy),
            startedAt: at,
            expiresAt: endWindow(goal, at),
          },
        });
      }
      const result = { enrollmentId };
      await tx.operationRecord.create({
        data: { ...key, requestHash: hash(input.data), result },
      });
      return accessibleStartResponseSchema.parse(result);
    });
  }
  async claim(p: Principal, body: unknown) {
    const parsed = accessibleCommandSchema.safeParse(body);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    const input = parsed.data;
    return this.db.$transaction(
      async (tx) => {
        await lockPrincipal(tx, p);
        const scope = {
          userId: p.userId,
          operation: 'ACCESSIBLE_CLAIM',
          key: input.commandId,
        };
        const replay = await tx.operationRecord.findUnique({
          where: { userId_operation_key: scope },
        });
        if (replay) {
          if (replay.requestHash !== hash(input))
            throw new ApiFailure('IDEMPOTENCY_CONFLICT', 409);
          return accessibleReceiptSchema.parse(replay.result);
        }
        const e = await tx.accessibleQuestEnrollment.findUnique({
          where: { id: input.enrollmentId },
          include: { completion: true },
        });
        if (!e || e.userId !== p.userId)
          throw new ApiFailure('QUEST_UNAVAILABLE', 404);
        let receipt;
        if (e.completion)
          receipt = accessibleReceiptSchema.parse(e.completion.receipt);
        else {
          if (
            !this.policy ||
            hash(accessiblePolicySchema.parse(this.policy)) !== hash(e.policy)
          )
            throw new ApiFailure('ACCESSIBLE_POLICY_CHANGED', 409);
          const policy = accessiblePolicySchema.parse(e.policy),
            config = policy.goals.find((g) => g.goalId === e.goalId)!;
          const [clock] = await tx.$queryRaw<
            { now: Date; ledgerTime: Date }[]
          >`SELECT clock_timestamp() AS now,transaction_timestamp() AS "ledgerTime"`;
          if (e.status !== 'ACTIVE' || clock!.now >= e.expiresAt)
            throw new ApiFailure('QUEST_CLOSED', 409);
          const goal = progressGoalSchema.parse(e.definition),
            facts = await candidates(tx, e);
          if (facts.length !== goal.target)
            throw new ApiFailure('QUEST_INCOMPLETE', 409);
          const [earned] = await tx.$queryRaw<
            { amount: bigint }[]
          >`SELECT COALESCE(sum(e."amount"),0)::bigint AS amount FROM "RestrictedEntry" e JOIN "RestrictedAccount" a ON a."id"=e."accountId" JOIN "RestrictedTransfer" t ON t."id"=e."transferId" WHERE a."userId"=${p.userId}::uuid AND t."currency"='TRAIL_CREDITS' AND t."purpose" IN ('EARN_ACTIVITY','EARN_ACCESSIBLE_QUEST') AND e."amount">0 AND t."createdAt">=(date_trunc('day',transaction_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AND t."createdAt"<(date_trunc('day',transaction_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')+interval '1 day'`;
          if (
            earned!.amount + BigInt(config.trailCredits) >
            BigInt(policy.maxTrailPerDay)
          )
            throw new ApiFailure('DAILY_TRAIL_CAP', 422);
          const id = randomUUID();
          await tx.accessibleQuestFact.createMany({
            data: facts.map((f) => ({
              userId: p.userId,
              sourceKey: f.sourceKey,
              eventId: f.id,
              enrollmentId: e.id,
            })),
          });
          const transfer = await moveRestrictedCurrency(tx, {
            userId: p.userId,
            currency: 'TRAIL_CREDITS',
            purpose: 'EARN_ACCESSIBLE_QUEST',
            amount: BigInt(config.trailCredits),
            sourceKey: 'accessible:' + id,
            operatorId: 'accessible-quest',
            proofReference: id,
            policyVersion: policy.version,
          });
          receipt = accessibleReceiptSchema.parse({
            id,
            enrollmentId: e.id,
            trailCredits: String(config.trailCredits),
            transferId: transfer.transferId,
            completedAt: clock!.ledgerTime.toISOString(),
            pressProof: {
              kind: 'ACCESSIBLE_QUEST',
              equivalencePlanId: config.equivalencePlanId,
              recipeId: config.pressRecipeId,
              status: 'AWAITING_PRESS_INTEGRATION',
            },
          });
          await tx.accessibleQuestCompletion.create({
            data: {
              id,
              enrollmentId: e.id,
              transferId: transfer.transferId,
              receipt: json(receipt),
            },
          });
          await tx.accessibleQuestEnrollment.update({
            where: { id: e.id },
            data: { status: 'COMPLETED', version: { increment: 1 } },
          });
        }
        await tx.operationRecord.create({
          data: { ...scope, requestHash: hash(input), result: json(receipt) },
        });
        return receipt;
      },
      { timeout: 15000, maxWait: 15000 },
    );
  }
  async cancel(p: Principal, body: unknown) {
    const input = accessibleCommandSchema.safeParse(body);
    if (!input.success) throw new ApiFailure('INVALID_REQUEST', 400);
    return this.db.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      const e = await tx.accessibleQuestEnrollment.findUnique({
        where: { id: input.data.enrollmentId },
      });
      if (!e || e.userId !== p.userId)
        throw new ApiFailure('QUEST_UNAVAILABLE', 404);
      if (e.status === 'COMPLETED') throw new ApiFailure('QUEST_CLOSED', 409);
      if (e.status === 'ACTIVE')
        await tx.accessibleQuestEnrollment.update({
          where: { id: e.id },
          data: { status: 'CANCELLED', version: { increment: 1 } },
        });
      return accessibleStartResponseSchema.parse({ enrollmentId: e.id });
    });
  }
  async view(p: Principal) {
    return this.db.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      const [clock] = await tx.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      const quests = [];
      for (const config of this.policy?.goals ?? []) {
        const stored = await tx.progressGoal.findUnique({
          where: { id: config.goalId },
        });
        if (!stored) continue;
        const definition = progressGoalSchema.parse(stored.definition);
        const windowKey = progressWindow(definition, clock!.now);
        if (!windowKey) continue;
        const e = await tx.accessibleQuestEnrollment.findFirst({
          where: { userId: p.userId, goalId: config.goalId, windowKey },
          orderBy: { startedAt: 'desc' },
          include: { completion: true, facts: true },
        });
        const displayed = e
          ? accessiblePolicySchema
              .parse(e.policy)
              .goals.find((g) => g.goalId === e.goalId)!
          : config;
        quests.push({
          goalId: config.goalId,
          definition,
          trailCredits: String(displayed.trailCredits),
          equivalencePlanId: displayed.equivalencePlanId,
          pressRecipeId: displayed.pressRecipeId,
          enrollment: e
            ? {
                id: e.id,
                status: e.status,
                paused: hash(e.policy) !== hash(this.policy),
                progress: e.completion
                  ? e.facts.length
                  : (await candidates(tx, e)).length,
                expiresAt: e.expiresAt.toISOString(),
                receipt: e.completion?.receipt ?? null,
              }
            : null,
        });
      }
      return accessibleViewSchema.parse({
        available: this.policy !== null,
        quests,
      });
    });
  }
}
@Controller('v1/accessibility/quests')
export class AccessibleQuestController {
  constructor(
    @Inject('AUTH_SERVICE') readonly auth: AuthService | null,
    @Inject('ACCESSIBLE_POLICY') readonly policy: AccessiblePolicy | null,
  ) {}
  private async context(req: Request) {
    if (!this.auth) throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    return {
      p: await this.auth.authenticate(req.headers.authorization),
      service: new AccessibleQuestService(this.auth.database, this.policy),
    };
  }
  @Get() async view(@Req() req: Request) {
    const { p, service } = await this.context(req);
    return service.view(p);
  }
  @Post('start') @HttpCode(200) async start(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const { p, service } = await this.context(req);
    return service.start(p, body);
  }
  @Post('claim') @HttpCode(200) async claim(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const { p, service } = await this.context(req);
    const result = await service.claim(p, body);
    console.info(
      JSON.stringify({ event: 'accessible.quest.claim', status: 'ok' }),
    );
    return result;
  }
  @Post('cancel') @HttpCode(200) async cancel(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const { p, service } = await this.context(req);
    return service.cancel(p, body);
  }
}
