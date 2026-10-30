import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { storefrontViewSchema } from '@deckforge/contracts';
import { identityFixture } from '../test/auth-fixture';
import { cosmeticFixture } from '../test/cosmetic-fixture';
let f: Awaited<ReturnType<typeof identityFixture>>;
const allowed: string[] = [];
beforeAll(async () => {
  f = await identityFixture(null, null, null, {
    storefrontPolicy: {
      version: 'STOREFRONT_TEST_ONLY',
      approvalReference: 'FIXTURE_NOT_APPROVAL',
      allowedProductIds: allowed,
    },
  });
});
afterAll(async () => {
  await f?.close();
});
it('lists only published approved fixed cosmetics with exact contents and explicit non-checkout price reference', async () => {
  const published = await cosmeticFixture(f.db),
    draft = await cosmeticFixture(f.db, false);
  allowed.push(published.productId, draft.productId);
  // Policy was parsed/copied at app creation; use a new fixture with the explicit approved allow-list.
  const app = await identityFixture(null, null, null, {
    storefrontPolicy: {
      version: 'CATALOG_FIXTURE',
      approvalReference: 'FIXTURE_ONLY',
      allowedProductIds: allowed,
    },
  });
  try {
    const r = await app.request('storefront?platform=GOOGLE');
    expect(r.status).toBe(200);
    const view = storefrontViewSchema.parse(await r.json());
    expect(view.products).toHaveLength(1);
    expect(view.products[0]?.platformProductId).toBe(published.googleProductId);
    expect(view.products[0]?.contents[0]?.id).toBe(published.itemId);
    expect(view.products[0]?.referencePrice).toEqual({
      currency: 'USD',
      amountMinor: 299,
      minorUnits: 2,
    });
    expect(view.functionalEffects).toBe(false);
    expect(view.checkout).toBe('UNAVAILABLE_IN_THIS_BUILD');
    expect((await app.request('storefront?random=true')).status).toBe(400);
  } finally {
    await app.close();
  }
});
it('rejects functional presentation fields, missing approval/contents and published content mutation', async () => {
  await expect(
    f.db.cosmeticItem.create({
      data: {
        id: randomUUID(),
        name: 'Invalid power',
        presentation: {
          kind: 'TABLE_THEME',
          primaryColor: '#123456',
          accentColor: '#ffffff',
          motif: 'SOLID',
          level: 6,
        },
        rightsOwner: 'fixture',
        rightsBasis: 'ORIGINAL',
      },
    }),
  ).rejects.toThrow();
  const item = await cosmeticFixture(f.db);
  await expect(
    f.db.cosmeticProductItem.create({
      data: {
        productId: item.productId,
        itemId: (await cosmeticFixture(f.db)).itemId,
      },
    }),
  ).rejects.toThrow();
  await expect(
    f.db.cosmeticProduct.update({
      where: { id: item.productId },
      data: { priceMinor: 1 },
    }),
  ).rejects.toThrow();
  await expect(
    f.db.$transaction(async (tx) => {
      const id = randomUUID();
      await tx.cosmeticProduct.create({
        data: {
          id,
          version: 1,
          name: 'Empty',
          description: 'Fixture',
          appleProductId: id,
          googleProductId: id,
          priceCurrency: 'USD',
          priceMinor: 100,
          approvalReference: 'FIXTURE',
        },
      });
      await tx.cosmeticProduct.update({
        where: { id },
        data: { status: 'PUBLISHED' },
      });
    }),
  ).rejects.toThrow();
});
it('keeps entitlements private and offers no public mint or payment command', async () => {
  const a = await f.actor();
  expect((await f.request('cosmetics')).status).toBe(401);
  expect(await (await f.request('cosmetics', a.bearer)).json()).toEqual({
    items: [],
    nextCursor: null,
  });
  for (const path of ['storefront/purchase', 'cosmetics/grant'])
    expect(
      (await f.request(path, a.bearer, { productId: randomUUID() })).status,
    ).toBe(404);
});
