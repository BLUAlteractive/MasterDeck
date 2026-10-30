import { z } from 'zod';
export const billingProofSchema = z.discriminatedUnion('platform', [
  z
    .object({
      platform: z.literal('APPLE'),
      signedTransaction: z.string().min(1).max(14000),
    })
    .strict(),
  z
    .object({
      platform: z.literal('GOOGLE'),
      purchaseToken: z.string().min(1).max(8192),
    })
    .strict(),
]);
export type BillingProof = z.infer<typeof billingProofSchema>;
export const billingContextSchema = z
  .object({
    appleAppAccountToken: z.uuid(),
    googleObfuscatedAccountId: z.string().regex(/^[a-f0-9]{64}$/),
    environment: z.enum(['SANDBOX', 'PRODUCTION']),
  })
  .strict();
export const billingReceiptSchema = z
  .object({ purchaseId: z.uuid(), recorded: z.literal(true) })
  .strict();
export const appleNotificationSchema = z
  .object({ signedPayload: z.string().min(1).max(14000) })
  .strict();
