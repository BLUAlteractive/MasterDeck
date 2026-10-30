import { randomBytes, randomUUID } from 'node:crypto';
import type { BillingProof } from '@deckforge/contracts';
import { hash } from '../src/rooms/shared';
import { ApiFailure } from '../src/auth/errors';
import type {
  BillingConfig,
  BillingProvider,
  VerifiedPurchase,
} from '../src/billing/providers';
/** Trusted fixture adapter only; production factories always use Apple/Google verification. */
export function billingFixture() {
  const records = new Map<string, VerifiedPurchase>(),
    notifications = new Map<
      string,
      { id: string; proof: BillingProof | null }
    >();
  let fails = 0,
    ackFails = 0,
    acknowledgements = 0;
  const provider: BillingProvider = {
    async verify(proof) {
      if (fails > 0) {
        fails--;
        throw new ApiFailure('BILLING_PROVIDER_UNAVAILABLE', 503);
      }
      const value = records.get(hash(proof));
      if (!value) throw new ApiFailure('PAYMENT_UNVERIFIED', 422);
      return { ...value };
    },
    async notification(body, authorization) {
      if (authorization !== 'Bearer FIXTURE_SIGNED_NOTIFICATION')
        throw new ApiFailure('UNAUTHORIZED', 401);
      const key = hash(body),
        value = notifications.get(key);
      if (!value) throw new ApiFailure('PAYMENT_UNVERIFIED', 422);
      return value;
    },
    async acknowledge() {
      acknowledgements++;
      if (ackFails > 0) {
        ackFails--;
        throw new Error('FIXTURE_OUTAGE');
      }
    },
  };
  const config: BillingConfig = {
    environment: 'SANDBOX',
    approvalReference: 'FIXTURE_NOT_APPROVAL',
    encryptionKey: randomBytes(32),
    providers: { APPLE: provider, GOOGLE: provider },
    workers: false,
  };
  return {
    config,
    records,
    notifications,
    setFailures(n: number) {
      fails = n;
    },
    setAckFailures(n: number) {
      ackFails = n;
    },
    get acknowledgements() {
      return acknowledgements;
    },
    proof(
      platform: 'APPLE' | 'GOOGLE',
      binding: string,
      sku: string,
      state: 'ACTIVE' | 'REVOKED' = 'ACTIVE',
    ) {
      const proof: BillingProof =
        platform === 'APPLE'
          ? { platform, signedTransaction: 'FIXTURE_ONLY:' + randomUUID() }
          : { platform, purchaseToken: 'FIXTURE_ONLY:' + randomUUID() };
      records.set(hash(proof), {
        platform,
        transactionId: randomUUID(),
        sku,
        binding,
        environment: 'SANDBOX',
        state,
        stateTime: new Date().toISOString(),
        acknowledged: platform === 'APPLE',
      });
      return proof;
    },
  };
}
