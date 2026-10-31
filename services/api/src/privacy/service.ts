import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  privacyConsentSchema,
  privacyStateSchema,
  privacyDeleteSchema,
  privacyExportQuerySchema,
  privacyExportSchema,
  adminCommandSchema,
} from '@deckforge/contracts';
import type { AuthService, Principal } from '../auth/service';
import { ApiFailure } from '../auth/errors';
import { hash, lockPrincipal } from '../rooms/shared';
import { privacySubjectHash } from './key';
import type { DeletionProvider } from './provider';
import { adminAccess, adminPrior, adminRecord } from '../admin/access';
export type PrivacyConfig = {
  policyVersion: string;
  policyUrl: string;
  approvalReference: string;
  retentionApprovalReference: string;
  analyticsRetentionDays: number;
  identityHashKey: Buffer;
  provider: DeletionProvider | null;
};
const choice = (
  row: {
    analytics: boolean;
    activityUpload: boolean;
    foregroundLocation: boolean;
  } | null,
) => ({
  analytics: row?.analytics ?? false,
  activityUpload: row?.activityUpload ?? false,
  foregroundLocation: row?.foregroundLocation ?? false,
});
export class PrivacyService {
  constructor(
    readonly auth: AuthService,
    readonly config: PrivacyConfig | null = null,
  ) {
    if (config) {
      if (
        config.identityHashKey.length !== 32 ||
        !config.policyVersion ||
        config.approvalReference.length < 8 ||
        config.retentionApprovalReference.length < 8 ||
        new URL(config.policyUrl).protocol !== 'https:' ||
        !Number.isInteger(config.analyticsRetentionDays) ||
        config.analyticsRetentionDays < 1 ||
        config.analyticsRetentionDays > 365
      )
        throw new Error('Reviewed privacy configuration required');
      auth.configurePrivacyProtection(config.identityHashKey);
    }
  }
  async state(p: Principal) {
    return this.auth.database.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      const c = await tx.privacyChoice.findUnique({
          where: { userId: p.userId },
        }),
        job = await tx.privacyDeletionJob.findUnique({
          where: { userId: p.userId },
        });
      return privacyStateSchema.parse({
        policy: this.config
          ? { version: this.config.policyVersion, url: this.config.policyUrl }
          : null,
        choices: choice(c),
        deletion: job ? { id: job.id, status: job.status } : null,
      });
    });
  }
  async consent(p: Principal, body: unknown) {
    const parsed = privacyConsentSchema.safeParse(body);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    const input = parsed.data;
    if (
      input.enabled &&
      (!this.config || input.policyVersion !== this.config.policyVersion)
    )
      throw new ApiFailure('PRIVACY_POLICY_NOT_CONFIGURED', 503);
    return this.auth.database.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      const prior = await tx.operationRecord.findUnique({
        where: {
          userId_operation_key: {
            userId: p.userId,
            operation: 'PRIVACY_CONSENT',
            key: input.commandId,
          },
        },
      });
      if (prior) {
        if (prior.requestHash !== hash(input))
          throw new ApiFailure('IDEMPOTENCY_CONFLICT', 409);
        return prior.result;
      }
      await tx.privacyChoice.createMany({
        data: [{ userId: p.userId }],
        skipDuplicates: true,
      });
      const field =
        input.purpose === 'ANALYTICS'
          ? 'analytics'
          : input.purpose === 'ACTIVITY_UPLOAD'
            ? 'activityUpload'
            : 'foregroundLocation';
      const updated = await tx.privacyChoice.update({
        where: { userId: p.userId },
        data: { [field]: input.enabled, version: { increment: 1 } },
      });
      const state = { ...choice(updated), version: updated.version };
      await tx.privacyConsent.create({
        data: {
          id: randomUUID(),
          userId: p.userId,
          commandId: input.commandId,
          purpose: input.purpose,
          enabled: input.enabled,
          policyVersion: this.config?.policyVersion ?? 'WITHDRAWAL_ONLY_V1',
          state,
        },
      });
      if (!updated.activityUpload)
        await tx.activitySource.updateMany({
          where: { userId: p.userId },
          data: { startAt: null, endAt: null },
        });
      if (!updated.analytics)
        await tx.collectorActivity.deleteMany({ where: { userId: p.userId } });
      const result = { recorded: true, choices: choice(updated) };
      await tx.operationRecord.create({
        data: {
          userId: p.userId,
          operation: 'PRIVACY_CONSENT',
          key: input.commandId,
          requestHash: hash(input),
          result,
        },
      });
      return result;
    });
  }
  async request(p: Principal, body: unknown) {
    const parsed = privacyDeleteSchema.safeParse(body);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    return this.auth.requestDeletion(p);
  }
  async export(p: Principal, query: unknown) {
    const parsed = privacyExportQuerySchema.safeParse(query);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    const q = parsed.data;
    return this.auth.database.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      const after = q.cursor ? { id: { gt: q.cursor } } : {},
        take = q.limit + 1;
      let rows: Record<string, unknown>[] = [];
      if (q.resource === 'PRESS_JOBS')
        rows = await tx.pressJob.findMany({
          where: { userId: p.userId, ...after },
          take,
          orderBy: { id: 'asc' },
          select: {
            id: true,
            cardId: true,
            screenId: true,
            snapshot: true,
            status: true,
            stateVersion: true,
            acceptedSteps: true,
            accessibleUnits: true,
            startedAt: true,
          },
        });
      else if (q.resource === 'SCREENS')
        rows = await tx.ownedScreen.findMany({
          where: { userId: p.userId, ...after },
          take,
          orderBy: { id: 'asc' },
          select: {
            id: true,
            patternId: true,
            definitionHash: true,
            snapshot: true,
            status: true,
            stateVersion: true,
            createdAt: true,
          },
        });
      else if (q.resource === 'PACK_OPENINGS')
        rows = await tx.packOpening.findMany({
          where: { userId: p.userId, ...after },
          take,
          orderBy: { id: 'asc' },
          select: {
            id: true,
            packId: true,
            definitionHash: true,
            result: true,
            createdAt: true,
          },
        });
      else if (q.resource === 'SUPPLIES')
        rows = await tx.supplyEvent.findMany({
          where: { userId: p.userId, ...after },
          take,
          orderBy: { id: 'asc' },
          select: {
            id: true,
            kind: true,
            delta: true,
            version: true,
            reason: true,
            createdAt: true,
          },
        });
      else if (q.resource === 'ACTIVITY')
        rows = await tx.activitySource.findMany({
          where: { userId: p.userId, ...after },
          take,
          orderBy: { id: 'asc' },
          select: {
            id: true,
            source: true,
            day: true,
            acceptedSteps: true,
            reason: true,
            revision: true,
          },
        });
      else if (q.resource === 'ACTIVITY_REVIEWS')
        rows = await tx.activityReview.findMany({
          where: { userId: p.userId, ...after },
          take,
          orderBy: { id: 'asc' },
          select: {
            id: true,
            revision: true,
            stepAdjustment: true,
            createdAt: true,
          },
        });
      else if (q.resource === 'ACCOUNT') {
        if (!q.cursor) {
          const user = await tx.user.findUniqueOrThrow({
            where: { id: p.userId },
            select: { id: true, isGuest: true, status: true, createdAt: true },
          });
          rows = [
            {
              ...user,
              identities: await tx.externalIdentity.findMany({
                where: { userId: p.userId },
                select: { issuer: true, subject: true },
              }),
              telemetry: await tx.collectorActivity.findUnique({
                where: { userId: p.userId },
                select: { lastCollectionAt: true },
              }),
            },
          ];
        }
      } else if (q.resource === 'CARDS')
        rows = await tx.cardInstance.findMany({
          where: { ownerId: p.userId, ...after },
          take,
          orderBy: { id: 'asc' },
          select: {
            id: true,
            faceId: true,
            seriesId: true,
            level: true,
            branch: true,
            rarity: true,
            status: true,
            stateVersion: true,
            createdAt: true,
          },
        });
      else if (q.resource === 'OWNERSHIP')
        rows = await tx.ownershipEvent.findMany({
          where: { instance: { ownerId: p.userId }, ...after },
          take,
          orderBy: { id: 'asc' },
          select: {
            id: true,
            instanceId: true,
            action: true,
            stateVersion: true,
            recordedAt: true,
          },
        });
      else if (q.resource === 'PURCHASES')
        rows = await tx.verifiedPurchase.findMany({
          where: { userId: p.userId, ...after },
          take,
          orderBy: { id: 'asc' },
          select: {
            id: true,
            platform: true,
            environment: true,
            transactionId: true,
            sku: true,
            status: true,
            createdAt: true,
          },
        });
      else if (q.resource === 'CONSENTS')
        rows = await tx.privacyConsent.findMany({
          where: { userId: p.userId, ...after },
          take,
          orderBy: { id: 'asc' },
          select: {
            id: true,
            purpose: true,
            enabled: true,
            policyVersion: true,
            createdAt: true,
          },
        });
      else if (q.resource === 'PROGRESSION')
        rows = await tx.progressAward.findMany({
          where: { userId: p.userId, ...after },
          take,
          orderBy: { id: 'asc' },
          select: { id: true, goalId: true, windowKey: true, awardedAt: true },
        });
      else if (q.resource === 'SAFETY')
        rows = await tx.gameReport.findMany({
          where: { userId: p.userId, ...after },
          take,
          orderBy: { id: 'asc' },
          select: {
            id: true,
            game: true,
            gameId: true,
            code: true,
            stateVersion: true,
            createdAt: true,
          },
        });
      else if (q.resource === 'PLAY_CHIPS') {
        const account = await tx.playChipAccount.findUnique({
          where: { userId: p.userId },
        });
        if (account)
          rows = (
            await tx.playChipEntry.findMany({
              where: {
                accountId: account.id,
                ...(q.cursor ? { transferId: { gt: q.cursor } } : {}),
              },
              take,
              orderBy: { transferId: 'asc' },
              include: {
                transfer: { select: { kind: true, createdAt: true } },
              },
            })
          ).map((e) => ({
            id: e.transferId,
            currency: 'PLAY_CHIPS',
            amount: e.amount.toString(),
            ...e.transfer,
          }));
      } else {
        const account = await tx.restrictedAccount.findUnique({
          where: {
            userId_currency: { userId: p.userId, currency: q.resource },
          },
        });
        if (account)
          rows = (
            await tx.restrictedEntry.findMany({
              where: {
                accountId: account.id,
                ...(q.cursor ? { transferId: { gt: q.cursor } } : {}),
              },
              take,
              orderBy: { transferId: 'asc' },
              include: {
                transfer: { select: { purpose: true, createdAt: true } },
              },
            })
          ).map((e) => ({
            id: e.transferId,
            currency: q.resource,
            amount: e.amount.toString(),
            ...e.transfer,
          }));
      }
      await tx.privacyAccessEvent.create({
        data: {
          id: randomUUID(),
          userId: p.userId,
          action: 'EXPORT',
          resource: q.resource,
        },
      });
      return privacyExportSchema.parse({
        resource: q.resource,
        generatedAt: new Date().toISOString(),
        items: JSON.parse(JSON.stringify(rows.slice(0, q.limit))),
        nextCursor:
          rows.length > q.limit ? String(rows[q.limit - 1]!.id) : null,
      });
    });
  }
  async process(id: string) {
    const job = await this.auth.database.privacyDeletionJob.findUnique({
      where: { id },
    });
    if (!job || job.status === 'COMPLETED_WITH_RETAINED_RECORDS') return;
    const claimed = await this.auth.database.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${job.userId}::uuid FOR UPDATE`;
      const current = await tx.privacyDeletionJob.findUniqueOrThrow({
        where: { id },
      });
      if (
        current.status === 'COMPLETED_WITH_RETAINED_RECORDS' ||
        (current.leaseUntil && current.leaseUntil > new Date())
      )
        return null;
      const owner = await tx.user.findUniqueOrThrow({
        where: { id: job.userId },
      });
      const request = await tx.deletionRequest.findUnique({
        where: { id: current.requestId },
      });
      if (owner.status !== 'SUSPENDED' || request?.userId !== job.userId)
        return null;
      const held = await tx.cardInstance.count({
        where: { ownerId: job.userId, status: 'LOCKED' },
      });
      const status = held
        ? 'WAITING_GAME'
        : !this.config?.provider
          ? 'WAITING_CONFIG'
          : 'PROCESSING';
      const updated = await tx.privacyDeletionJob.update({
        where: { id },
        data: {
          status,
          nextAttemptAt: new Date(Date.now() + 30000),
          version: { increment: 1 },
          leaseUntil:
            status === 'PROCESSING' ? new Date(Date.now() + 120000) : null,
        },
      });
      return status === 'PROCESSING' ? updated : null;
    });
    if (!claimed) return;
    try {
      const identities = await this.auth.database.externalIdentity.findMany({
        where: { userId: job.userId },
      });
      if (identities.length > 10) throw new Error('Identity review required');
      for (const identity of identities) {
        if (
          await this.auth.database.privacyDeletionProof.findUnique({
            where: { jobId_identityId: { jobId: id, identityId: identity.id } },
          })
        )
          continue;
        const proof = await this.config!.provider!.deleteIdentity(
          identity.issuer,
          identity.subject,
          id,
        );
        if (
          proof.confirmed !== true ||
          !/^[a-f0-9]{64}$/.test(proof.referenceHash)
        )
          throw new Error('Provider deletion unconfirmed');
        await this.auth.database.privacyDeletionProof.createMany({
          data: [
            {
              jobId: id,
              identityId: identity.id,
              referenceHash: proof.referenceHash,
            },
          ],
          skipDuplicates: true,
        });
      }
      await this.auth.database.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "User" WHERE id=${job.userId}::uuid FOR UPDATE`;
          const current = await tx.privacyDeletionJob.findUniqueOrThrow({
            where: { id },
          });
          if (
            current.version !== claimed.version ||
            current.status !== 'PROCESSING'
          )
            return;
          if (
            await tx.cardInstance.count({
              where: { ownerId: job.userId, status: 'LOCKED' },
            })
          )
            throw new Error('Active game retained');
          const actual = await tx.externalIdentity.findMany({
            where: { userId: job.userId },
          });
          for (const identity of actual) {
            if (
              !(await tx.privacyDeletionProof.findUnique({
                where: {
                  jobId_identityId: { jobId: id, identityId: identity.id },
                },
              }))
            )
              throw new Error('Provider evidence missing');
            const subjectHash = privacySubjectHash(
              this.config!.identityHashKey,
              identity.issuer,
              identity.subject,
            );
            await tx.identityTombstone.createMany({
              data: [{ issuer: identity.issuer, subjectHash, jobId: id }],
              skipDuplicates: true,
            });
            await tx.externalIdentity.update({
              where: { id: identity.id },
              data: { subject: 'erased:' + subjectHash },
            });
          }
          await tx.user.update({
            where: { id: job.userId },
            data: { status: 'DELETED', role: 'PLAYER' },
          });
          await tx.authSession.deleteMany({
            where: { identity: { userId: job.userId } },
          });

          await tx.adminCapability.updateMany({
            where: { userId: job.userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          await tx.collectorActivity.deleteMany({
            where: { userId: job.userId },
          });
          await tx.activitySource.updateMany({
            where: { userId: job.userId },
            data: { startAt: null, endAt: null },
          });
          await tx.cardFavorite.deleteMany({ where: { userId: job.userId } });
          await tx.privacyChoice.deleteMany({ where: { userId: job.userId } });
          await tx.loadoutCard.deleteMany({ where: { userId: job.userId } });
          await tx.loadout.deleteMany({ where: { userId: job.userId } });
          await tx.collectionManagerSlot.deleteMany({
            where: { userId: job.userId },
          });
          await tx.collectionManager.deleteMany({
            where: { userId: job.userId },
          });
          await tx.privacyDeletionJob.update({
            where: { id },
            data: {
              status: 'COMPLETED_WITH_RETAINED_RECORDS',
              version: { increment: 1 },
              completedAt: new Date(),
              leaseUntil: null,
            },
          });
          await tx.privacyAccessEvent.create({
            data: {
              id: randomUUID(),
              userId: job.userId,
              action: 'LOCAL_PSEUDONYMIZED_PROVIDER_CONFIRMED',
              resource: this.config!.retentionApprovalReference,
            },
          });
        },
        { timeout: 30000 },
      );
    } catch {
      await this.auth.database.privacyDeletionJob.updateMany({
        where: { id, version: claimed.version, status: 'PROCESSING' },
        data: {
          status: 'RETRY',
          nextAttemptAt: new Date(Date.now() + 30000),
          version: { increment: 1 },
          leaseUntil: null,
        },
      });
      console.warn(
        JSON.stringify({ event: 'privacy.deletion', status: 'retry' }),
      );
    }
  }
  async recover() {
    const jobs = await this.auth.database.privacyDeletionJob.findMany({
      where: {
        status: { not: 'COMPLETED_WITH_RETAINED_RECORDS' },
        nextAttemptAt: { lte: new Date() },
      },
      take: 20,
      orderBy: { nextAttemptAt: 'asc' },
    });
    for (const job of jobs) await this.process(job.id);
    if (this.config)
      await this.auth.database.collectorActivity.deleteMany({
        where: {
          lastCollectionAt: {
            lt: new Date(
              Date.now() - this.config.analyticsRetentionDays * 86400000,
            ),
          },
        },
      });
  }
}
export function startPrivacyWorker(service: PrivacyService) {
  let running: Promise<void> | null = null,
    closed = false;
  const tick = () => {
    if (closed || running) return;
    running = service
      .recover()
      .catch(() =>
        console.warn(
          JSON.stringify({ event: 'privacy.worker', status: 'retry' }),
        ),
      )
      .finally(() => {
        running = null;
      });
  };
  const timer = setInterval(tick, 30000);
  timer.unref();
  return async () => {
    closed = true;
    clearInterval(timer);
    await running;
  };
}
@Controller('v1/privacy')
export class PrivacyController {
  constructor(
    @Inject('PRIVACY_SERVICE') readonly service: PrivacyService | null,
  ) {}
  private enabled() {
    if (!this.service) throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    return this.service;
  }
  @Get() async state(@Req() r: Request) {
    const s = this.enabled();
    return s.state(await s.auth.authenticate(r.headers.authorization));
  }
  @Post('consent') @HttpCode(200) async consent(
    @Req() r: Request,
    @Body() b: unknown,
  ) {
    const s = this.enabled();
    return s.consent(await s.auth.authenticate(r.headers.authorization), b);
  }
  @Get('export') async export(@Req() r: Request, @Query() q: unknown) {
    const s = this.enabled();
    return s.export(await s.auth.authenticate(r.headers.authorization), q);
  }
  @Post('deletion') @HttpCode(200) async deletion(
    @Req() r: Request,
    @Body() b: unknown,
  ) {
    const s = this.enabled();
    return s.request(await s.auth.authenticate(r.headers.authorization), b);
  }
  @Post('process') @HttpCode(200) async process(
    @Req() r: Request,
    @Body() body: unknown,
  ) {
    const s = this.enabled(),
      p = await s.auth.authenticate(r.headers.authorization),
      input = adminCommandSchema
        .extend({ jobId: privacyDeleteSchema.shape.commandId })
        .strict()
        .safeParse(body);
    if (!input.success) throw new ApiFailure('INVALID_REQUEST', 400);
    await s.auth.database.$transaction(async (tx) => {
      await adminAccess(tx, p, 'PRIVACY_OPERATOR');
      if (await adminPrior(tx, p, input.data, input.data.commandId)) return;
      await adminRecord(
        tx,
        p,
        { ...input.data, action: 'PROCESS_PRIVACY' },
        'PRIVACY_OPERATOR',
        input.data.jobId,
        input.data,
        { accepted: true },
      );
    });
    await s.process(input.data.jobId);
    return { accepted: true };
  }
}
