import { randomUUID } from 'node:crypto';
import { z } from 'zod';
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
import type { Prisma, PrismaClient } from '@deckforge/database';
import {
  activityPolicySchema,
  activityIngestSchema,
  activityIngestReceiptSchema,
  activitySummarySchema,
  type ActivityPolicy,
} from '@deckforge/contracts';
import {
  activityRejection,
  activityCreditTarget,
} from '@deckforge/card-domain';
import type { AuthService, Principal } from '../auth/service';
import { ApiFailure } from '../auth/errors';
import { hash, json, lockPrincipal } from '../rooms/shared';
import { moveRestrictedCurrency } from '../wallets';
const verifiedRecord = z
  .object({
    source: z.enum(['HEALTHKIT', 'HEALTH_CONNECT']),
    recordId: z.string().min(1).max(200),
    revision: z.number().int().min(1),
    start: z.iso.datetime(),
    end: z.iso.datetime(),
    steps: z.number().int().min(0).max(200000),
    manual: z.boolean(),
    deleted: z.boolean(),
  })
  .strict();
const packet = z
  .object({
    userId: z.uuid(),
    proofId: z.string().min(1).max(200),
    records: z.array(verifiedRecord).min(1).max(1000),
  })
  .strict();
/** Server-owned verification port. No production implementation is supplied: native read JSON,
 * device attestation alone or a client-entered count is never accepted as trusted step proof. */
export interface ActivityVerifier {
  verify(evidence: string, userId: string): Promise<unknown>;
}
export type PressActivityPort = (
  tx: Prisma.TransactionClient,
  userId: string,
  records: readonly { id: string; steps: number; start: Date; end: Date }[],
) => Promise<{ jobId: string; units: number } | null>;
export type ActivityConfig = {
  policy: ActivityPolicy;
  verifier: ActivityVerifier;
  allocatePress?: PressActivityPort;
};
export class ActivityService {
  constructor(
    readonly db: PrismaClient,
    readonly config: ActivityConfig | null = null,
  ) {
    if (config) activityPolicySchema.parse(config.policy);
  }
  async summary(p: Principal) {
    return this.db.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      const day = new Date().toISOString().slice(0, 10),
        row = await tx.activityDay.findUnique({
          where: { userId_day: { userId: p.userId, day } },
        }),
        choice = await tx.privacyChoice.findUnique({
          where: { userId: p.userId },
        }),
        policy = row
          ? activityPolicySchema.parse(row.policy)
          : (this.config?.policy ?? null);
      return activitySummarySchema.parse({
        available: !!this.config,
        consented: choice?.activityUpload ?? false,
        day,
        acceptedSteps: row?.acceptedSteps ?? 0,
        trailCreditsGranted: String(row?.grantedCredits ?? 0),
        reviewRequired:
          (await tx.activityReview.count({ where: { userId: p.userId } })) > 0,
        policy: policy
          ? {
              version: policy.version,
              stepsPerCredit: policy.stepsPerCredit,
              dailyCreditCap: policy.dailyCreditCap,
            }
          : null,
      });
    });
  }
  async ingest(p: Principal, body: unknown) {
    const input = activityIngestSchema.safeParse(body);
    if (!input.success) throw new ApiFailure('INVALID_REQUEST', 400);
    if (!this.config)
      throw new ApiFailure('ACTIVITY_VERIFIER_NOT_CONFIGURED', 503);
    // Consent is checked again under lock after external verification, before any persisted grant.
    if (
      !(await this.db.privacyChoice.findUnique({ where: { userId: p.userId } }))
        ?.activityUpload
    )
      throw new ApiFailure('ACTIVITY_CONSENT_REQUIRED', 403);
    const checked = packet.safeParse(
      await this.config.verifier.verify(input.data.evidence, p.userId),
    );
    if (!checked.success || checked.data.userId !== p.userId)
      throw new ApiFailure('UNVERIFIED_ACTIVITY', 422);
    const proof = checked.data,
      proofKey = hash({ userId: p.userId, proofId: proof.proofId }),
      digest = hash(proof);
    const result = await this.db.$transaction(
      async (tx) => {
        await lockPrincipal(tx, p);
        if (
          !(await tx.privacyChoice.findUnique({ where: { userId: p.userId } }))
            ?.activityUpload
        )
          throw new ApiFailure('ACTIVITY_CONSENT_REQUIRED', 403);
        const operation = {
          userId: p.userId,
          operation: 'ACTIVITY_INGEST',
          key: input.data.commandId,
        };
        const prior = await tx.operationRecord.findUnique({
          where: { userId_operation_key: operation },
        });
        if (prior) {
          if (prior.requestHash !== hash(input.data))
            throw new ApiFailure('IDEMPOTENCY_CONFLICT', 409);
          return activityIngestReceiptSchema.parse(prior.result);
        }
        const original = await tx.activityBatch.findUnique({
          where: { userId_proofKey: { userId: p.userId, proofKey } },
        });
        if (original) {
          if (original.requestHash !== digest)
            throw new ApiFailure('ACTIVITY_SOURCE_CONFLICT', 409);
          return activityIngestReceiptSchema.parse(original.result);
        }
        if (await tx.activityReview.count({ where: { userId: p.userId } }))
          throw new ApiFailure('ACTIVITY_REVIEW_REQUIRED', 409);
        const [clock] = await tx.$queryRaw<
            { now: Date }[]
          >`SELECT clock_timestamp() AS now`,
          now = clock!.now;
        const withdrawal = await tx.privacyConsent.findFirst({
          where: {
            userId: p.userId,
            purpose: 'ACTIVITY_UPLOAD',
            enabled: false,
          },
          orderBy: { createdAt: 'desc' },
        });
        const id = randomUUID(),
          accepted: { id: string; steps: number; start: Date; end: Date }[] =
            [],
          days = new Set<string>();
        let duplicates = 0,
          rejected = 0,
          reviewRequired = false;
        // Deferred FKs allow sources and allocations to reference their final immutable receipt.
        for (const r of [...proof.records].sort(
          (a, b) =>
            a.start.localeCompare(b.start) ||
            a.end.localeCompare(b.end) ||
            a.source.localeCompare(b.source) ||
            a.recordId.localeCompare(b.recordId),
        )) {
          const sourceKey = hash({
              userId: p.userId,
              source: r.source,
              recordId: r.recordId,
            }),
            requestHash = hash(r),
            old = await tx.activitySource.findUnique({
              where: { userId_sourceKey: { userId: p.userId, sourceKey } },
            });
          if (old) {
            if (
              r.revision < old.revision ||
              (r.revision === old.revision && old.requestHash === requestHash)
            ) {
              duplicates++;
              continue;
            }
            const existing = await tx.activityReview.findUnique({
              where: {
                sourceId_revision: { sourceId: old.id, revision: r.revision },
              },
            });
            if (existing && existing.requestHash !== requestHash)
              throw new ApiFailure('ACTIVITY_SOURCE_CONFLICT', 409);
            if (!existing)
              await tx.activityReview.create({
                data: {
                  id: randomUUID(),
                  userId: p.userId,
                  sourceId: old.id,
                  revision: r.revision,
                  requestHash,
                  stepAdjustment: (r.deleted ? 0 : r.steps) - old.acceptedSteps,
                },
              });
            reviewRequired = true;
            continue;
          }
          const start = new Date(r.start),
            end = new Date(r.end),
            day = r.start.slice(0, 10);
          const dayRecord = await tx.activityDay.findUnique({
            where: { userId_day: { userId: p.userId, day } },
          });
          const policy = dayRecord
            ? activityPolicySchema.parse(dayRecord.policy)
            : this.config!.policy;
          const overlaps = await tx.activitySource.findMany({
            where: {
              userId: p.userId,
              acceptedSteps: { gt: 0 },
              startAt: { lt: end },
              endAt: { gt: start },
            },
            select: { startAt: true, endAt: true },
          });
          let reason = activityRejection(
            {
              start: start.getTime(),
              end: end.getTime(),
              steps: r.steps,
              manual: r.manual,
              deleted: r.deleted,
            },
            overlaps.map((o) => ({
              start: o.startAt!.getTime(),
              end: o.endAt!.getTime(),
            })),
            policy,
            now.getTime(),
            withdrawal?.createdAt.getTime() ?? null,
          );
          if (
            !reason &&
            (dayRecord?.acceptedSteps ?? 0) + r.steps > policy.maxDailySteps
          )
            reason = 'DAILY_PLAUSIBILITY_CAP';
          const sourceId = randomUUID();
          await tx.activitySource.create({
            data: {
              id: sourceId,
              userId: p.userId,
              sourceKey,
              source: r.source,
              revision: r.revision,
              requestHash,
              day,
              acceptedSteps: reason ? 0 : r.steps,
              reason,
              startAt: reason ? null : start,
              endAt: reason ? null : end,
              batchId: id,
            },
          });
          if (reason) {
            rejected++;
            continue;
          }
          await tx.activityDay.upsert({
            where: { userId_day: { userId: p.userId, day } },
            create: {
              userId: p.userId,
              day,
              acceptedSteps: r.steps,
              policy: json(policy),
            },
            update: { acceptedSteps: { increment: r.steps } },
          });
          accepted.push({ id: sourceId, steps: r.steps, start, end });
          days.add(day);
        }
        let credits = 0;
        if (!reviewRequired) {
          for (const day of [...days].sort()) {
            const row = await tx.activityDay.findUniqueOrThrow({
                where: { userId_day: { userId: p.userId, day } },
              }),
              policy = activityPolicySchema.parse(row.policy),
              units =
                activityCreditTarget(row.acceptedSteps, policy) -
                row.grantedCredits;
            if (units > 0) {
              const transfer = await moveRestrictedCurrency(tx, {
                userId: p.userId,
                currency: 'TRAIL_CREDITS',
                purpose: 'EARN_ACTIVITY',
                amount: BigInt(units),
                sourceKey: 'activity:' + id + ':' + day,
                operatorId: 'system.canonical-activity',
                proofReference: proofKey,
                policyVersion: policy.version,
              });
              await tx.activityAllocation.create({
                data: {
                  id: randomUUID(),
                  batchId: id,
                  userId: p.userId,
                  channel: 'TRAIL_CREDITS',
                  targetId: day,
                  units,
                  transferId: transfer.transferId,
                },
              });
              await tx.activityDay.update({
                where: { userId_day: { userId: p.userId, day } },
                data: { grantedCredits: { increment: units } },
              });
              credits += units;
            }
          }
          if (accepted.length && this.config!.allocatePress) {
            const allocated = await this.config!.allocatePress(
              tx,
              p.userId,
              accepted,
            );
            if (allocated) {
              if (
                !z.uuid().safeParse(allocated.jobId).success ||
                !Number.isSafeInteger(allocated.units) ||
                allocated.units <= 0 ||
                allocated.units > accepted.reduce((n, r) => n + r.steps, 0)
              )
                throw new Error('Invalid trusted press allocation');
              await tx.activityAllocation.create({
                data: {
                  id: randomUUID(),
                  batchId: id,
                  userId: p.userId,
                  channel: 'PRESS_STEPS',
                  targetId: allocated.jobId,
                  units: allocated.units,
                },
              });
            }
          }
        }
        const receipt = activityIngestReceiptSchema.parse({
          receiptId: id,
          acceptedSteps: accepted.reduce((n, r) => n + r.steps, 0),
          duplicates,
          rejected,
          trailCreditsGranted: String(credits),
          reviewRequired,
        });
        await tx.activityBatch.create({
          data: {
            id,
            userId: p.userId,
            proofKey,
            requestHash: digest,
            result: json(receipt),
          },
        });
        await tx.operationRecord.create({
          data: {
            ...operation,
            requestHash: hash(input.data),
            result: json(receipt),
          },
        });
        return receipt;
      },
      { timeout: 30000 },
    );
    console.info(
      JSON.stringify({
        event: 'activity.ingest',
        reviewRequired: result.reviewRequired,
        accepted: result.acceptedSteps > 0,
      }),
    );
    return result;
  }
  async purge(at = new Date()) {
    if (this.config)
      await this.db.activitySource.updateMany({
        where: {
          endAt: {
            lt: new Date(
              at.getTime() - this.config.policy.retentionHours * 3600000,
            ),
          },
        },
        data: { startAt: null, endAt: null },
      });
  }
}
@Controller('v1/activity')
export class ActivityController {
  constructor(
    @Inject('AUTH_SERVICE') readonly auth: AuthService | null,
    @Inject('ACTIVITY_SERVICE') readonly service: ActivityService | null,
  ) {}
  @Get('summary') async summary(@Req() r: Request) {
    if (!this.auth || !this.service)
      throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    return this.service.summary(
      await this.auth.authenticate(r.headers.authorization),
    );
  }
  @Post('ingest') @HttpCode(200) async ingest(
    @Req() r: Request,
    @Body() b: unknown,
  ) {
    if (!this.auth || !this.service)
      throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    return this.service.ingest(
      await this.auth.authenticate(r.headers.authorization),
      b,
    );
  }
}

export function startActivityWorker(service: ActivityService) {
  let running: Promise<void> | null = null;
  const timer = setInterval(() => {
    if (!running)
      running = service
        .purge()
        .catch(() =>
          console.warn(
            JSON.stringify({ event: 'activity.retention', status: 'retry' }),
          ),
        )
        .finally(() => {
          running = null;
        });
  }, 30000);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await running;
  };
}
