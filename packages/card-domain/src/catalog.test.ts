import { describe, expect, it } from 'vitest';
import { artAssetSchema, catalogManifestSchema } from './catalog';
import { developmentCatalog } from './development-catalog';
describe('original catalog and rights metadata', () => {
  it('validates all 52 draft face mappings and one back', () => {
    const catalog = catalogManifestSchema.parse(developmentCatalog);
    expect(catalog.templates).toHaveLength(52);
    expect(
      catalog.assets.filter((asset) => asset.kind === 'BACK'),
    ).toHaveLength(1);
    expect(
      catalog.assets.every(
        (asset) => asset.rights.useScope === 'INTERNAL_PREVIEW',
      ),
    ).toBe(true);
  });
  it('rejects missing, duplicate and unknown face mappings', () => {
    const first = developmentCatalog.templates[0]!;
    for (const templates of [
      developmentCatalog.templates.slice(1),
      [first, first, ...developmentCatalog.templates.slice(2)],
      [{ ...first, faceId: 'JOKER' }, ...developmentCatalog.templates.slice(1)],
    ])
      expect(
        catalogManifestSchema.safeParse({ ...developmentCatalog, templates })
          .success,
      ).toBe(false);
  });
  it('rejects missing or misassigned front/back assets', () => {
    const first = developmentCatalog.templates[0]!;
    for (const patch of [
      { frontAssetId: first.backAssetId },
      { backAssetId: first.frontAssetId },
      { frontAssetId: developmentCatalog.templates[1]!.frontAssetId },
    ]) {
      expect(
        catalogManifestSchema.safeParse({
          ...developmentCatalog,
          templates: [
            { ...first, ...patch },
            ...developmentCatalog.templates.slice(1),
          ],
        }).success,
      ).toBe(false);
    }
  });
  it('rejects unsafe paths, corrupted hashes and missing provenance', () => {
    const asset = developmentCatalog.assets[0]!;
    for (const patch of [
      { key: '../secret.svg' },
      { key: 'https://untrusted.example/card.svg' },
      { sha256: 'invalid' },
      { rights: { ...asset.rights, basis: 'UNLICENSED' } },
      { rights: { ...asset.rights, sourceRef: '' } },
      { rights: { ...asset.rights, useScope: 'COMMERCIAL' } },
    ])
      expect(artAssetSchema.safeParse({ ...asset, ...patch }).success).toBe(
        false,
      );
  });
  it('does not treat a valid internal preview as permission to publish', () => {
    expect(
      catalogManifestSchema.safeParse({
        ...developmentCatalog,
        status: 'PUBLISHED',
      }).success,
    ).toBe(false);
  });
});
