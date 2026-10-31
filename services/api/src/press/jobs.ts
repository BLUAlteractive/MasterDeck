import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { cardSnapshot, type PrismaClient } from '@deckforge/database';
import {
  pressCommand,
  reservedPressStatuses,
  validScreenTransition,
} from '@deckforge/card-domain';
import {
  pressStartSchema,
  pressCommandSchema,
  pressReceiptSchema,
  pressJobViewSchema,
  pressJobsSchema,
  pressPolicySchema,
  screenPatternSchema,
  type PressPolicy,
} from '@deckforge/contracts';
import type { AuthService, Principal } from '../auth/service';
import { ApiFailure } from '../auth/errors';
import { hash, json, lockPrincipal } from '../rooms/shared';
import { pressFrame, screenReservation } from './state';
const active = [...reservedPressStatuses];
export class PressJobService {
  constructor(
    readonly db: PrismaClient,
    readonly policy: PressPolicy | null = null,
  ) {
    if (policy) pressPolicySchema.parse(policy);
  }
  async start(p: Principal, body: unknown) {
    const parsed = pressStartSchema.safeParse(body);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    const input = parsed.data,
      digest = hash(input);
    return this.db.$transaction(
      async (tx) => {
        await lockPrincipal(tx, p);
        const key = {
            userId: p.userId,
            operation: 'PRESS_START',
            key: input.commandId,
          },
          prior = await tx.operationRecord.findUnique({
            where: { userId_operation_key: key },
          });
        if (prior) {
          if (prior.requestHash !== digest)
            throw new ApiFailure('IDEMPOTENCY_CONFLICT', 409);
          return pressReceiptSchema.parse(prior.result);
        }
        if (!this.policy) throw new ApiFailure('PRESS_NOT_CONFIGURED', 503);
        if (
          (await tx.user.findUniqueOrThrow({ where: { id: p.userId } })).isGuest
        )
          throw new ApiFailure('PERMANENT_ACCOUNT_REQUIRED', 403);
        if (
          await tx.pressJob.count({
            where: { userId: p.userId, status: { in: active } },
          })
        )
          throw new ApiFailure('PRESS_SLOT_RESERVED', 409);
        await tx.$queryRaw`SELECT id FROM "CardInstance" WHERE id=${input.cardId}::uuid AND "ownerId"=${p.userId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "OwnedScreen" WHERE id=${input.screenId}::uuid AND "userId"=${p.userId}::uuid FOR UPDATE`;
        const card = await tx.cardInstance.findUnique({
            where: { id: input.cardId },
          }),
          screen = await tx.ownedScreen.findUnique({
            where: { id: input.screenId },
          });
        if (
          !card ||
          card.ownerId !== p.userId ||
          !screen ||
          screen.userId !== p.userId
        )
          throw new ApiFailure('PRESS_SOURCE_UNAVAILABLE', 404);
        if (
          card.stateVersion !== input.expectedCardVersion ||
          screen.stateVersion !== input.expectedScreenVersion
        )
          throw new ApiFailure('STALE_PRESS_SOURCE', 409);
        const recipe = screenPatternSchema.parse(screen.snapshot);
        if (hash(recipe) !== screen.definitionHash)
          throw new Error('SCREEN_INTEGRITY');
        if (
          card.status !== 'OWNED' ||
          screen.status !== 'AVAILABLE' ||
          screen.jobId ||
          card.branch !== recipe.branch ||
          card.level !== recipe.sourceLevel ||
          !validScreenTransition(
            card.branch,
            card.level,
            recipe.targetLevel,
            recipe.tier,
          )
        )
          throw new ApiFailure('INELIGIBLE_PRESS_SOURCE', 409);
        const id = randomUUID(),
          [clock] = await tx.$queryRaw<
            { now: Date }[]
          >`SELECT clock_timestamp() AS now`;
        const job = await tx.pressJob.create({
          data: {
            id,
            userId: p.userId,
            cardId: card.id,
            screenId: screen.id,
            definitionHash: screen.definitionHash,
            snapshot: json(recipe),
            cardBefore: json(cardSnapshot(card)),
            policy: json(this.policy),
            startedAt: clock!.now,
            activeSince: clock!.now,
          },
        });
        await screenReservation(
          tx,
          screen.id,
          'ASSIGNED',
          id,
          'press:' + id + ':start:screen',
          digest,
        );
        await tx.pressJobEvent.create({
          data: {
            id: randomUUID(),
            jobId: id,
            userId: p.userId,
            version: 1,
            action: 'START',
            sourceKey: 'press:' + id + ':start',
            requestHash: digest,
            after: json(pressFrame(job)),
          },
        });
        const result = pressReceiptSchema.parse({
          jobId: id,
          stateVersion: job.stateVersion,
          status: job.status,
        });
        await tx.operationRecord.create({
          data: { ...key, requestHash: digest, result: json(result) },
        });
        return result;
      },
      { timeout: 30000 },
    );
  }
  async command(p: Principal, body: unknown) {
    const parsed = pressCommandSchema.safeParse(body);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    const input = parsed.data,
      digest = hash(input);
    return this.db.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      const key = {
          userId: p.userId,
          operation: 'PRESS_COMMAND',
          key: input.commandId,
        },
        prior = await tx.operationRecord.findUnique({
          where: { userId_operation_key: key },
        });
      if (prior) {
        if (prior.requestHash !== digest)
          throw new ApiFailure('IDEMPOTENCY_CONFLICT', 409);
        return pressReceiptSchema.parse(prior.result);
      }
      const before = await tx.pressJob.findUnique({
        where: { id: input.jobId },
      });
      if (!before || before.userId !== p.userId)
        throw new ApiFailure('PRESS_JOB_UNAVAILABLE', 404);
      if (before.stateVersion !== input.expectedVersion)
        throw new ApiFailure('STALE_PRESS_JOB', 409);
      if (input.action === 'RESUME' && !this.policy)
        throw new ApiFailure('PRESS_NOT_CONFIGURED', 503);
      const recipe = screenPatternSchema.parse(before.snapshot);
      let next;
      try {
        next = pressCommand(
          pressJobViewSchema.shape.status.parse(before.status),
          before.acceptedSteps + before.accessibleUnits,
          input.action,
          recipe.cancelAfterProgress,
        );
      } catch {
        throw new ApiFailure('INVALID_PRESS_TRANSITION', 409);
      }
      const [clock] = await tx.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      const after = await tx.pressJob.update({
        where: { id: before.id },
        data: {
          status: next.status,
          stateVersion: { increment: 1 },
          activeSince: next.status === 'ACTIVE' ? clock!.now : null,
        },
      });
      if (next.screen !== 'ASSIGNED')
        await screenReservation(
          tx,
          before.screenId,
          next.screen,
          next.screen === 'AVAILABLE' ? null : before.id,
          'press:' + before.id + ':' + input.commandId + ':screen',
          digest,
        );
      await tx.pressJobEvent.create({
        data: {
          id: randomUUID(),
          jobId: before.id,
          userId: p.userId,
          version: after.stateVersion,
          action: input.action,
          sourceKey: 'press:' + before.id + ':' + input.commandId,
          requestHash: digest,
          before: json(pressFrame(before)),
          after: json(pressFrame(after)),
        },
      });
      const result = pressReceiptSchema.parse({
        jobId: after.id,
        status: after.status,
        stateVersion: after.stateVersion,
      });
      await tx.operationRecord.create({
        data: { ...key, requestHash: digest, result: json(result) },
      });
      return result;
    });
  }
  async view(p: Principal, id?: string) {
    if (id !== undefined && !z.uuid().safeParse(id).success)
      throw new ApiFailure('INVALID_REQUEST', 400);
    return this.db.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      const job = id
        ? await tx.pressJob.findUnique({ where: { id } })
        : await tx.pressJob.findFirst({
            where: { userId: p.userId, status: { in: active } },
          });
      if (id && (!job || job.userId !== p.userId))
        throw new ApiFailure('PRESS_JOB_UNAVAILABLE', 404);
      const view = job
        ? pressJobViewSchema.parse({
            id: job.id,
            cardId: job.cardId,
            screenId: job.screenId,
            status: job.status,
            stateVersion: job.stateVersion,
            acceptedSteps: job.acceptedSteps,
            accessibleUnits: job.accessibleUnits,
            definitionHash: job.definitionHash,
            definition: screenPatternSchema.parse(job.snapshot),
            startedAt: job.startedAt.toISOString(),
            activeSince: job.activeSince?.toISOString() ?? null,
          })
        : null;
      return pressJobsSchema.parse({
        available: this.policy !== null,
        active: view,
      });
    });
  }
}
@Controller('v1/press/jobs')
export class PressJobController {
  constructor(
    @Inject('AUTH_SERVICE') readonly auth: AuthService | null,
    @Inject('PRESS_JOBS') readonly service: PressJobService | null,
  ) {}
  private enabled() {
    if (!this.auth || !this.service)
      throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    return { auth: this.auth, service: this.service };
  }
  @Post('start') @HttpCode(200) async start(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const s = this.enabled();
    const result = await s.service.start(
      await s.auth.authenticate(req.headers.authorization),
      body,
    );
    console.info(JSON.stringify({ event: 'press.start', status: 'recorded' }));
    return result;
  }
  @Post('commands') @HttpCode(200) async command(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const s = this.enabled();
    return s.service.command(
      await s.auth.authenticate(req.headers.authorization),
      body,
    );
  }
  @Get() async current(@Req() req: Request) {
    const s = this.enabled();
    return s.service.view(await s.auth.authenticate(req.headers.authorization));
  }
  @Get(':id') async item(@Req() req: Request, @Param('id') id: string) {
    const s = this.enabled();
    return s.service.view(
      await s.auth.authenticate(req.headers.authorization),
      id,
    );
  }
}
