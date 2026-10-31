import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { identityFixture } from '../test/auth-fixture';
import { fixtureAdmin } from '../test/admin-fixture';
import { cosmeticFixture } from '../test/cosmetic-fixture';
import { PackCatalogService } from './packs/catalog';
import { packCatalogSchema, type PackDefinition } from '@deckforge/contracts';
import { developmentCatalog } from '@deckforge/card-domain';
import { hash } from './rooms/shared';
let f: Awaited<ReturnType<typeof identityFixture>>,
  service: PackCatalogService,
  editor: Awaited<ReturnType<typeof fixtureAdmin>>,
  reviewer: typeof editor,
  economist: typeof editor,
  publisher: typeof editor,
  product: Awaited<ReturnType<typeof cosmeticFixture>>;
const packId = randomUUID(),
  fixedId = randomUUID(),
  key = () => ({
    commandId: randomUUID(),
    reason: 'Isolated pack catalog acceptance',
  });
const definition: PackDefinition = {
  kind: 'DISCOVERY',
  name: 'Test earned pool',
  startsAt: '2026-01-01T00:00:00Z',
  endsAt: '2030-01-01T00:00:00Z',
  regions: [],
  stockLimit: 100,
  currency: 'TRAIL_CREDITS',
  price: 100,
  drawCount: 2,
  duplicatePolicy: 'ALLOW_COPIES',
  guarantee: 'NONE',
  pool: [
    { weight: 1, reward: { kind: 'TRAIL_INK', units: 1 } },
    { weight: 3, reward: { kind: 'TRAIL_INK', units: 2 } },
  ],
};
beforeAll(async () => {
  f = await identityFixture();
  product = await cosmeticFixture(f.db);
  service = new PackCatalogService(
    f.db,
    {
      version: 'TEST_PACKS_V1',
      approvalReference: 'TEST_ONLY_NOT_APPROVAL',
      allowedPackIds: [packId, fixedId],
    },
    {
      version: 'TEST_ONLY_V1',
      approvalReference: 'TEST_ONLY_NOT_APPROVAL',
      allowedProductIds: [product.productId],
    },
  );
  editor = await fixtureAdmin(f, ['CONTENT_EDITOR', 'CONTENT_REVIEWER']);
  reviewer = await fixtureAdmin(f, ['CONTENT_REVIEWER']);
  economist = await fixtureAdmin(f, ['CONTENT_REVIEWER']);
  publisher = await fixtureAdmin(f, ['CONTENT_PUBLISHER']);
}, 30000);
afterAll(async () => {
  await f?.close();
});
it('requires current scoped MFA, does not mint from a draft and makes draft commands idempotent', async () => {
  const input = {
    ...key(),
    action: 'DRAFT',
    packId,
    slug: 'test-earned-pool',
    version: 1,
    definition,
  };
  await expect(
    service.command(f.players[0]!.principal, input),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  const before = await f.db.cardInstance.count();
  const receipts = await Promise.all(
    Array.from({ length: 10 }, () => service.command(editor.principal, input)),
  );
  for (const r of receipts) expect(r).toEqual(receipts[0]);
  expect(await f.db.cardInstance.count()).toBe(before);
  expect(await f.db.packDefinition.count({ where: { id: packId } })).toBe(1);
  expect((await service.list()).packs).toHaveLength(0);
});
it('requires independent content/economy reviewers and publisher for the exact definition hash', async () => {
  await expect(
    service.command(editor.principal, {
      ...key(),
      action: 'REVIEW',
      packId,
      review: 'CONTENT',
      definitionHash: hash(definition),
      evidence: 'TEST_ONLY_EVIDENCE',
    }),
  ).rejects.toMatchObject({ code: 'INDEPENDENT_PACK_REVIEW_REQUIRED' });
  await expect(
    service.command(publisher.principal, {
      ...key(),
      action: 'PUBLISH',
      packId,
      expectedVersion: 1,
    }),
  ).rejects.toMatchObject({ code: 'INDEPENDENT_PACK_REVIEW_REQUIRED' });
  await service.command(reviewer.principal, {
    ...key(),
    action: 'REVIEW',
    packId,
    review: 'CONTENT',
    definitionHash: hash(definition),
    evidence: 'TEST_ONLY_CONTENT',
  });
  await service.command(economist.principal, {
    ...key(),
    action: 'REVIEW',
    packId,
    review: 'ECONOMY',
    definitionHash: hash(definition),
    evidence: 'TEST_ONLY_ECONOMY',
  });
  await service.command(publisher.principal, {
    ...key(),
    action: 'PUBLISH',
    packId,
    expectedVersion: 1,
  });
  const view = packCatalogSchema.parse(await service.list()).packs[0]!;
  expect(view.definitionHash).toBe(hash(definition));
  expect(view.odds.map((o) => [o.numerator, o.denominator])).toEqual([
    [1, 4],
    [3, 4],
  ]);
  await expect(
    f.db.packDefinition.update({
      where: { id: packId },
      data: { definition: { kind: 'FORGED' }, stateVersion: 3 },
    }),
  ).rejects.toThrow();
  await expect(
    f.db.packReview.deleteMany({ where: { packId } }),
  ).rejects.toThrow();
});
it('publishes exact approved fixed cosmetic contents without functional power or odds and retires without rewriting history', async () => {
  const fixed: PackDefinition = {
    kind: 'FIXED_COSMETIC',
    name: 'Test exact cosmetics',
    startsAt: definition.startsAt,
    endsAt: definition.endsAt,
    regions: [],
    stockLimit: null,
    cosmeticProductId: product.productId,
    functionalEffects: false,
    randomized: false,
  };
  await service.command(editor.principal, {
    ...key(),
    action: 'DRAFT',
    packId: fixedId,
    slug: 'test-exact-cosmetics',
    version: 1,
    definition: fixed,
  });
  for (const [actor, review] of [
    [reviewer, 'CONTENT'],
    [economist, 'ECONOMY'],
  ] as const)
    await service.command(actor.principal, {
      ...key(),
      action: 'REVIEW',
      packId: fixedId,
      review,
      definitionHash: hash(fixed),
      evidence: 'TEST_ONLY_NOT_APPROVAL',
    });
  await service.command(publisher.principal, {
    ...key(),
    action: 'PUBLISH',
    packId: fixedId,
    expectedVersion: 1,
  });
  const view = (await service.list()).packs.find((p) => p.id === fixedId)!;
  expect(view.odds).toHaveLength(0);
  expect(view.fixedContents?.contents.map((i) => i.id)).toEqual([
    product.itemId,
  ]);
  await service.command(publisher.principal, {
    ...key(),
    action: 'RETIRE',
    packId,
    expectedVersion: 2,
  });
  expect((await service.list()).packs.map((p) => p.id)).not.toContain(packId);
  expect(
    (await f.db.packDefinition.findUniqueOrThrow({ where: { id: packId } }))
      .definitionHash,
  ).toBe(hash(definition));
});
it('rejects unpublished earned artwork and raw client mint or paid-random definitions', async () => {
  const id = randomUUID(),
    bad = {
      ...definition,
      pool: [
        {
          weight: 1,
          reward: {
            kind: 'CARD',
            templateId: developmentCatalog.templates[0]!.id,
            branch: 'BLUE',
          },
        },
      ],
    };
  await service.command(editor.principal, {
    ...key(),
    action: 'DRAFT',
    packId: id,
    slug: 'test-unpublished-art',
    version: 1,
    definition: bad,
  });
  await expect(
    service.command(reviewer.principal, {
      ...key(),
      action: 'REVIEW',
      packId: id,
      review: 'CONTENT',
      definitionHash: hash(bad),
      evidence: 'TEST_ONLY_NOT_APPROVAL',
    }),
  ).rejects.toMatchObject({ code: 'PACK_ART_NOT_PUBLISHED' });
  expect(
    (
      await f.request('packs/admin', editor.bearer, {
        ...key(),
        action: 'MINT',
        packId: id,
      })
    ).status,
  ).toBe(400);
  await expect(
    service.command(editor.principal, {
      ...key(),
      action: 'DRAFT',
      packId: randomUUID(),
      slug: 'test-paid-random',
      version: 1,
      definition: { ...definition, currency: 'STORE_GEMS' },
    }),
  ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  expect((await new PackCatalogService(f.db).list()).available).toBe(false);
});
