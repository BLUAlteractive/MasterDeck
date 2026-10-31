import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createDatabase, type PrismaClient } from '@deckforge/database';
import { developmentCatalog } from '@deckforge/card-domain';
import { catalogListSchema } from '@deckforge/contracts';
import { createApp } from './app';
let database: PrismaClient;
let app: Awaited<ReturnType<typeof createApp>>;
let base: string;
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? 'http://missing.invalid');
  if (
    url.hostname !== '127.0.0.1' ||
    !/^deckforge_test_[a-f0-9]{16}$/.test(
      process.env.DECKFORGE_DISPOSABLE_DB ?? '',
    ) ||
    url.pathname !== '/' + process.env.DECKFORGE_DISPOSABLE_DB
  )
    throw new Error('Owned disposable DB required.');
  database = createDatabase(url.toString());
  app = await createApp([], null, database);
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
afterAll(async () => {
  await app?.close();
  await database?.$disconnect();
});
describe('versioned catalog assets in PostgreSQL and public API', () => {
  it('stores 53 assets and 52 version-one templates without publishing the preview', async () => {
    expect(
      await database.designAsset.count({
        where: { id: { in: developmentCatalog.assets.map((a) => a.id) } },
      }),
    ).toBe(53);
    const templates = await database.cardTemplate.findMany({
      where: { seriesId: developmentCatalog.seriesId, version: 1 },
    });
    expect(templates).toHaveLength(52);
    expect(new Set(templates.map((template) => template.faceId)).size).toBe(52);
    expect(
      templates.every(
        (template) => template.frontAssetId && template.backAssetId,
      ),
    ).toBe(true);
    const response = await fetch(base + '/v1/catalog/series');
    expect(response.status).toBe(200);
    expect(catalogListSchema.parse(await response.json()).items).toHaveLength(
      0,
    );
  });
  it('rejects incorrect asset kinds/faces, missing rights evidence and mutable content', async () => {
    const template = developmentCatalog.templates[0]!;
    const other = developmentCatalog.templates[1]!;
    await expect(
      database.cardTemplate.create({
        data: {
          seriesId: developmentCatalog.seriesId,
          faceId: template.faceId,
          version: 888,
          playStyleFamily: 'fixture-only',
          frontAssetId: other.frontAssetId,
          backAssetId: template.backAssetId,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      database.cardTemplate.create({
        data: {
          seriesId: developmentCatalog.seriesId,
          faceId: template.faceId,
          version: 888,
          playStyleFamily: 'fixture-only',
          frontAssetId: template.frontAssetId,
          backAssetId: template.frontAssetId,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      database.designAsset.update({
        where: { id: template.frontAssetId },
        data: { useScope: 'COMMERCIAL' },
      }),
    ).rejects.toThrow();
    await expect(
      database.designAsset.update({
        where: { id: template.frontAssetId },
        data: { sha256: 'a'.repeat(64) },
      }),
    ).rejects.toThrow();
    await expect(
      database.cardTemplate.update({
        where: { id: template.id },
        data: { playStyleFamily: 'paid-override' },
      }),
    ).rejects.toThrow();
    await expect(
      database.designAsset.delete({ where: { id: template.backAssetId } }),
    ).rejects.toThrow();
  });
  it('fails closed if an operator marks unapproved draft art published', async () => {
    await database.cardSeries.update({
      where: { id: developmentCatalog.seriesId },
      data: { status: 'PUBLISHED' },
    });
    try {
      expect((await fetch(base + '/v1/catalog/series')).status).toBe(503);
    } finally {
      await database.cardSeries.update({
        where: { id: developmentCatalog.seriesId },
        data: { status: 'DRAFT' },
      });
    }
  });
  it('returns only safe published metadata when synthetic test approval evidence is present', async () => {
    // Synthetic proof exists only in this runner-owned DB; never in the real draft manifest.
    await database.designAsset.updateMany({
      where: { id: { in: developmentCatalog.assets.map((a) => a.id) } },
      data: {
        useScope: 'COMMERCIAL',
        approvalReference: 'TEST_ONLY_APPROVAL_FIXTURE',
      },
    });
    await database.cardSeries.update({
      where: { id: developmentCatalog.seriesId },
      data: { status: 'PUBLISHED' },
    });
    try {
      const response = await fetch(base + '/v1/catalog/series');
      expect(response.status).toBe(200);
      const body = catalogListSchema.parse(await response.json());
      expect(body.items).toHaveLength(1);
      expect(body.items[0]!.cards).toHaveLength(52);
      expect(JSON.stringify(body)).not.toMatch(
        /approvalReference|sourceRef|rightsHolder/,
      );
      expect((await fetch(base + '/v1/catalog/series?limit=1000')).status).toBe(
        400,
      );
      expect(
        (await fetch(base + '/v1/catalog/series?cursor=' + randomUUID()))
          .status,
      ).toBe(200);
    } finally {
      await database.cardSeries.update({
        where: { id: developmentCatalog.seriesId },
        data: { status: 'DRAFT' },
      });
      await database.designAsset.updateMany({
        where: { id: { in: developmentCatalog.assets.map((a) => a.id) } },
        data: { useScope: 'INTERNAL_PREVIEW', approvalReference: null },
      });
    }
  });
});
