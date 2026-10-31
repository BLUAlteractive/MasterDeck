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
import type { AuthService, Principal } from '../auth/service';
import { contentCommandSchema } from '@deckforge/contracts';
import { catalogManifestSchema } from '@deckforge/card-domain';
import { ApiFailure } from '../auth/errors';
import { readCatalogManifest } from '../catalog';
import { hash } from '../rooms/shared';
import {
  adminAccess,
  adminPrior,
  adminRecord,
  type Capability,
} from './access';
export class ContentAdminService {
  constructor(readonly auth: AuthService) {}
  async command(p: Principal, body: unknown) {
    const parsed = contentCommandSchema.safeParse(body);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    const input = parsed.data;
    const capability: Capability =
      input.action === 'DRAFT'
        ? 'CONTENT_EDITOR'
        : input.action === 'REVIEW'
          ? 'CONTENT_REVIEWER'
          : input.action === 'PUBLISH' || input.action === 'RETIRE'
            ? 'CONTENT_PUBLISHER'
            : 'PRODUCT_OPERATOR';
    return this.auth.database.$transaction(async (tx) => {
      await adminAccess(tx, p, capability);
      const prior = await adminPrior(tx, p, input, input.commandId);
      if (prior) return prior.result;
      const scope =
        input.action === 'PRODUCT_SWITCH' ? input.productId : input.seriesId;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope},68443))::text`;
      let result: unknown;
      if (input.action === 'DRAFT') {
        if (await tx.cardSeries.findUnique({ where: { id: input.seriesId } }))
          throw new ApiFailure('SERIES_EXISTS', 409);
        await tx.cardSeries.create({
          data: {
            id: input.seriesId,
            slug: input.slug,
            displayName: input.displayName,
            rightsOwner: input.rightsOwner,
            status: 'DRAFT',
            starterEligible: false,
          },
        });
        await tx.cardTemplate.createMany({
          data: input.templates.map((t) => ({
            ...t,
            seriesId: input.seriesId,
            version: 1,
          })),
        });
        result = { seriesId: input.seriesId, status: 'DRAFT' };
      } else if (input.action === 'RETIRE') {
        const updated = await tx.cardSeries.updateMany({
          where: { id: input.seriesId, status: 'PUBLISHED' },
          data: { status: 'RETIRED' },
        });
        if (updated.count !== 1)
          throw new ApiFailure('PUBLISHED_SERIES_UNAVAILABLE', 409);
        result = { seriesId: input.seriesId, status: 'RETIRED' };
      } else if (input.action === 'PRODUCT_SWITCH') {
        const product = await tx.cosmeticProduct.findUnique({
          where: { id: input.productId },
          include: { items: { include: { item: true } } },
        });
        if (
          !product ||
          product.status !== 'PUBLISHED' ||
          !product.approvalReference ||
          !product.items.length ||
          product.items.some((i) => !i.item.approvalReference)
        )
          throw new ApiFailure('PRODUCT_UNAVAILABLE', 409);
        await tx.productAvailability.createMany({
          data: [{ productId: product.id }],
          skipDuplicates: true,
        });
        const row = await tx.productAvailability.update({
          where: { productId: product.id },
          data: { enabled: input.enabled, version: { increment: 1 } },
        });
        result = {
          productId: product.id,
          enabled: row.enabled,
          version: row.version,
        };
      } else {
        const entry = await tx.cardSeries.findUnique({
          where: { id: input.seriesId },
        });
        if (!entry || entry.status !== 'DRAFT')
          throw new ApiFailure('DRAFT_UNAVAILABLE', 409);
        const { manifest } = await readCatalogManifest(tx, entry);
        const published = catalogManifestSchema.safeParse({
          ...manifest,
          status: 'PUBLISHED',
        });
        if (!published.success)
          throw new ApiFailure('COMMERCIAL_REVIEW_REQUIRED', 409);
        const digest = hash(published.data);
        if (input.action === 'REVIEW') {
          const draft = await tx.adminAction.findFirst({
            where: { scope: entry.id, action: 'DRAFT' },
          });
          if (draft?.actorId === p.userId)
            throw new ApiFailure('INDEPENDENT_REVIEW_REQUIRED', 403);
          const other = await tx.contentReview.findFirst({
            where: {
              seriesId: entry.id,
              manifestHash: digest,
              review: { not: input.review },
            },
          });
          if (other?.reviewerId === p.userId)
            throw new ApiFailure('INDEPENDENT_REVIEW_REQUIRED', 403);
          await tx.contentReview.create({
            data: {
              seriesId: entry.id,
              manifestHash: digest,
              review: input.review,
              reviewerId: p.userId,
              evidence: input.evidence,
            },
          });
          result = {
            seriesId: entry.id,
            review: input.review,
            manifestHash: digest,
          };
        } else {
          const reviews = await tx.contentReview.findMany({
            where: { seriesId: entry.id, manifestHash: digest },
          });
          if (
            reviews.length !== 2 ||
            new Set(reviews.map((r) => r.reviewerId)).size !== 2 ||
            reviews.some((r) => r.reviewerId === p.userId)
          )
            throw new ApiFailure('INDEPENDENT_REVIEW_REQUIRED', 403);
          await tx.cardSeries.update({
            where: { id: entry.id },
            data: { status: 'PUBLISHED' },
          });
          result = {
            seriesId: entry.id,
            status: 'PUBLISHED',
            manifestHash: digest,
          };
        }
      }
      await adminRecord(tx, p, input, capability, scope, input, result);
      console.info(JSON.stringify({ event: 'admin.content', status: 'ok' }));
      return result;
    });
  }
  async list(p: Principal) {
    return this.auth.database.$transaction(async (tx) => {
      await adminAccess(tx, p, 'AUDITOR');
      const result = {
        series: await tx.cardSeries.findMany({
          take: 100,
          orderBy: { id: 'asc' },
          select: {
            id: true,
            displayName: true,
            status: true,
            manifestVersion: true,
          },
        }),
        products: await tx.cosmeticProduct.findMany({
          take: 100,
          orderBy: { id: 'asc' },
          select: { id: true, name: true, status: true },
        }),
      };
      return result;
    });
  }
}
@Controller('v1/admin/content')
export class ContentAdminController {
  constructor(@Inject('AUTH_SERVICE') readonly auth: AuthService | null) {}
  private service() {
    if (!this.auth) throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    return new ContentAdminService(this.auth);
  }
  @Get() async list(@Req() r: Request) {
    const s = this.service();
    return s.list(await s.auth.authenticate(r.headers.authorization));
  }
  @Post('commands') @HttpCode(200) async command(
    @Req() r: Request,
    @Body() b: unknown,
  ) {
    const s = this.service();
    return s.command(await s.auth.authenticate(r.headers.authorization), b);
  }
}
