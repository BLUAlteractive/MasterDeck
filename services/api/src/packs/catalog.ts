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
import type { Prisma, PrismaClient } from '@deckforge/database';
import {
  packAdminSchema,
  packDefinitionSchema,
  packPolicySchema,
  packViewSchema,
  packCatalogSchema,
  type PackPolicy,
  type PackDefinition,
  type StorefrontPolicy,
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
import { readCatalogManifest } from '../catalog';
import { approvedCosmeticProduct } from '../storefront';
/** Revalidate rights/contents at publication and before each new opening; never mint here. */
export async function validatePackContents(
  tx: Prisma.TransactionClient,
  definition: PackDefinition,
  storefront: StorefrontPolicy | null,
) {
  if (definition.kind === 'DISCOVERY') {
    const series = new Set<string>();
    for (const entry of definition.pool)
      if (entry.reward.kind === 'CARD') {
        const template = await tx.cardTemplate.findUnique({
          where: { id: entry.reward.templateId },
          include: { series: true },
        });
        if (
          !template ||
          template.series.status !== 'PUBLISHED' ||
          template.version !== template.series.manifestVersion
        )
          throw new ApiFailure('PACK_ART_NOT_PUBLISHED', 409);
        if (!series.has(template.seriesId)) {
          await readCatalogManifest(tx, template.series);
          series.add(template.seriesId);
        }
      }
    return null;
  }
  if (!storefront) throw new ApiFailure('COSMETIC_POLICY_NOT_CONFIGURED', 503);
  const product = await tx.cosmeticProduct.findUnique({
    where: { id: definition.cosmeticProductId },
  });
  if (!product) throw new ApiFailure('PRODUCT_UNAVAILABLE', 409);
  const apple = await approvedCosmeticProduct(
      tx,
      storefront,
      'APPLE',
      product.appleProductId,
    ),
    google = await approvedCosmeticProduct(
      tx,
      storefront,
      'GOOGLE',
      product.googleProductId,
    );
  if (hash(apple.contents) !== hash(google.contents))
    throw new ApiFailure('PACK_CONTENT_MISMATCH', 409);
  return { apple, google };
}
export class PackCatalogService {
  constructor(
    readonly db: PrismaClient,
    readonly policy: PackPolicy | null = null,
    readonly storefront: StorefrontPolicy | null = null,
  ) {
    if (policy) packPolicySchema.parse(policy);
  }
  async command(p: Principal, body: unknown) {
    const parsed = packAdminSchema.safeParse(body);
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
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.packId},6862))::text`;
        let result: unknown;
        if (input.action === 'DRAFT') {
          await tx.packDefinition.create({
            data: {
              id: input.packId,
              slug: input.slug,
              version: input.version,
              definition: json(input.definition),
              definitionHash: hash(input.definition),
              creatorId: p.userId,
            },
          });
          result = {
            id: input.packId,
            status: 'DRAFT',
            stateVersion: 1,
            definitionHash: hash(input.definition),
          };
        } else {
          const row = await tx.packDefinition.findUnique({
            where: { id: input.packId },
          });
          if (!row) throw new ApiFailure('PACK_UNAVAILABLE', 404);
          const definition = packDefinitionSchema.parse(row.definition);
          if (hash(definition) !== row.definitionHash)
            throw new Error('PACK_INTEGRITY');
          if (input.action === 'REVIEW') {
            if (
              row.status !== 'DRAFT' ||
              input.definitionHash !== row.definitionHash ||
              row.creatorId === p.userId
            )
              throw new ApiFailure('INDEPENDENT_PACK_REVIEW_REQUIRED', 409);
            await validatePackContents(tx, definition, this.storefront);
            await tx.packReview.create({
              data: {
                packId: row.id,
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
              throw new ApiFailure('STALE_PACK_VERSION', 409);
            if (input.action === 'PUBLISH') {
              await validatePackContents(tx, definition, this.storefront);
              const reviews = await tx.packReview.findMany({
                where: { packId: row.id, definitionHash: row.definitionHash },
              });
              if (
                reviews.length !== 2 ||
                new Set([
                  row.creatorId,
                  p.userId,
                  ...reviews.map((r) => r.reviewerId),
                ]).size !== 4
              )
                throw new ApiFailure('INDEPENDENT_PACK_REVIEW_REQUIRED', 409);
            }
            const updated = await tx.packDefinition.update({
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
          { ...input, action: 'PACK_' + input.action },
          capability,
          input.packId,
          input,
          result,
        );
        return result;
      },
      { timeout: 30000 },
    );
  }
  async list(platform: 'APPLE' | 'GOOGLE' = 'APPLE') {
    if (!this.policy)
      return packCatalogSchema.parse({ available: false, packs: [] });
    const rows = await this.db.packDefinition.findMany({
        where: { id: { in: this.policy.allowedPackIds }, status: 'PUBLISHED' },
        orderBy: { id: 'asc' },
        take: 100,
      }),
      packs = [];
    for (const row of rows) {
      const definition = packDefinitionSchema.parse(row.definition);
      if (hash(definition) !== row.definitionHash)
        throw new Error('PACK_INTEGRITY');
      const now = Date.now();
      if (
        now < Date.parse(definition.startsAt) ||
        now >= Date.parse(definition.endsAt)
      )
        continue;
      const fixed = await validatePackContents(
        this.db,
        definition,
        this.storefront,
      );
      if (
        definition.kind === 'FIXED_COSMETIC' &&
        (
          await this.db.productAvailability.findUnique({
            where: { productId: definition.cosmeticProductId },
          })
        )?.enabled === false
      )
        continue;
      const denominator =
        definition.kind === 'DISCOVERY'
          ? definition.pool.reduce((n, r) => n + r.weight, 0)
          : 0;
      packs.push(
        packViewSchema.parse({
          remainingStock:
            definition.stockLimit === null
              ? null
              : Math.max(
                  0,
                  definition.stockLimit -
                    ((
                      await this.db.packStock.findUnique({
                        where: { packId: row.id },
                      })
                    )?.issued ?? 0),
                ),
          id: row.id,
          slug: row.slug,
          version: row.version,
          definitionHash: row.definitionHash,
          definition,
          odds:
            definition.kind === 'DISCOVERY'
              ? definition.pool.map((r) => ({
                  reward: r.reward,
                  numerator: r.weight,
                  denominator,
                }))
              : [],
          fixedContents: fixed
            ? platform === 'APPLE'
              ? fixed.apple
              : fixed.google
            : null,
        }),
      );
    }
    return packCatalogSchema.parse({ available: true, packs });
  }
}
@Controller('v1/packs')
export class PackCatalogController {
  constructor(
    @Inject('PACK_CATALOG') readonly service: PackCatalogService | null,
    @Inject('AUTH_SERVICE') readonly auth: AuthService | null,
  ) {}
  @Get('catalog') async list(@Query() q: unknown) {
    const query = z
      .object({ platform: z.enum(['APPLE', 'GOOGLE']).default('APPLE') })
      .strict()
      .safeParse(q);
    if (!query.success) throw new ApiFailure('INVALID_REQUEST', 400);
    if (!this.service) return { available: false, packs: [] };
    return this.service.list(query.data.platform);
  }
  @Post('admin') @HttpCode(200) async command(
    @Req() r: Request,
    @Body() b: unknown,
  ) {
    if (!this.auth || !this.service)
      throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    return this.service.command(
      await this.auth.authenticate(r.headers.authorization),
      b,
    );
  }
}
