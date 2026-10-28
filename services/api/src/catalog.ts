import { Controller, Get, Inject, Query } from '@nestjs/common';
import type { PrismaClient } from '@deckforge/database';
import { catalogManifestSchema } from '@deckforge/card-domain';
import {
  catalogListSchema,
  catalogQuerySchema,
  publicCatalogAssetSchema,
} from '@deckforge/contracts';
import { ApiFailure } from './auth/errors';

@Controller('v1/catalog')
export class CatalogController {
  constructor(
    @Inject('CATALOG_DATABASE') private readonly database: PrismaClient | null,
  ) {}
  @Get('series')
  async series(@Query() query: unknown) {
    const input = catalogQuerySchema.safeParse(query);
    if (!input.success) throw new ApiFailure('INVALID_REQUEST', 400);
    if (!this.database) throw new ApiFailure('CATALOG_NOT_CONFIGURED', 503);
    const series = await this.database.cardSeries.findMany({
      where: {
        status: 'PUBLISHED',
        ...(input.data.cursor ? { id: { gt: input.data.cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: input.data.limit + 1,
    });
    const page = series.slice(0, input.data.limit);
    const items = [];
    for (const entry of page) {
      const templates = await this.database.cardTemplate.findMany({
        where: { seriesId: entry.id, version: entry.manifestVersion },
        include: { frontAsset: true, backAsset: true },
        orderBy: { faceId: 'asc' },
      });
      const assets = [
        ...new Map(
          templates
            .flatMap((template) => [template.frontAsset, template.backAsset])
            .filter((asset) => asset !== null)
            .map((asset) => [asset.id, asset]),
        ).values(),
      ];
      const manifest = catalogManifestSchema.safeParse({
        version: entry.manifestVersion,
        seriesId: entry.id,
        slug: entry.slug,
        displayName: entry.displayName,
        status: entry.status,
        assets: assets.map((asset) => ({
          id: asset.id,
          key: asset.key,
          kind: asset.kind,
          faceId: asset.faceId,
          mimeType: asset.mimeType,
          sha256: asset.sha256,
          width: asset.width,
          height: asset.height,
          rights: {
            basis: asset.rightsBasis,
            holder: asset.rightsHolder,
            sourceRef: asset.sourceRef,
            useScope: asset.useScope,
            ...(asset.approvalReference
              ? { approvalReference: asset.approvalReference }
              : {}),
          },
        })),
        templates: templates.map((template) => ({
          id: template.id,
          faceId: template.faceId,
          frontAssetId: template.frontAssetId,
          backAssetId: template.backAssetId,
          rarity: template.rarity,
          playStyleFamily: template.playStyleFamily,
        })),
      });
      if (!manifest.success) throw new ApiFailure('CATALOG_UNAVAILABLE', 503);
      const publicArt = (
        asset: NonNullable<(typeof templates)[number]['frontAsset']>,
      ) =>
        publicCatalogAssetSchema.parse({
          id: asset.id,
          key: asset.key,
          sha256: asset.sha256,
          width: asset.width,
          height: asset.height,
        });
      items.push({
        id: entry.id,
        slug: entry.slug,
        displayName: entry.displayName,
        version: entry.manifestVersion,
        cards: templates.map((template) => ({
          faceId: template.faceId,
          rarity: template.rarity,
          playStyleFamily: template.playStyleFamily,
          front: publicArt(template.frontAsset!),
          back: publicArt(template.backAsset!),
        })),
      });
    }
    return catalogListSchema.parse({
      items,
      nextCursor: series.length > input.data.limit ? page.at(-1)?.id : null,
    });
  }
}
