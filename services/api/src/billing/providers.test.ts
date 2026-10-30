import { readFileSync } from 'node:fs';
import { it, expect, vi } from 'vitest';
import { appleBillingProvider, googleBillingProvider } from './providers';
import { sealBilling, openBilling } from './vault';
import { randomBytes } from 'node:crypto';
it('uses AEAD encryption with nonce uniqueness and row-specific integrity for raw proof evidence', () => {
  const key = randomBytes(32),
    value = { purchaseToken: 'PRIVATE_TEST_ONLY_TOKEN' },
    box = sealBilling(value, key, 'purchase:1');
  expect(box).not.toContain(value.purchaseToken);
  expect(openBilling(box, key, 'purchase:1')).toEqual(value);
  expect(sealBilling(value, key, 'purchase:1')).not.toBe(box);
  expect(() => openBilling(box, key, 'purchase:2')).toThrow();
  expect(() => openBilling(box, randomBytes(32), 'purchase:1')).toThrow();
  expect(() => openBilling('invalid', key, 'purchase:1')).toThrow();
});
it('real Apple SDK rejects unsigned/forged JWS before any server transaction lookup', async () => {
  const lookup = vi.fn().mockResolvedValue({});
  const provider = appleBillingProvider({
    roots: [
      readFileSync(
        new URL('../../test/fixtures/apple-root-g3.cer', import.meta.url),
      ),
    ],
    environment: 'SANDBOX',
    bundleId: 'com.deckforge.dev',
    client: { getTransactionInfo: lookup },
  });
  await expect(
    provider.verify({
      platform: 'APPLE',
      signedTransaction: 'not-a-signed-platform-transaction',
    }),
  ).rejects.toMatchObject({ code: 'PAYMENT_UNVERIFIED' });
  expect(lookup).not.toHaveBeenCalled();
  await expect(
    provider.notification({ signedPayload: 'forged' }),
  ).rejects.toMatchObject({ code: 'PAYMENT_UNVERIFIED' });
});
const raw = () => ({
  orderId: 'GPA.TEST',
  obfuscatedExternalAccountId: 'a'.repeat(64),
  purchaseCompletionTime: '2026-01-01T00:00:00.000Z',
  purchaseStateContext: { purchaseState: 'PURCHASED' },
  testPurchaseContext: { fopType: 'TEST' },
  acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
  productLineItem: [
    {
      productId: 'test.cosmetic',
      productOfferDetails: {
        quantity: 1,
        refundableQuantity: 1,
        consumptionState: 'CONSUMPTION_STATE_YET_TO_BE_CONSUMED',
      },
    },
  ],
});
it('pins Google authenticated lookup to operator package and returns only complete single fixed purchases', async () => {
  const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () => new Response(JSON.stringify(raw()), { status: 200 }),
      ),
    provider = googleBillingProvider({
      packageName: 'com.deckforge.dev',
      environment: 'SANDBOX',
      notificationAudience: 'https://api.example.invalid/notifications',
      notificationEmail: 'pubsub@example.invalid',
      auth: { getAccessToken: async () => 'SERVER_TEST_TOKEN' },
      transport,
    });
  const proof = {
    platform: 'GOOGLE' as const,
    purchaseToken: 'token/with?symbols',
  };
  expect(await provider.verify(proof)).toMatchObject({
    transactionId: 'GPA.TEST',
    binding: 'a'.repeat(64),
    state: 'ACTIVE',
    environment: 'SANDBOX',
  });
  expect(String(transport.mock.calls[0]?.[0])).toBe(
    'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.deckforge.dev/purchases/productsv2/tokens/token%2Fwith%3Fsymbols',
  );
  expect(transport.mock.calls[0]?.[1]?.headers).toEqual({
    Authorization: 'Bearer SERVER_TEST_TOKEN',
  });
  const pending = raw();
  pending.purchaseStateContext.purchaseState = 'PENDING';
  transport.mockResolvedValueOnce(new Response(JSON.stringify(pending)));
  await expect(provider.verify(proof)).rejects.toMatchObject({
    code: 'PAYMENT_PENDING',
  });
  transport.mockResolvedValueOnce(
    new Response(
      JSON.stringify({ purchaseStateContext: { purchaseState: 'PENDING' } }),
    ),
  );
  await expect(provider.verify(proof)).rejects.toMatchObject({
    code: 'PAYMENT_PENDING',
  });
  const bad = raw();
  bad.productLineItem[0]!.productOfferDetails.quantity = 2;
  transport.mockResolvedValueOnce(new Response(JSON.stringify(bad)));
  await expect(provider.verify(proof)).rejects.toMatchObject({
    code: 'PAYMENT_UNVERIFIED',
  });
  await expect(provider.notification({}, 'not a bearer')).rejects.toMatchObject(
    { code: 'UNAUTHORIZED' },
  );
});
