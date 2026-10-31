import { catalogManifestSchema } from '@deckforge/card-domain';
import { z } from 'zod';
export const adminCapabilities = [
  'CONTENT_EDITOR',
  'CONTENT_REVIEWER',
  'CONTENT_PUBLISHER',
  'PRODUCT_OPERATOR',
  'SUPPORT',
  'AUDITOR',
  'PRIVACY_OPERATOR',
  'RELEASE_OPERATOR',
] as const;
export const adminCommandSchema = z
  .object({ commandId: z.uuid(), reason: z.string().trim().min(8).max(300) })
  .strict();
export const contentCommandSchema = z.discriminatedUnion('action', [
  adminCommandSchema
    .extend({ action: z.literal('RETIRE'), seriesId: z.uuid() })
    .strict(),
  adminCommandSchema
    .extend({
      action: z.literal('DRAFT'),
      seriesId: z.uuid(),
      slug: z.string().regex(/^[a-z0-9-]{3,80}$/),
      displayName: z.string().min(3).max(120),
      rightsOwner: z.string().min(3).max(200),
      templates: catalogManifestSchema.shape.templates,
    })
    .strict(),
  adminCommandSchema
    .extend({
      action: z.literal('REVIEW'),
      seriesId: z.uuid(),
      review: z.enum(['DESIGN', 'PRODUCTION']),
      evidence: z.string().min(8).max(200),
    })
    .strict(),
  adminCommandSchema
    .extend({ action: z.literal('PUBLISH'), seriesId: z.uuid() })
    .strict(),
  adminCommandSchema
    .extend({
      action: z.literal('PRODUCT_SWITCH'),
      productId: z.uuid(),
      enabled: z.boolean(),
    })
    .strict(),
]);
export type ContentCommand = z.infer<typeof contentCommandSchema>;
