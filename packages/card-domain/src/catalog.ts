import { z } from 'zod';
import { canonicalFaces } from '@deckforge/game-core';

export const raritySchema = z.enum([
  'COMMON',
  'UNCOMMON',
  'RARE',
  'EPIC',
  'LEGENDARY',
]);
const faceIdSchema = z
  .string()
  .refine(
    (id) => canonicalFaces.some((face) => face.id === id),
    'Unknown face',
  );
export const artAssetSchema = z
  .object({
    id: z.uuid(),
    key: z
      .string()
      .regex(
        /^foundation\/v[1-9][0-9]*\/(?:front\/(?:[2-9]|10|J|Q|K|A)-[CDHS]|back)\.svg$/,
      ),
    kind: z.enum(['FRONT', 'BACK']),
    faceId: faceIdSchema.nullable(),
    mimeType: z.literal('image/svg+xml'),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    width: z.literal(240),
    height: z.literal(336),
    rights: z
      .object({
        basis: z.literal('ORIGINAL_CODE'),
        holder: z.literal('PROJECT_SOURCE_CONTRIBUTORS'),
        sourceRef: z.literal('packages/ui/src/card-art.ts'),
        useScope: z.enum(['INTERNAL_PREVIEW', 'COMMERCIAL']),
        approvalReference: z.string().min(8).max(200).optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((asset, ctx) => {
    if ((asset.kind === 'FRONT') !== (asset.faceId !== null))
      ctx.addIssue({ code: 'custom', message: 'Asset kind/face mismatch' });
    if (
      asset.kind === 'FRONT' &&
      !asset.key.endsWith('/front/' + asset.faceId + '.svg')
    )
      ctx.addIssue({ code: 'custom', message: 'Asset key/face mismatch' });
    if (asset.kind === 'BACK' && !asset.key.endsWith('/back.svg'))
      ctx.addIssue({ code: 'custom', message: 'Back key mismatch' });
    if (
      asset.rights.useScope === 'COMMERCIAL' &&
      !asset.rights.approvalReference
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Commercial approval evidence required',
      });
  });
export const catalogManifestSchema = z
  .object({
    version: z.number().int().positive(),
    seriesId: z.uuid(),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    displayName: z.string().min(1).max(120),
    status: z.enum(['DRAFT', 'PUBLISHED']),
    assets: z.array(artAssetSchema).length(53).readonly(),
    templates: z
      .array(
        z
          .object({
            id: z.uuid(),
            faceId: faceIdSchema,
            frontAssetId: z.uuid(),
            backAssetId: z.uuid(),
            rarity: raritySchema,
            playStyleFamily: z.string().regex(/^[a-z0-9-]{3,80}$/),
          })
          .strict(),
      )
      .length(52)
      .readonly(),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (
      new Set(manifest.assets.map((asset) => asset.id)).size !== 53 ||
      new Set(manifest.assets.map((asset) => asset.key)).size !== 53
    )
      fail('Duplicate asset identity');
    if (
      new Set(manifest.templates.map((template) => template.id)).size !== 52 ||
      new Set(manifest.templates.map((template) => template.faceId)).size !== 52
    )
      fail('Templates must map 52 unique faces');
    if (manifest.assets.filter((asset) => asset.kind === 'BACK').length !== 1)
      fail('Exactly one symmetric base back required');
    for (const template of manifest.templates) {
      const front = manifest.assets.find(
        (asset) => asset.id === template.frontAssetId,
      );
      const back = manifest.assets.find(
        (asset) => asset.id === template.backAssetId,
      );
      if (
        !front ||
        front.kind !== 'FRONT' ||
        front.faceId !== template.faceId ||
        !back ||
        back.kind !== 'BACK'
      )
        fail('Template asset mapping mismatch');
    }
    if (
      manifest.status === 'PUBLISHED' &&
      manifest.assets.some(
        (asset) =>
          asset.rights.useScope !== 'COMMERCIAL' ||
          !asset.rights.approvalReference,
      )
    )
      fail('Unapproved art cannot be published');
  });
export type CatalogManifest = z.infer<typeof catalogManifestSchema>;
