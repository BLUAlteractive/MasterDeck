import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  billingContextSchema,
  billingReceiptSchema,
  cosmeticInventorySchema,
} from '@deckforge/contracts';
import { identityFixture } from '../test/auth-fixture';
import { cosmeticFixture } from '../test/cosmetic-fixture';
import { billingFixture } from '../test/billing-fixture';
import { BillingService } from './billing/service';
import { hash } from './rooms/shared';
const fixture = billingFixture();
let f: Awaited<ReturnType<typeof identityFixture>>,
  service: BillingService,
  product: Awaited<ReturnType<typeof cosmeticFixture>>;
beforeAll(async () => {
  const setup = await identityFixture();
  product = await cosmeticFixture(setup.db);
  await setup.close();
  const catalog = {
    version: 'BILLING_TEST_ONLY',
    approvalReference: 'FIXTURE_NOT_APPROVAL',
    allowedProductIds: [product.productId],
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
  const a = await f.actor(false),
    context = billingContextSchema.parse(
      await (await f.request('billing/context', a.bearer)).json(),
    );
  return { ...a, context };
}
it('grants one cosmetic from ten concurrent verified receipts, bound to the permanent owner, without functional mutations', async () => {
  const a = await bound(),
    proof = fixture.proof(
      'APPLE',
      a.context.appleAppAccountToken,
      product.appleProductId,
    ),
    before = await f.db.cardInstance.count();
  const replies = await Promise.all(
    Array.from({ length: 10 }, () =>
      f.request('billing/verify', a.bearer, proof),
    ),
  );
  expect(replies.every((r) => r.status === 200)).toBe(true);
  const receipts = await Promise.all(
    replies.map(async (r) => billingReceiptSchema.parse(await r.json())),
  );
  expect(new Set(receipts.map((r) => r.purchaseId)).size).toBe(1);
  const purchase = await f.db.verifiedPurchase.findUniqueOrThrow({
    where: { id: receipts[0]!.purchaseId },
  });
  expect(purchase.evidenceBox).not.toContain('FIXTURE_ONLY');
  expect(
    await f.db.cosmeticGrant.count({
      where: { purchaseId: purchase.id, status: 'ACTIVE' },
    }),
  ).toBe(1);
  expect(await f.db.cardInstance.count()).toBe(before);
  expect(
    await f.db.restrictedAccount.count({ where: { userId: a.userId } }),
  ).toBe(0);
  expect(
    await f.db.playChipAccount.findUnique({ where: { userId: a.userId } }),
  ).toBeNull();
  expect(
    cosmeticInventorySchema.parse(
      await (await f.request('cosmetics', a.bearer)).json(),
    ).items[0]?.id,
  ).toBe(product.itemId);
  const outsider = await bound();
  expect(
    (await f.request('billing/verify', outsider.bearer, proof)).status,
  ).toBe(403);
  expect(
    cosmeticInventorySchema.parse(
      await (await f.request('cosmetics', outsider.bearer)).json(),
    ).items,
  ).toHaveLength(0);
});
it('rejects guest spending, spoofed/extra fields, unknown products and environment mismatch', async () => {
  const guest = await f.actor();
  expect((await f.request('billing/context', guest.bearer)).status).toBe(403);
  const a = await bound();
  expect(
    (
      await f.request('billing/verify', a.bearer, {
        platform: 'APPLE',
        signedTransaction: 'forged',
        state: 'PAID',
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await f.request('billing/verify', a.bearer, {
        platform: 'APPLE',
        signedTransaction: 'forged',
      })
    ).status,
  ).toBe(422);
  const unknown = fixture.proof(
    'APPLE',
    a.context.appleAppAccountToken,
    'not.approved',
  );
  expect((await f.request('billing/verify', a.bearer, unknown)).status).toBe(
    404,
  );
  const wrongEnv = fixture.proof(
    'APPLE',
    a.context.appleAppAccountToken,
    product.appleProductId,
  );
  fixture.records.get(hash(wrongEnv))!.environment = 'PRODUCTION';
  await expect(service.verify(a.principal, wrongEnv)).rejects.toMatchObject({
    code: 'PAYMENT_UNVERIFIED',
  });
});
it('persists authenticated notifications, retries outages and acknowledges Google only after committed entitlements', async () => {
  const a = await bound(),
    proof = fixture.proof(
      'GOOGLE',
      a.context.googleObfuscatedAccountId,
      product.googleProductId,
    ),
    body = { message: 'FIXTURE_NOTIFICATION:' + randomUUID() };
  fixture.notifications.set(hash(body), { id: randomUUID(), proof });
  expect(
    (
      await fetch(f.base + '/v1/billing/notifications/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    ).status,
  ).toBe(401);
  const send = () =>
    fetch(f.base + '/v1/billing/notifications/google', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer FIXTURE_SIGNED_NOTIFICATION',
      },
      body: JSON.stringify(body),
    });
  expect((await send()).status).toBe(202);
  expect((await send()).status).toBe(202);
  fixture.setFailures(1);
  await service.recover();
  const inbox = await f.db.billingInbox.findFirstOrThrow({
    where: { proofHash: hash(proof) },
  });
  expect(inbox.status).toBe('PENDING');
  expect(inbox.attempts).toBe(1);
  expect(inbox.evidenceBox).not.toContain('FIXTURE_ONLY');
  await f.db.billingInbox.update({
    where: { id: inbox.id },
    data: { nextAttemptAt: new Date(0) },
  });
  fixture.setAckFailures(1);
  await service.recover();
  expect(
    (await f.db.billingInbox.findUniqueOrThrow({ where: { id: inbox.id } }))
      .status,
  ).toBe('PROCESSED');
  const purchase = await f.db.verifiedPurchase.findFirstOrThrow({
      where: { userId: a.userId },
    }),
    ack = await f.db.billingAcknowledgement.findUniqueOrThrow({
      where: { purchaseId: purchase.id },
    });
  expect(ack.status).toBe('PENDING');
  expect(
    await f.db.cosmeticGrant.count({
      where: { purchaseId: purchase.id, status: 'ACTIVE' },
    }),
  ).toBe(1);
  await f.db.billingAcknowledgement.update({
    where: { purchaseId: purchase.id },
    data: { nextAttemptAt: new Date(0) },
  });
  await service.recover();
  expect(
    (
      await f.db.billingAcknowledgement.findUniqueOrThrow({
        where: { purchaseId: purchase.id },
      })
    ).status,
  ).toBe('DONE');
});
it('retains revocation on older valid receipts and enforces purchase/grant/event consistency', async () => {
  const a = await bound(),
    proof = fixture.proof(
      'APPLE',
      a.context.appleAppAccountToken,
      product.appleProductId,
    ),
    receipt = await service.verify(a.principal, proof),
    verified = fixture.records.get(hash(proof))!;
  verified.state = 'REVOKED';
  await service.verify(a.principal, proof);
  verified.state = 'ACTIVE';
  await service.verify(a.principal, proof);
  const purchase = await f.db.verifiedPurchase.findUniqueOrThrow({
    where: { id: receipt.purchaseId },
  });
  expect(purchase.status).toBe('REVOKED');
  expect(purchase.version).toBe(2);
  expect(
    await f.db.cosmeticGrant.count({
      where: { purchaseId: purchase.id, status: 'ACTIVE' },
    }),
  ).toBe(0);
  await expect(
    f.db.verifiedPurchase.update({
      where: { id: purchase.id },
      data: { status: 'ACTIVE', version: 3 },
    }),
  ).rejects.toThrow();
  const event = await f.db.purchaseEvent.findFirstOrThrow({
    where: { purchaseId: purchase.id },
  });
  await expect(
    f.db.purchaseEvent.delete({ where: { id: event.id } }),
  ).rejects.toThrow();
  const grant = await f.db.cosmeticGrant.findFirstOrThrow({
    where: { purchaseId: purchase.id },
  });
  await expect(
    f.db.cosmeticGrant.update({
      where: { id: grant.id },
      data: { userId: (await bound()).userId },
    }),
  ).rejects.toThrow();
});
it('honors a delayed first verified paid proof after an offer switch while keeping that product hidden from sale', async () => {
  const actor = await bound(),
    operator = await f.actor(false, 'aal2');
  await f.db.user.update({
    where: { id: operator.userId },
    data: { role: 'ADMIN' },
  });
  await f.db.adminCapability.create({
    data: {
      userId: operator.userId,
      capability: 'PRODUCT_OPERATOR',
      grantedBy: 'test.operator-provisioning-only',
    },
  });
  const proof = fixture.proof(
    'APPLE',
    actor.context.appleAppAccountToken,
    product.appleProductId,
  );
  const { ContentAdminService } = await import('./admin/content');
  await new ContentAdminService(f.auth).command(operator.principal, {
    action: 'PRODUCT_SWITCH',
    productId: product.productId,
    enabled: false,
    commandId: randomUUID(),
    reason: 'Fixture offer disabled before delayed delivery',
  });
  const catalog = await f.request('storefront?platform=APPLE');
  expect(
    ((await catalog.json()) as { products: unknown[] }).products,
  ).toHaveLength(0);
  const receipt = await service.verify(actor.principal, proof);
  expect(
    await f.db.cosmeticGrant.count({
      where: { purchaseId: receipt.purchaseId, status: 'ACTIVE' },
    }),
  ).toBe(1);
  expect(
    (await service.currentPurchase(actor.principal, receipt.purchaseId)).status,
  ).toBe('ACTIVE');
});

it('continues authoritative reconciliation of existing purchases after a deletion request without permitting new grants', async () => {
  const a = await bound(),
    proof = fixture.proof(
      'APPLE',
      a.context.appleAppAccountToken,
      product.appleProductId,
    ),
    receipt = await service.verify(a.principal, proof);
  await f.auth.requestDeletion(a.principal);
  await f.db.purchaseReconciliation.update({
    where: { purchaseId: receipt.purchaseId },
    data: { nextAttemptAt: new Date(0) },
  });
  await service.reconcile(a.userId);
  expect(
    (
      await f.db.purchaseReconciliation.findUniqueOrThrow({
        where: { purchaseId: receipt.purchaseId },
      })
    ).attempts,
  ).toBe(0);
  fixture.records.get(hash(proof))!.state = 'REVOKED';
  await f.db.purchaseReconciliation.update({
    where: { purchaseId: receipt.purchaseId },
    data: { nextAttemptAt: new Date(0) },
  });
  await service.reconcile(a.userId);
  expect(
    (
      await f.db.verifiedPurchase.findUniqueOrThrow({
        where: { id: receipt.purchaseId },
      })
    ).status,
  ).toBe('REVOKED');
  expect(
    await f.db.cosmeticGrant.count({
      where: { purchaseId: receipt.purchaseId, status: 'ACTIVE' },
    }),
  ).toBe(0);
});
