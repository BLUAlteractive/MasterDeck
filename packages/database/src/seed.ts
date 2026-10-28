import { canonicalFaces } from '@deckforge/game-core';
import {
  catalogManifestSchema,
  developmentCatalog,
} from '@deckforge/card-domain';
import type { PrismaClient } from './generated/client';

export const sampleSeriesId = '11111111-1111-4111-8111-111111111111';

/** Non-destructive development catalog seed; never grants instances or overwrites catalog. */
export async function seedFoundation(database: PrismaClient) {
  const catalog = catalogManifestSchema.parse(developmentCatalog);
  if (catalog.status !== 'DRAFT')
    throw new Error('Development seeding cannot publish a catalog.');
  const faces = canonicalFaces.map(({ id, rank, suit }) => ({
    id,
    rank,
    suit,
  }));
  await database.$transaction(async (tx) => {
    await tx.faceDefinition.createMany({ data: faces, skipDuplicates: true });
    await tx.cardSeries.createMany({
      data: [
        {
          id: sampleSeriesId,
          slug: 'deckforge-foundation-sample',
          displayName: 'Foundation Sample (development only)',
          rightsOwner: 'DEVELOPMENT_SAMPLE_NO_ART_ASSETS',
          status: 'DRAFT',
        },
      ],
      skipDuplicates: true,
    });
    await tx.cardSeries.updateMany({
      where: {
        id: sampleSeriesId,
        status: 'DRAFT',
        rightsOwner: 'DEVELOPMENT_SAMPLE_NO_ART_ASSETS',
      },
      data: { rightsOwner: 'PROJECT_AUTHORED_CODE_PENDING_REVIEW' },
    });
    for (const asset of catalog.assets) {
      const prior = await tx.designAsset.findUnique({
        where: { id: asset.id },
      });
      if (prior && (prior.sha256 !== asset.sha256 || prior.key !== asset.key))
        throw new Error(
          'Immutable art version conflict; create a new version.',
        );
    }
    await tx.designAsset.createMany({
      data: catalog.assets.map((asset) => ({
        id: asset.id,
        key: asset.key,
        kind: asset.kind,
        faceId: asset.faceId,
        mimeType: asset.mimeType,
        sha256: asset.sha256,
        width: asset.width,
        height: asset.height,
        rightsBasis: asset.rights.basis,
        rightsHolder: asset.rights.holder,
        sourceRef: asset.rights.sourceRef,
        useScope: asset.rights.useScope,
        approvalReference: asset.rights.approvalReference ?? null,
      })),
      skipDuplicates: true,
    });
    const templates = catalog.templates.map((template) => ({
      id: template.id,
      seriesId: sampleSeriesId,
      faceId: template.faceId,
      version: catalog.version,
      rarity: template.rarity,
      playStyleFamily: template.playStyleFamily,
      frontAssetId: template.frontAssetId,
      backAssetId: template.backAssetId,
    }));
    const existing = await tx.cardTemplate.findMany({
      where: { seriesId: sampleSeriesId, version: catalog.version },
    });
    if (
      existing.some(
        (prior) =>
          !templates.some(
            (template) =>
              template.id === prior.id &&
              template.faceId === prior.faceId &&
              template.frontAssetId === prior.frontAssetId &&
              template.backAssetId === prior.backAssetId &&
              template.rarity === prior.rarity &&
              template.playStyleFamily === prior.playStyleFamily,
          ),
      )
    )
      throw new Error('Immutable catalog template version conflict.');
    await tx.cardTemplate.createMany({ data: templates, skipDuplicates: true });
  });
}
