import {
  Environment,
  SignedDataVerifier,
  type AppStoreServerAPIClient,
} from '@apple/app-store-server-library';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import {
  billingProofSchema,
  appleNotificationSchema,
  type BillingProof,
} from '@deckforge/contracts';
import { ApiFailure } from '../auth/errors';
export const verifiedPurchaseSchema = z
  .object({
    platform: z.enum(['APPLE', 'GOOGLE']),
    transactionId: z.string().min(1).max(200),
    sku: z.string().min(1).max(200),
    binding: z.string().min(1).max(200),
    environment: z.enum(['SANDBOX', 'PRODUCTION']),
    state: z.enum(['ACTIVE', 'REVOKED']),
    stateTime: z.iso.datetime(),
    acknowledged: z.boolean(),
  })
  .strict();
export type VerifiedPurchase = z.infer<typeof verifiedPurchaseSchema>;
export interface BillingProvider {
  verify(proof: BillingProof): Promise<VerifiedPurchase>;
  notification(
    body: unknown,
    authorization?: string,
  ): Promise<{ id: string; proof: BillingProof | null }>;
  acknowledge?(proof: BillingProof): Promise<void>;
}
export interface BillingConfig {
  environment: 'SANDBOX' | 'PRODUCTION';
  approvalReference: string;
  encryptionKey: Buffer;
  providers: Partial<Record<'APPLE' | 'GOOGLE', BillingProvider>>;
  workers?: boolean;
}
const decodedApple = z
  .object({
    transactionId: z.string(),
    originalTransactionId: z.string(),
    productId: z.string(),
    appAccountToken: z.uuid().optional(),
    type: z.literal('Non-Consumable'),
    inAppOwnershipType: z.literal('PURCHASED'),
    quantity: z.literal(1),
    signedDate: z.number().int().positive(),
    revocationDate: z.number().int().positive().optional(),
  })
  .passthrough();
export function appleBillingProvider(options: {
  roots: Buffer[];
  environment: 'SANDBOX' | 'PRODUCTION';
  bundleId: string;
  appAppleId?: number;
  client: Pick<AppStoreServerAPIClient, 'getTransactionInfo'>;
}): BillingProvider {
  if (!options.roots.length) throw new Error('APPLE_ROOTS_REQUIRED');
  const verifier = new SignedDataVerifier(
    options.roots,
    true,
    options.environment === 'SANDBOX'
      ? Environment.SANDBOX
      : Environment.PRODUCTION,
    options.bundleId,
    options.appAppleId,
  );
  const decode = async (signed: string) => {
    try {
      return decodedApple.parse(
        await verifier.verifyAndDecodeTransaction(signed),
      );
    } catch {
      throw new ApiFailure('PAYMENT_UNVERIFIED', 422);
    }
  };
  return {
    async verify(raw) {
      const proof = billingProofSchema.parse(raw);
      if (proof.platform !== 'APPLE')
        throw new ApiFailure('PAYMENT_UNVERIFIED', 422);
      const original = await decode(proof.signedTransaction);
      let transaction = original;
      if (!original.revocationDate) {
        let latest;
        try {
          latest = await options.client.getTransactionInfo(
            original.transactionId,
          );
        } catch {
          throw new ApiFailure('BILLING_PROVIDER_UNAVAILABLE', 503);
        }
        if (!latest.signedTransactionInfo)
          throw new ApiFailure('PAYMENT_UNVERIFIED', 422);
        transaction = await decode(latest.signedTransactionInfo);
      }
      if (
        transaction.originalTransactionId !== original.originalTransactionId ||
        !transaction.appAccountToken ||
        transaction.productId !== original.productId ||
        (original.appAccountToken !== undefined &&
          transaction.appAccountToken.toLowerCase() !==
            original.appAccountToken.toLowerCase()) ||
        transaction.signedDate > Date.now() + 300000
      )
        throw new ApiFailure('PAYMENT_UNVERIFIED', 422);
      return verifiedPurchaseSchema.parse({
        platform: 'APPLE',
        transactionId: transaction.originalTransactionId,
        sku: transaction.productId,
        binding: transaction.appAccountToken.toLowerCase(),
        environment: options.environment,
        state: transaction.revocationDate ? 'REVOKED' : 'ACTIVE',
        stateTime: new Date(transaction.signedDate).toISOString(),
        acknowledged: true,
      });
    },
    async notification(body) {
      const input = appleNotificationSchema.safeParse(body);
      if (!input.success) throw new ApiFailure('INVALID_REQUEST', 400);
      let value;
      try {
        value = await verifier.verifyAndDecodeNotification(
          input.data.signedPayload,
        );
      } catch {
        throw new ApiFailure('PAYMENT_UNVERIFIED', 422);
      }
      if (!value.notificationUUID)
        throw new ApiFailure('PAYMENT_UNVERIFIED', 422);
      return {
        id: value.notificationUUID,
        proof: value.data?.signedTransactionInfo
          ? {
              platform: 'APPLE',
              signedTransaction: value.data.signedTransactionInfo,
            }
          : null,
      };
    },
  };
}
const googlePurchase = z
  .object({
    orderId: z.string().min(1),
    obfuscatedExternalAccountId: z.string().regex(/^[a-f0-9]{64}$/),
    purchaseCompletionTime: z.iso.datetime(),
    purchaseStateContext: z
      .object({ purchaseState: z.enum(['PURCHASED', 'CANCELLED', 'PENDING']) })
      .passthrough(),
    testPurchaseContext: z.object({}).passthrough().optional(),
    acknowledgementState: z.enum([
      'ACKNOWLEDGEMENT_STATE_PENDING',
      'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    ]),
    productLineItem: z
      .array(
        z
          .object({
            productId: z.string().min(1),
            productOfferDetails: z
              .object({
                quantity: z.literal(1),
                refundableQuantity: z.number().int().min(0).max(1),
                consumptionState: z.literal(
                  'CONSUMPTION_STATE_YET_TO_BE_CONSUMED',
                ),
                rentOfferDetails: z.never().optional(),
                preorderOfferDetails: z.never().optional(),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .length(1),
  })
  .passthrough();
export function googleBillingProvider(options: {
  packageName: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  notificationAudience: string;
  notificationEmail: string;
  auth?: Pick<GoogleAuth, 'getAccessToken'>;
  oidc?: Pick<OAuth2Client, 'verifyIdToken'>;
  transport?: typeof fetch;
}): BillingProvider {
  const auth =
      options.auth ??
      new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/androidpublisher'],
      }),
    oidc = options.oidc ?? new OAuth2Client(),
    transport = options.transport ?? fetch;
  const request = async (path: string, method = 'GET') => {
    const token = await auth.getAccessToken();
    if (!token) throw new ApiFailure('BILLING_PROVIDER_UNAVAILABLE', 503);
    let response;
    try {
      response = await transport(
        'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' +
          encodeURIComponent(options.packageName) +
          path,
        {
          method,
          headers: {
            Authorization: 'Bearer ' + token,
            ...(method === 'POST'
              ? { 'Content-Type': 'application/json' }
              : {}),
          },
          ...(method === 'POST' ? { body: '{}' } : {}),
          signal: AbortSignal.timeout(10000),
        },
      );
    } catch {
      throw new ApiFailure('BILLING_PROVIDER_UNAVAILABLE', 503);
    }
    if (!response.ok)
      throw new ApiFailure(
        response.status === 404
          ? 'PAYMENT_UNVERIFIED'
          : 'BILLING_PROVIDER_UNAVAILABLE',
        response.status === 404 ? 422 : 503,
      );
    return response;
  };
  const verify = async (raw: BillingProof) => {
    const proof = billingProofSchema.parse(raw);
    if (proof.platform !== 'GOOGLE')
      throw new ApiFailure('PAYMENT_UNVERIFIED', 422);
    const data = (await (
      await request(
        '/purchases/productsv2/tokens/' +
          encodeURIComponent(proof.purchaseToken),
      )
    ).json()) as unknown;
    const state = z
      .object({
        purchaseStateContext: z
          .object({ purchaseState: z.string() })
          .passthrough(),
      })
      .passthrough()
      .safeParse(data);
    if (
      state.success &&
      state.data.purchaseStateContext.purchaseState === 'PENDING'
    )
      throw new ApiFailure('PAYMENT_PENDING', 409);
    const parsed = googlePurchase.safeParse(data);
    if (!parsed.success) throw new ApiFailure('PAYMENT_UNVERIFIED', 422);
    const value = parsed.data,
      line = value.productLineItem[0]!;
    if (
      Boolean(value.testPurchaseContext) !==
      (options.environment === 'SANDBOX')
    )
      throw new ApiFailure('PAYMENT_UNVERIFIED', 422);
    if (value.purchaseStateContext.purchaseState === 'PENDING')
      throw new ApiFailure('PAYMENT_PENDING', 409);
    return verifiedPurchaseSchema.parse({
      platform: 'GOOGLE',
      transactionId: value.orderId,
      sku: line.productId,
      binding: value.obfuscatedExternalAccountId,
      environment: options.environment,
      state:
        value.purchaseStateContext.purchaseState === 'CANCELLED' ||
        line.productOfferDetails.refundableQuantity === 0
          ? 'REVOKED'
          : 'ACTIVE',
      stateTime: new Date(value.purchaseCompletionTime).toISOString(),
      acknowledged:
        value.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    });
  };
  return {
    verify,
    async acknowledge(proof) {
      if (proof.platform !== 'GOOGLE')
        throw new ApiFailure('PAYMENT_UNVERIFIED', 422);
      const current = await verify(proof);
      if (current.state === 'REVOKED' || current.acknowledged) return;
      await request(
        '/purchases/products/' +
          encodeURIComponent(current.sku) +
          '/tokens/' +
          encodeURIComponent(proof.purchaseToken) +
          ':acknowledge',
        'POST',
      );
    },
    async notification(body, authorization) {
      const bearer = /^Bearer ([^ ]+)$/.exec(authorization ?? '')?.[1];
      if (!bearer) throw new ApiFailure('UNAUTHORIZED', 401);
      try {
        const ticket = await oidc.verifyIdToken({
            idToken: bearer,
            audience: options.notificationAudience,
          }),
          p = ticket.getPayload();
        if (
          !p ||
          p.email !== options.notificationEmail ||
          p.email_verified !== true ||
          !['https://accounts.google.com', 'accounts.google.com'].includes(
            p.iss,
          )
        )
          throw new Error();
      } catch {
        throw new ApiFailure('UNAUTHORIZED', 401);
      }
      const envelope = z
        .object({
          message: z
            .object({
              messageId: z.string().min(1).max(200),
              data: z.string().max(16000),
            })
            .passthrough(),
        })
        .passthrough()
        .safeParse(body);
      if (!envelope.success) throw new ApiFailure('INVALID_REQUEST', 400);
      let data: unknown;
      try {
        data = JSON.parse(
          Buffer.from(envelope.data.message.data, 'base64').toString('utf8'),
        );
      } catch {
        throw new ApiFailure('INVALID_REQUEST', 400);
      }
      const notification = z
        .object({
          packageName: z.literal(options.packageName),
          oneTimeProductNotification: z
            .object({ purchaseToken: z.string().min(1).max(8192) })
            .passthrough()
            .optional(),
          voidedPurchaseNotification: z
            .object({ purchaseToken: z.string().min(1).max(8192) })
            .passthrough()
            .optional(),
          testNotification: z.object({}).passthrough().optional(),
        })
        .passthrough()
        .safeParse(data);
      if (!notification.success) throw new ApiFailure('INVALID_REQUEST', 400);
      const token =
        notification.data.oneTimeProductNotification?.purchaseToken ??
        notification.data.voidedPurchaseNotification?.purchaseToken;
      if (!token && !notification.data.testNotification)
        throw new ApiFailure('INVALID_REQUEST', 400);
      return {
        id: envelope.data.message.messageId,
        proof: token ? { platform: 'GOOGLE', purchaseToken: token } : null,
      };
    },
  };
}
