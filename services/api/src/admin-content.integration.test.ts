import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { developmentCatalog } from '@deckforge/card-domain';
import { identityFixture } from '../test/auth-fixture';
import { fixtureAdmin } from '../test/admin-fixture';
import { cosmeticFixture } from '../test/cosmetic-fixture';
import { ContentAdminService } from './admin/content';
let f: Awaited<ReturnType<typeof identityFixture>>,
  service: ContentAdminService,
  editor: Awaited<ReturnType<typeof fixtureAdmin>>,
  designer: typeof editor,
  producer: typeof editor,
  publisher: typeof editor;
const seriesId = randomUUID(),
  key = () => ({
    commandId: randomUUID(),
    reason: 'Isolated content review acceptance',
  });
const assets = developmentCatalog.assets.map((a) => ({
  id: randomUUID(),
  key: a.key.replace('/v1/', '/v1744/'),
  kind: a.kind,
  faceId: a.faceId,
  sha256: a.sha256,
  mimeType: a.mimeType,
  width: a.width,
  height: a.height,
  rightsBasis: a.rights.basis,
  rightsHolder: a.rights.holder,
  sourceRef: a.rights.sourceRef,
  useScope: 'COMMERCIAL' as const,
  approvalReference: 'FIXTURE_APPROVAL_NOT_LIVE',
}));
const templates = developmentCatalog.templates.map((t) => ({
  ...t,
  id: randomUUID(),
  frontAssetId: assets.find((a) => a.faceId === t.faceId)!.id,
  backAssetId: assets.find((a) => a.kind === 'BACK')!.id,
}));
beforeAll(async () => {
  f = await identityFixture();
  service = new ContentAdminService(f.auth);
  editor = await fixtureAdmin(f, [
    'CONTENT_EDITOR',
    'CONTENT_REVIEWER',
    'PRODUCT_OPERATOR',
  ]);
  designer = await fixtureAdmin(f, ['CONTENT_REVIEWER']);
  producer = await fixtureAdmin(f, ['CONTENT_REVIEWER']);
  publisher = await fixtureAdmin(f, ['CONTENT_PUBLISHER', 'AUDITOR']);
  await f.db.designAsset.createMany({ data: assets });
}, 30000);
afterAll(async () => {
  await f?.close();
});
it('requires scoped fresh MFA and rejects unknown mint commands and unscoped administrators', async () => {
  const command = {
    ...key(),
    action: 'DRAFT',
    seriesId,
    slug: 'fixture-admin-series',
    displayName: 'Fixture original art',
    rightsOwner: 'FIXTURE_ONLY',
    templates,
  };
  expect(
    (await f.request('admin/content/commands', f.players[0]!.bearer, command))
      .status,
  ).toBe(403);
  await expect(
    service.command(publisher.principal, command),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(
    service.command(editor.principal, { ...command, mint: 100 }),
  ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  const receipts = await Promise.all(
    Array.from({ length: 10 }, () =>
      service.command(editor.principal, command),
    ),
  );
  for (const receipt of receipts) expect(receipt).toEqual(receipts[0]);
  expect(await f.db.cardTemplate.count({ where: { seriesId } })).toBe(52);
  expect(await f.db.cardInstance.count({ where: { seriesId } })).toBe(0);
  expect(
    await f.db.adminAction.count({
      where: { scope: seriesId, action: 'DRAFT' },
    }),
  ).toBe(1);
  await expect(
    service.command(editor.principal, { ...command, displayName: 'Other' }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
});
it('requires independent current-manifest design/production reviewers and publisher with immutable audit', async () => {
  await expect(
    service.command(publisher.principal, {
      ...key(),
      action: 'PUBLISH',
      seriesId,
    }),
  ).rejects.toMatchObject({ code: 'INDEPENDENT_REVIEW_REQUIRED' });
  await expect(
    service.command(editor.principal, {
      ...key(),
      action: 'REVIEW',
      seriesId,
      review: 'DESIGN',
      evidence: 'fixture-only-evidence',
    }),
  ).rejects.toMatchObject({ code: 'INDEPENDENT_REVIEW_REQUIRED' });
  await service.command(designer.principal, {
    ...key(),
    action: 'REVIEW',
    seriesId,
    review: 'DESIGN',
    evidence: 'fixture-only-designer',
  });
  await expect(
    service.command(designer.principal, {
      ...key(),
      action: 'REVIEW',
      seriesId,
      review: 'PRODUCTION',
      evidence: 'fixture-only-producer',
    }),
  ).rejects.toMatchObject({ code: 'INDEPENDENT_REVIEW_REQUIRED' });
  await service.command(producer.principal, {
    ...key(),
    action: 'REVIEW',
    seriesId,
    review: 'PRODUCTION',
    evidence: 'fixture-only-producer',
  });
  const publish = { ...key(), action: 'PUBLISH', seriesId };
  await service.command(publisher.principal, publish);
  expect(
    (await f.db.cardSeries.findUniqueOrThrow({ where: { id: seriesId } }))
      .status,
  ).toBe('PUBLISHED');
  expect((await f.request('catalog/series')).status).toBe(200);
  await expect(
    f.db.adminAction.deleteMany({ where: { scope: seriesId } }),
  ).rejects.toThrow();
  await expect(
    f.db.contentReview.deleteMany({ where: { seriesId } }),
  ).rejects.toThrow();
  expect(await f.db.cardInstance.count({ where: { seriesId } })).toBe(0);
  await service.command(publisher.principal, {
    ...key(),
    action: 'RETIRE',
    seriesId,
  });
});
it('audits versioned live product switches once and denies revoked scopes without revoking prior entitlements', async () => {
  const product = await cosmeticFixture(f.db),
    command = {
      ...key(),
      action: 'PRODUCT_SWITCH',
      productId: product.productId,
      enabled: false,
    };
  await Promise.all(
    Array.from({ length: 10 }, () =>
      service.command(editor.principal, command),
    ),
  );
  expect(
    await f.db.productAvailability.findUnique({
      where: { productId: product.productId },
    }),
  ).toMatchObject({ enabled: false, version: 2 });
  await expect(
    f.db.productAvailability.update({
      where: { productId: product.productId },
      data: { enabled: true, version: { increment: 1 } },
    }),
  ).rejects.toThrow();
  await f.db.adminCapability.update({
    where: {
      userId_capability: {
        userId: editor.userId,
        capability: 'PRODUCT_OPERATOR',
      },
    },
    data: { revokedAt: new Date() },
  });
  await expect(
    service.command(editor.principal, { ...command, ...key(), enabled: true }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(
    f.db.adminCapability.deleteMany({ where: { userId: editor.userId } }),
  ).rejects.toThrow();
  expect(
    (await service.list(publisher.principal)).series.some(
      (s) => s.id === seriesId,
    ),
  ).toBe(true);
});
