import { z } from 'zod';
export const privacyPurposeSchema = z.enum([
  'ANALYTICS',
  'ACTIVITY_UPLOAD',
  'FOREGROUND_LOCATION',
]);
export const privacyConsentSchema = z
  .object({
    commandId: z.uuid(),
    purpose: privacyPurposeSchema,
    enabled: z.boolean(),
    policyVersion: z.string().min(1).max(128).optional(),
  })
  .strict();
export const privacyDeleteSchema = z
  .object({ commandId: z.uuid(), confirm: z.literal('DELETE_ACCOUNT') })
  .strict();
export const privacyStateSchema = z
  .object({
    policy: z.object({ version: z.string(), url: z.url() }).strict().nullable(),
    choices: z
      .object({
        analytics: z.boolean(),
        activityUpload: z.boolean(),
        foregroundLocation: z.boolean(),
      })
      .strict(),
    deletion: z
      .object({ id: z.uuid(), status: z.string() })
      .strict()
      .nullable(),
  })
  .strict();
export const privacyExportQuerySchema = z
  .object({
    resource: z.enum([
      'ACTIVITY',
      'ACTIVITY_REVIEWS',
      'ACCOUNT',
      'CARDS',
      'OWNERSHIP',
      'PURCHASES',
      'CONSENTS',
      'PLAY_CHIPS',
      'TRAIL_CREDITS',
      'STORE_GEMS',
      'PROGRESSION',
      'SAFETY',
    ]),
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export const privacyExportSchema = z
  .object({
    resource: privacyExportQuerySchema.shape.resource,
    generatedAt: z.iso.datetime(),
    items: z.array(z.record(z.string(), z.unknown())).max(100),
    nextCursor: z.uuid().nullable(),
  })
  .strict();
export type PrivacyExport = z.infer<typeof privacyExportSchema>;
export const privacyDeleteReceiptSchema = z
  .object({ requestId: z.uuid(), status: z.literal('pending') })
  .strict();

export const privacyConsentReceiptSchema = z
  .object({
    recorded: z.literal(true),
    choices: privacyStateSchema.shape.choices,
  })
  .strict();
