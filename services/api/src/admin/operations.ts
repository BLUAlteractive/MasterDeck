import { Prisma } from '@deckforge/database';
import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  emptyLatency,
  observeLatency,
  latencyBounds,
  latencyPercentileUpper,
} from '@deckforge/card-domain';
import {
  adminCommandSchema,
  operationalSummarySchema,
} from '@deckforge/contracts';
import type { AuthService, Principal } from '../auth/service';
import { ApiFailure } from '../auth/errors';
import { adminAccess, adminPrior, adminRecord } from './access';
export class RequestLatency {
  readonly since = new Date().toISOString();
  histogram = emptyLatency();
  observe(ms: number) {
    this.histogram = observeLatency(this.histogram, ms);
  }
  view() {
    return {
      source: 'PROCESS_HTTP' as const,
      since: this.since,
      requests: this.histogram.count,
      p95UpperMs: latencyPercentileUpper(this.histogram, 0.95),
      buckets: this.histogram.buckets.map((count, i) => ({
        upperMs: latencyBounds[i] ?? null,
        count,
      })),
    };
  }
}
export class OperationsService {
  constructor(
    readonly auth: AuthService,
    readonly latency = new RequestLatency(),
  ) {}
  async read(p: Principal, body: unknown) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.snapshot(p, body);
      } catch (error) {
        if (
          attempt >= 3 ||
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          !['P2002', 'P2034'].includes(error.code)
        )
          throw error;
      }
    }
  }
  private async snapshot(p: Principal, body: unknown) {
    const parsed = adminCommandSchema.safeParse(body);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    const input = { ...parsed.data, action: 'DASHBOARD' };
    return this.auth.database.$transaction(
      async (tx) => {
        await adminAccess(tx, p, 'AUDITOR');
        const prior = await adminPrior(tx, p, input, input.commandId);
        if (prior) return operationalSummarySchema.parse(prior.result);
        const [clock] = await tx.$queryRaw<
          { now: Date; since: Date }[]
        >`SELECT CURRENT_TIMESTAMP AS now,CURRENT_TIMESTAMP-interval '7 days' AS since`;
        const since = clock!.since;
        const funnel = {
          newAccounts: await tx.user.count({
            where: { createdAt: { gte: since } },
          }),
          permanentNewAccounts: await tx.user.count({
            where: { createdAt: { gte: since }, isGuest: false },
          }),
          starterGrants: await tx.starterGrant.count({
            where: { createdAt: { gte: since } },
          }),
          completedPoker: await tx.gameResult.count({
            where: { createdAt: { gte: since } },
          }),
          completedSpades: await tx.spadesResult.count({
            where: { createdAt: { gte: since } },
          }),
          fusions: await tx.fusionJob.count({
            where: { createdAt: { gte: since } },
          }),
          activeVerifiedPurchases: await tx.verifiedPurchase.count({
            where: { status: 'ACTIVE', environment: 'PRODUCTION' },
          }),
          revokedPurchases: await tx.verifiedPurchase.count({
            where: { status: 'REVOKED', environment: 'PRODUCTION' },
          }),
        };
        const [wec] = await tx.$queryRaw<
          { n: number }[]
        >`WITH matched AS (SELECT p."userId" FROM "GameParticipant" p JOIN "GameResult" r ON r."roomId"=p."roomId" WHERE r."createdAt">=${since} UNION SELECT p."userId" FROM "SpadesSeat" p JOIN "SpadesResult" r ON r."roomId"=p."roomId" WHERE r."createdAt">=${since}), collected AS (SELECT "userId" FROM "CollectorActivity" WHERE "lastCollectionAt">=${since} UNION SELECT c."ownerId" FROM "OwnershipEvent" e JOIN "CardInstance" c ON c.id=e."instanceId" WHERE e.action IN ('FUSION_CREATE','PRESS_EVOLVE') AND e."recordedAt">=${since}) SELECT count(*)::int AS n FROM matched m JOIN collected c ON c."userId"=m."userId"`;
        const [chips] = await tx.$queryRaw<
          { n: number; total: string }[]
        >`SELECT count(*) FILTER(WHERE a.balance<>(SELECT COALESCE(sum(e.amount),0) FROM "PlayChipEntry" e WHERE e."accountId"=a.id))::int AS n,COALESCE(sum(a.balance),0)::text AS total FROM "PlayChipAccount" a`;
        const [restricted] = await tx.$queryRaw<
          { n: number }[]
        >`SELECT count(*)::int AS n FROM "RestrictedAccount" a WHERE a.balance<>(SELECT COALESCE(sum(e.amount),0) FROM "RestrictedEntry" e WHERE e."accountId"=a.id)`;
        const totals = await tx.$queryRaw<
          { currency: string; total: string }[]
        >`SELECT currency,sum(balance)::text AS total FROM "RestrictedAccount" GROUP BY currency ORDER BY currency`;
        const [origins] = await tx.$queryRaw<
          { n: number }[]
        >`SELECT count(*)::int AS n FROM "CardInstance" c LEFT JOIN "OwnershipEvent" e ON e.id=c."originEventId" AND e."instanceId"=c.id WHERE e.id IS NULL`;
        const [grants] = await tx.$queryRaw<
          { n: number }[]
        >`SELECT count(*)::int AS n FROM "VerifiedPurchase" p WHERE (SELECT count(*) FROM "CosmeticGrant" g WHERE g."purchaseId"=p.id)<>jsonb_array_length(p.snapshot->'contents') OR EXISTS(SELECT 1 FROM "CosmeticGrant" g WHERE g."purchaseId"=p.id AND (g."userId"<>p."userId" OR (p.status='ACTIVE' AND g.status<>'ACTIVE') OR (p.status='REVOKED' AND g.status<>'REVOKED')))`;
        const [tournaments] = await tx.$queryRaw<
          { n: number }[]
        >`SELECT count(*)::int AS n FROM "TournamentBinding" b JOIN "GameResult" g ON g."roomId"=b."roomId" LEFT JOIN "TournamentResult" r ON r."roomId"=b."roomId" WHERE r."roomId" IS NULL`;
        const result = operationalSummarySchema.parse({
          generatedAt: clock!.now.toISOString(),
          windowStart: since.toISOString(),
          source: 'DATABASE_REPEATABLE_READ',
          funnel,
          wec: {
            count: wec!.n,
            definition: 'MATCH_AND_SERVER_OBSERVED_COLLECTION_ACTION_7D',
            coverage:
              'Authenticated nonempty inventory reads, successful favorite actions, fusion and Press history. Historical uninstrumented views/favorites/archive/incubation are not backfilled.',
          },
          integrity: {
            playChipMismatches: chips!.n,
            playChipTotal: chips!.total,
            restrictedMismatches: restricted!.n,
            restrictedTotals: totals,
            missingCardOrigins: origins!.n,
            purchaseGrantMismatches: grants!.n,
          },
          queues: {
            billingInbox: await tx.billingInbox.count({
              where: { status: 'PENDING' },
            }),
            billingAcknowledgements: await tx.billingAcknowledgement.count({
              where: { status: 'PENDING' },
            }),
            voidCoverageGaps: await tx.billingVoidScan.count({
              where: { coverageGap: true },
            }),
            unsettledPoker: await tx.gameAdmission.count({
              where: { room: { status: 'COMPLETE', result: null } },
            }),
            unprocessedTournamentResults: tournaments!.n,
            gameReports: await tx.gameReport.count(),
          },
          latency: this.latency.view(),
        });
        await adminRecord(tx, p, input, 'AUDITOR', 'operations', input, result);
        return result;
      },
      { isolationLevel: 'RepeatableRead', timeout: 30000 },
    );
  }
}
@Controller('v1/admin/operations')
export class OperationsController {
  constructor(
    @Inject('AUTH_SERVICE') readonly auth: AuthService | null,
    @Inject('REQUEST_LATENCY') readonly latency: RequestLatency,
  ) {}
  @Post('snapshot') @HttpCode(200) async read(
    @Req() r: Request,
    @Body() body: unknown,
  ) {
    if (!this.auth) throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    return new OperationsService(this.auth, this.latency).read(
      await this.auth.authenticate(r.headers.authorization),
      body,
    );
  }
}
