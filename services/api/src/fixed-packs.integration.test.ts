import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PackDefinition } from '@deckforge/contracts';
import { identityFixture } from '../test/auth-fixture';
import { cosmeticFixture } from '../test/cosmetic-fixture';
import { billingFixture } from '../test/billing-fixture';
import { fixtureAdmin } from '../test/admin-fixture';
import { PackCatalogService } from './packs/catalog';
import { FixedPackService } from './packs/fixed';
import { BillingService } from './billing/service';
import { hash } from './rooms/shared';
import { ContentAdminService } from './admin/content';
let f: Awaited<ReturnType<typeof identityFixture>>,
  product: Awaited<ReturnType<typeof cosmeticFixture>>,
  unrelated: typeof product,
  catalog: PackCatalogService,
  billing: BillingService,
  service: FixedPackService;
const fixture = billingFixture(),
  packId = randomUUID();
const definition = (productId: string): PackDefinition => ({
  kind: 'FIXED_COSMETIC',
  name: 'Test exact three-piece pack',
  startsAt: '2026-01-01T00:00:00Z',
  endsAt: '2030-01-01T00:00:00Z',
  regions: [],
  stockLimit: null,
  cosmeticProductId: productId,
  functionalEffects: false,
  randomized: false,
});
beforeAll(async () => {
  f = await identityFixture();
  product = await cosmeticFixture(f.db, true, 3);
  unrelated = await cosmeticFixture(f.db);
  const policy = {
    version: 'TEST_FIXED_V1',
    approvalReference: 'TEST_ONLY_NOT_APPROVAL',
    allowedProductIds: [product.productId, unrelated.productId],
  };
  catalog = new PackCatalogService(
    f.db,
    {
      version: 'TEST_PACK_V1',
      approvalReference: 'TEST_ONLY_NOT_APPROVAL',
      allowedPackIds: [packId],
    },
    policy,
  );
  billing = new BillingService(f.db, fixture.config, policy);
  service = new FixedPackService(catalog, billing);
  const editor = await fixtureAdmin(f, ['CONTENT_EDITOR']),
    reviewer = await fixtureAdmin(f, ['CONTENT_REVIEWER']),
    economist = await fixtureAdmin(f, ['CONTENT_REVIEWER']),
    publisher = await fixtureAdmin(f, ['CONTENT_PUBLISHER']);
  const command = () => ({
    commandId: randomUUID(),
    reason: 'TEST_ONLY_NOT_APPROVAL',
    packId,
  });
  await catalog.command(editor.principal, {
    ...command(),
    action: 'DRAFT',
    slug: 'test-fixed-' + packId,
    version: 1,
    definition: definition(product.productId),
  });
  for (const [actor, review] of [
    [reviewer, 'CONTENT'],
    [economist, 'ECONOMY'],
  ] as const)
    await catalog.command(actor.principal, {
      ...command(),
      action: 'REVIEW',
      review,
      definitionHash: hash(definition(product.productId)),
      evidence: 'TEST_ONLY_NOT_APPROVAL',
    });
  await catalog.command(publisher.principal, {
    ...command(),
    action: 'PUBLISH',
    expectedVersion: 1,
  });
}, 30000);
afterAll(async () => {
  await f?.close();
});
const offerQuery = () => ({
  platform: 'APPLE',
  expectedDefinitionHash: hash(definition(product.productId)),
});
it('binds a reviewed fixed pack to exact platform SKU/contents and grants all three only once under concurrent verified proofs', async () => {
  const a = await f.actor(false),
    context = await billing.context(a.principal),
    offer = await service.offer(a.principal, packId, offerQuery());
  expect(offer.product.contents.map((i) => i.id).sort()).toEqual(
    product.itemIds.sort(),
  );
  expect(offer.product.platformProductId).toBe(product.appleProductId);
  expect(offer.functionalEffects).toBe(false);
  await expect(
    new FixedPackService(
      catalog,
      new BillingService(f.db, fixture.config, {
        ...billing.catalog,
        allowedProductIds: [],
      }),
    ).offer(a.principal, packId, offerQuery()),
  ).rejects.toMatchObject({ code: 'PRODUCT_UNAVAILABLE' });
  const proof = fixture.proof(
    'APPLE',
    context.appleAppAccountToken,
    offer.product.platformProductId,
  );
  const beforeCards = await f.db.cardInstance.count(),
    receipts = await Promise.all(
      Array.from({ length: 10 }, () => billing.verify(a.principal, proof)),
    );
  expect(new Set(receipts.map((r) => r.purchaseId)).size).toBe(1);
  expect(
    await f.db.cosmeticGrant.count({
      where: { purchaseId: receipts[0]!.purchaseId, status: 'ACTIVE' },
    }),
  ).toBe(3);
  expect(
    (await billing.currentPurchase(a.principal, receipts[0]!.purchaseId))
      .product.contents,
  ).toEqual(offer.product.contents);
  expect(await f.db.cardInstance.count()).toBe(beforeCards);
  expect(
    await f.db.restrictedAccount.count({ where: { userId: a.userId } }),
  ).toBe(0);
  expect(
    await f.db.playChipAccount.count({ where: { userId: a.userId } }),
  ).toBe(0);
  expect(await f.db.supplyEvent.count({ where: { userId: a.userId } })).toBe(0);
});
it('revokes the entire pack, preserves unrelated entitlements and never resurrects it on restore', async () => {
  const a = await f.actor(false),
    context = await billing.context(a.principal),
    proof = fixture.proof(
      'GOOGLE',
      context.googleObfuscatedAccountId,
      product.googleProductId,
    ),
    other = fixture.proof(
      'GOOGLE',
      context.googleObfuscatedAccountId,
      unrelated.googleProductId,
    );
  const purchased = await billing.verify(a.principal, proof),
    otherReceipt = await billing.verify(a.principal, other),
    original = { ...fixture.records.get(hash(proof))! };
  fixture.records.set(hash(proof), { ...original, state: 'REVOKED' });
  await billing.verify(a.principal, proof);
  expect(
    await f.db.cosmeticGrant.count({
      where: { purchaseId: purchased.purchaseId, status: 'REVOKED' },
    }),
  ).toBe(3);
  expect(
    await f.db.cosmeticGrant.count({
      where: { purchaseId: otherReceipt.purchaseId, status: 'ACTIVE' },
    }),
  ).toBe(1);
  fixture.records.set(hash(proof), original);
  expect(await billing.verify(a.principal, proof)).toEqual(purchased);
  expect(
    (await billing.currentPurchase(a.principal, purchased.purchaseId)).status,
  ).toBe('REVOKED');
  expect(
    await f.db.cosmeticGrant.count({
      where: { purchaseId: purchased.purchaseId, status: 'ACTIVE' },
    }),
  ).toBe(0);
});
it('rejects guest/stale/forged admission and fulfills a legitimate delayed proof after sale visibility is disabled', async () => {
  await expect(
    service.offer(f.players[0]!.principal, packId, offerQuery()),
  ).rejects.toMatchObject({ code: 'PERMANENT_ACCOUNT_REQUIRED' });
  const a = await f.actor(false),
    context = await billing.context(a.principal),
    proof = fixture.proof(
      'APPLE',
      context.appleAppAccountToken,
      product.appleProductId,
    );
  await expect(
    service.offer(a.principal, packId, {
      ...offerQuery(),
      expectedDefinitionHash: 'a'.repeat(64),
    }),
  ).rejects.toMatchObject({ code: 'PACK_OFFER_CHANGED' });
  await expect(
    billing.verify(a.principal, {
      platform: 'APPLE',
      signedTransaction: 'forged',
    }),
  ).rejects.toMatchObject({ code: 'PAYMENT_UNVERIFIED' });
  const operator = await fixtureAdmin(f, ['PRODUCT_OPERATOR']);
  await new ContentAdminService(f.auth).command(operator.principal, {
    commandId: randomUUID(),
    reason: 'TEST_ONLY_DISABLE_SALE',
    action: 'PRODUCT_SWITCH',
    productId: product.productId,
    enabled: false,
  });
  await expect(
    service.offer(a.principal, packId, offerQuery()),
  ).rejects.toMatchObject({ code: 'PACK_UNAVAILABLE' });
  const result = await billing.verify(a.principal, proof);
  expect(
    await f.db.cosmeticGrant.count({
      where: { purchaseId: result.purchaseId, status: 'ACTIVE' },
    }),
  ).toBe(3);
  expect(
    (
      await billing.currentPurchase(a.principal, result.purchaseId)
    ).product.contents
      .map((i) => i.id)
      .sort(),
  ).toEqual(product.itemIds.sort());
});
