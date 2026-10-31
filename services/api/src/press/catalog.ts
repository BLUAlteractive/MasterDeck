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
import { z } from 'zod';
import type { PrismaClient } from '@deckforge/database';
import {
  screenAdminSchema,
  screenPatternSchema,
  screenPolicySchema,
  screenPatternViewSchema,
  screenCatalogSchema,
  type ScreenPolicy,
} from '@deckforge/contracts';
import type { AuthService, Principal } from '../auth/service';
import { ApiFailure } from '../auth/errors';
import {
  adminAccess,
  adminPrior,
  adminRecord,
  type Capability,
} from '../admin/access';
import { hash, json } from '../rooms/shared';
export class ScreenCatalogService {
  constructor(
    readonly db: PrismaClient,
    readonly policy: ScreenPolicy | null = null,
  ) {
    if (policy) screenPolicySchema.parse(policy);
  }
  async command(p: Principal, body: unknown) {
    const parsed = screenAdminSchema.safeParse(body);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    const input = parsed.data;
    const capability: Capability =
      input.action === 'DRAFT'
        ? 'CONTENT_EDITOR'
        : input.action === 'REVIEW'
          ? 'CONTENT_REVIEWER'
          : 'CONTENT_PUBLISHER';
    return this.db.$transaction(
      async (tx) => {
        await adminAccess(tx, p, capability);
        const prior = await adminPrior(tx, p, input, input.commandId);
        if (prior) return prior.result;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.patternId},6866))::text`;
        let result: unknown;
        if (input.action === 'DRAFT') {
          await tx.screenPattern.create({
            data: {
              id: input.patternId,
              slug: input.slug,
              version: input.version,
              definition: json(input.definition),
              definitionHash: hash(input.definition),
              creatorId: p.userId,
            },
          });
          result = {
            id: input.patternId,
            status: 'DRAFT',
            stateVersion: 1,
            definitionHash: hash(input.definition),
          };
        } else {
          const row = await tx.screenPattern.findUnique({
            where: { id: input.patternId },
          });
          if (!row) throw new ApiFailure('SCREEN_UNAVAILABLE', 404);
          const definition = screenPatternSchema.parse(row.definition);
          if (hash(definition) !== row.definitionHash)
            throw new Error('SCREEN_INTEGRITY');
          if (input.action === 'REVIEW') {
            if (
              row.status !== 'DRAFT' ||
              input.definitionHash !== row.definitionHash ||
              row.creatorId === p.userId
            )
              throw new ApiFailure('INDEPENDENT_SCREEN_REVIEW_REQUIRED', 409);
            await tx.screenReview.create({
              data: {
                patternId: row.id,
                reviewerId: p.userId,
                review: input.review,
                definitionHash: row.definitionHash,
                evidence: input.evidence,
              },
            });
            result = {
              id: row.id,
              review: input.review,
              definitionHash: row.definitionHash,
            };
          } else {
            if (
              row.stateVersion !== input.expectedVersion ||
              row.status !==
                (input.action === 'PUBLISH' ? 'DRAFT' : 'PUBLISHED')
            )
              throw new ApiFailure('STALE_SCREEN_VERSION', 409);
            if (input.action === 'PUBLISH') {
              const reviews = await tx.screenReview.findMany({
                where: {
                  patternId: row.id,
                  definitionHash: row.definitionHash,
                },
              });
              if (
                reviews.length !== 2 ||
                new Set([
                  row.creatorId,
                  p.userId,
                  ...reviews.map((r) => r.reviewerId),
                ]).size !== 4
              )
                throw new ApiFailure('INDEPENDENT_SCREEN_REVIEW_REQUIRED', 409);
            }
            const updated = await tx.screenPattern.update({
              where: { id: row.id },
              data: {
                status: input.action === 'PUBLISH' ? 'PUBLISHED' : 'RETIRED',
                stateVersion: { increment: 1 },
                ...(input.action === 'PUBLISH'
                  ? { publisherId: p.userId }
                  : {}),
              },
            });
            result = {
              id: row.id,
              status: updated.status,
              stateVersion: updated.stateVersion,
              definitionHash: row.definitionHash,
            };
          }
        }
        await adminRecord(
          tx,
          p,
          { ...input, action: 'SCREEN_' + input.action },
          capability,
          input.patternId,
          input,
          result,
        );
        return result;
      },
      { timeout: 30000 },
    );
  }
  async list() {
    if (!this.policy)
      return screenCatalogSchema.parse({ available: false, patterns: [] });
    const rows = await this.db.screenPattern.findMany({
      where: { id: { in: this.policy.allowedPatternIds }, status: 'PUBLISHED' },
      orderBy: { id: 'asc' },
      take: 100,
    });
    return screenCatalogSchema.parse({
      available: true,
      patterns: rows.map((row) => {
        const definition = screenPatternSchema.parse(row.definition);
        if (hash(definition) !== row.definitionHash)
          throw new Error('SCREEN_INTEGRITY');
        return screenPatternViewSchema.parse({
          id: row.id,
          slug: row.slug,
          version: row.version,
          definitionHash: row.definitionHash,
          definition,
        });
      }),
    });
  }
}
@Controller('v1/press/screens')
export class ScreenCatalogController {
  constructor(
    @Inject('SCREEN_CATALOG') readonly service: ScreenCatalogService | null,
    @Inject('AUTH_SERVICE') readonly auth: AuthService | null,
  ) {}
  @Get('catalog') async list(@Query() query: unknown) {
    if (!z.object({}).strict().safeParse(query).success)
      throw new ApiFailure('INVALID_REQUEST', 400);
    return this.service
      ? this.service.list()
      : { available: false, patterns: [] };
  }
  @Post('admin') @HttpCode(200) async command(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    if (!this.auth || !this.service)
      throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    return this.service.command(
      await this.auth.authenticate(req.headers.authorization),
      body,
    );
  }
}
