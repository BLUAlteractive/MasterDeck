import { z } from 'zod';
export const cosmeticPresentationSchema = z
  .object({
    kind: z.enum(['TABLE_THEME', 'CARD_BACK', 'AVATAR']),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    motif: z.enum(['SOLID', 'STRIPES', 'DOTS']),
  })
  .strict();
export type CosmeticPresentation = z.infer<typeof cosmeticPresentationSchema>;
export const cosmeticItemViewSchema = z
  .object({
    id: z.uuid(),
    name: z.string().min(1).max(100),
    presentation: cosmeticPresentationSchema,
  })
  .strict();
export const storefrontPolicySchema = z
  .object({
    version: z.string().min(1).max(100),
    approvalReference: z.string().min(1).max(200),
    allowedProductIds: z
      .array(z.uuid())
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length),
  })
  .strict();
export type StorefrontPolicy = z.infer<typeof storefrontPolicySchema>;
export const storefrontQuerySchema = z
  .object({ platform: z.enum(['APPLE', 'GOOGLE']).default('APPLE') })
  .strict();
export const cosmeticProductViewSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int().positive(),
    name: z.string().min(1).max(100),
    description: z.string().max(1000),
    platformProductId: z.string().min(1).max(200),
    referencePrice: z
      .object({
        currency: z.string().regex(/^[A-Z]{3}$/),
        amountMinor: z.number().int().min(1).max(1000000),
        minorUnits: z.number().int().min(0).max(3),
      })
      .strict(),
    contents: z.array(cosmeticItemViewSchema).min(1).max(20),
  })
  .strict();
export const storefrontViewSchema = z
  .object({
    available: z.boolean(),
    products: z.array(cosmeticProductViewSchema).max(100),
    checkout: z.literal('UNAVAILABLE_IN_THIS_BUILD'),
    functionalEffects: z.literal(false),
    paidRandomizedContents: z.literal(false),
  })
  .strict();
export type StorefrontView = z.infer<typeof storefrontViewSchema>;
export const cosmeticInventoryQuerySchema = z
  .object({
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export const cosmeticInventorySchema = z
  .object({
    items: z.array(cosmeticItemViewSchema).max(100),
    nextCursor: z.uuid().nullable(),
  })
  .strict();
