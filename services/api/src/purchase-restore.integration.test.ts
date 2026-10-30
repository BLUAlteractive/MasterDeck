import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  cosmeticInventorySchema,
  purchaseHistorySchema,
  purchaseViewSchema,
} from '@deckforge/contracts';
import { identityFixture } from '../test/auth-fixture';
import { cosmeticFixture } from '../test/cosmetic-fixture';
import { billingFixture } from '../test/billing-fixture';
import { BillingService } from './billing/service';
import { hash } from './rooms/shared';
const fixture = billingFixture();
let f: Awaited<ReturnType<typeof identityFixture>>,
  service: BillingService,
  p1: Awaited<ReturnType<typeof cosmeticFixture>>,
  p2: Awaited<ReturnType<typeof cosmeticFixture>>;
beforeAll(async () => {
  const setup = await identityFixture();
  p1 = await cosmeticFixture(setup.db);
  p2 = await cosmeticFixture(setup.db, false);
  await setup.db.cosmeticProductItem.create({
    data: { productId: p2.productId, itemId: p1.itemId },
  });
  await setup.db.cosmeticProduct.update({
    where: { id: p2.productId },
    data: { status: 'PUBLISHED' },
  });
  await setup.close();
  const catalog = {
    version: 'RESTORE_TEST_ONLY',
    approvalReference: 'FIXTURE_NOT_APPROVAL',
    allowedProductIds: [p1.productId, p2.productId],
  };
  f = await identityFixture(null, null, null, {
    storefrontPolicy: catalog,
    billing: fixture.config,
  });
  service = new BillingService(f.db, fixture.config, catalog);
});
afterAll(async () => {
  await f?.close();
});
async function bound() {
  const a = await f.actor(false);
  return { ...a, context: await service.context(a.principal) };
}
it('reconciles a missed refund, keeps overlapping grants from another purchase and restores retired catalog history without duplication', async () => {
  const a = await bound(),
    first = fixture.proof(
      'APPLE',
      a.context.appleAppAccountToken,
      p1.appleProductId,
    ),
    second = fixture.proof(
      'APPLE',
      a.context.appleAppAccountToken,
      p2.appleProductId,
    );
  const r1 = await service.verify(a.principal, first),
    r2 = await service.verify(a.principal, second);
  fixture.records.get(hash(first))!.state = 'REVOKED';
  await f.db.purchaseReconciliation.update({
    where: { purchaseId: r1.purchaseId },
    data: { nextAttemptAt: new Date(0) },
  });
  await service.reconcile(a.userId);
  expect(
    (await service.currentPurchase(a.principal, r1.purchaseId)).status,
  ).toBe('REVOKED');
  expect(
    (await service.currentPurchase(a.principal, r2.purchaseId)).status,
  ).toBe('ACTIVE');
  expect(
    cosmeticInventorySchema.parse(
      await (await f.request('cosmetics', a.bearer)).json(),
    ).items,
  ).toHaveLength(2);
  await f.db.cosmeticProduct.update({
    where: { id: p1.productId },
    data: { status: 'RETIRED' },
  });
  const response = await f.request('billing/restore', a.bearer, first);
  expect(response.status).toBe(200);
  expect(purchaseViewSchema.parse(await response.json()).status).toBe(
    'REVOKED',
  );
  expect(
    await f.db.cosmeticGrant.count({ where: { purchaseId: r1.purchaseId } }),
  ).toBe(1);
  expect(
    await f.db.restrictedAccount.count({ where: { userId: a.userId } }),
  ).toBe(0);
});
it('records an authenticated void before first client verification and never resurrects its cosmetic from an older active receipt', async () => {
  const a = await bound(),
    proof = fixture.proof(
      'GOOGLE',
      a.context.googleObfuscatedAccountId,
      p2.googleProductId,
    );
  if (proof.platform !== 'GOOGLE') throw new Error();
  const purchase = fixture.records.get(hash(proof))!;
  fixture.config.providers.GOOGLE!.voids = async () => ({
    items: [
      {
        purchaseToken: proof.purchaseToken,
        transactionId: purchase.transactionId,
        revokedAt: new Date().toISOString(),
      },
    ],
    nextCursor: null,
  });
  await service.scanVoids();
  const tombstone = await f.db.billingRevocation.findUniqueOrThrow({
    where: { proofKey: 'SANDBOX:GOOGLE:' + hash(proof.purchaseToken) },
  });
  expect(JSON.stringify(tombstone)).not.toContain('FIXTURE_ONLY');
  const receipt = await service.verify(a.principal, proof);
  expect(
    (await service.currentPurchase(a.principal, receipt.purchaseId)).status,
  ).toBe('REVOKED');
  expect(
    await f.db.cosmeticGrant.count({
      where: { purchaseId: receipt.purchaseId, status: 'ACTIVE' },
    }),
  ).toBe(0);
  await expect(
    f.db.billingRevocation.delete({ where: { id: tombstone.id } }),
  ).rejects.toThrow();
  await expect(
    f.db.verifiedPurchase.update({
      where: { id: receipt.purchaseId },
      data: { status: 'ACTIVE', version: 2 },
    }),
  ).rejects.toThrow();
});
it('repeated restores and distinct-item/history pagination stay account-bound and reveal no raw evidence', async () => {
  const a = await bound(),
    proof = fixture.proof(
      'APPLE',
      a.context.appleAppAccountToken,
      p2.appleProductId,
    ),
    another = fixture.proof(
      'APPLE',
      a.context.appleAppAccountToken,
      p2.appleProductId,
    );
  const receipt = await service.verify(a.principal, proof);
  await service.verify(a.principal, another);
  const responses = await Promise.all(
    Array.from({ length: 10 }, () =>
      f.request('billing/restore', a.bearer, proof),
    ),
  );
  expect(responses.every((r) => r.status === 200)).toBe(true);
  expect(await f.db.cosmeticGrant.count({ where: { userId: a.userId } })).toBe(
    4,
  );
  const page1 = cosmeticInventorySchema.parse(
    await (await f.request('cosmetics?limit=1', a.bearer)).json(),
  );
  expect(page1.items).toHaveLength(1);
  expect(page1.nextCursor).toBeTruthy();
  const page2 = cosmeticInventorySchema.parse(
    await (
      await f.request('cosmetics?limit=1&cursor=' + page1.nextCursor, a.bearer)
    ).json(),
  );
  expect(new Set([...page1.items, ...page2.items].map((i) => i.id)).size).toBe(
    2,
  );
  const history = purchaseHistorySchema.parse(
    await (await f.request('billing/purchases?limit=1', a.bearer)).json(),
  );
  expect(history.nextCursor).toBeTruthy();
  expect(JSON.stringify(history)).not.toContain('FIXTURE_ONLY');
  expect(JSON.stringify(history)).not.toContain('evidenceBox');
  const outsider = await bound();
  expect(
    (
      await f.request(
        'billing/purchases/' + receipt.purchaseId,
        outsider.bearer,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await f.request(
        'billing/purchases?cursor=' + receipt.purchaseId,
        outsider.bearer,
      )
    ).status,
  ).toBe(404);
  expect(
    (await f.request('billing/restore', outsider.bearer, proof)).status,
  ).toBe(403);
});
it('keeps scan cursor compare-and-swap and coverage-gap evidence durable', async () => {
  const scan = await f.db.billingVoidScan.findUniqueOrThrow({
    where: { key: 'SANDBOX:GOOGLE' },
  });
  await expect(
    f.db.billingVoidScan.update({
      where: { key: scan.key },
      data: { version: scan.version },
    }),
  ).rejects.toThrow();
  await f.db.billingVoidScan.update({
    where: { key: scan.key },
    data: { version: { increment: 1 }, coverageGap: true },
  });
  await expect(
    f.db.billingVoidScan.update({
      where: { key: scan.key },
      data: { version: { increment: 1 }, coverageGap: false },
    }),
  ).rejects.toThrow();
  expect((await f.request('billing/purchases')).status).toBe(401);
  expect(
    (
      await f.request(
        'billing/purchases?userId=' + randomUUID(),
        (await bound()).bearer,
      )
    ).status,
  ).toBe(400);
});
it('recovers a crash after persisting a trusted void but before revoking an existing purchase', async () => {
  const a = await bound(),
    proof = fixture.proof(
      'GOOGLE',
      a.context.googleObfuscatedAccountId,
      p2.googleProductId,
    );
  if (proof.platform !== 'GOOGLE') throw new Error();
  const receipt = await service.verify(a.principal, proof),
    verified = fixture.records.get(hash(proof))!;
  const tombstone = await f.db.billingRevocation.create({
    data: {
      id: randomUUID(),
      proofKey: 'SANDBOX:GOOGLE:' + hash(proof.purchaseToken),
      platform: 'GOOGLE',
      environment: 'SANDBOX',
      transactionId: verified.transactionId,
      evidenceHash: hash({
        fixture: 'authenticated-void-persisted-before-crash',
      }),
      revokedAt: new Date(),
    },
  });
  await f.db.purchaseReconciliation.update({
    where: { purchaseId: receipt.purchaseId },
    data: { nextAttemptAt: new Date(0) },
  });
  await service.reconcile(a.userId);
  expect(
    (await service.currentPurchase(a.principal, receipt.purchaseId)).status,
  ).toBe('REVOKED');
  expect(
    await f.db.cosmeticGrant.count({
      where: { purchaseId: receipt.purchaseId, status: 'ACTIVE' },
    }),
  ).toBe(0);
  expect(
    (
      await f.db.purchaseEvent.findUniqueOrThrow({
        where: { sourceKey: 'void:' + tombstone.id },
      })
    ).stateVersion,
  ).toBe(2);
});
