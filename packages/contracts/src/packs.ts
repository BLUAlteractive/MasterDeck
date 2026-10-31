import { z } from 'zod';
import { adminCommandSchema } from './admin';
import { cosmeticProductViewSchema } from './commerce';
const common = {
  name: z.string().min(3).max(100),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  stockLimit: z.number().int().min(1).max(1000000).nullable(),
  regions: z
    .array(z.string().regex(/^[A-Z]{2}$/))
    .max(100)
    .refine((r) => new Set(r).size === r.length),
};
export const earnedRewardSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('CARD'),
      templateId: z.uuid(),
      branch: z.enum(['BLUE', 'RED']),
    })
    .strict(),
  z
    .object({
      kind: z.literal('TRAIL_INK'),
      units: z.number().int().min(1).max(1000),
    })
    .strict(),
]);
export const packDefinitionSchema = z
  .discriminatedUnion('kind', [
    z
      .object({
        ...common,
        kind: z.literal('DISCOVERY'),
        currency: z.literal('TRAIL_CREDITS'),
        price: z.number().int().min(1).max(1000000),
        drawCount: z.number().int().min(1).max(10),
        duplicatePolicy: z.literal('ALLOW_COPIES'),
        guarantee: z.literal('NONE'),
        pool: z
          .array(
            z
              .object({
                weight: z.number().int().min(1).max(1000000),
                reward: earnedRewardSchema,
              })
              .strict(),
          )
          .min(1)
          .max(100),
      })
      .strict(),
    z
      .object({
        ...common,
        kind: z.literal('FIXED_COSMETIC'),
        stockLimit: z.null(),
        cosmeticProductId: z.uuid(),
        functionalEffects: z.literal(false),
        randomized: z.literal(false),
      })
      .strict(),
  ])
  .refine((d) => Date.parse(d.endsAt) > Date.parse(d.startsAt));
export type PackDefinition = z.infer<typeof packDefinitionSchema>;
export const packPolicySchema = z
  .object({
    version: z.string().min(1).max(100),
    approvalReference: z.string().min(8).max(200),
    allowedPackIds: z
      .array(z.uuid())
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length),
  })
  .strict();
export type PackPolicy = z.infer<typeof packPolicySchema>;
export const packAdminSchema = z.discriminatedUnion('action', [
  adminCommandSchema
    .extend({
      action: z.literal('DRAFT'),
      packId: z.uuid(),
      slug: z.string().regex(/^[a-z0-9-]{3,80}$/),
      version: z.number().int().positive(),
      definition: packDefinitionSchema,
    })
    .strict(),
  adminCommandSchema
    .extend({
      action: z.literal('REVIEW'),
      packId: z.uuid(),
      review: z.enum(['CONTENT', 'ECONOMY']),
      definitionHash: z.string().regex(/^[a-f0-9]{64}$/),
      evidence: z.string().min(8).max(200),
    })
    .strict(),
  adminCommandSchema
    .extend({
      action: z.enum(['PUBLISH', 'RETIRE']),
      packId: z.uuid(),
      expectedVersion: z.number().int().positive(),
    })
    .strict(),
]);
export const packViewSchema = z
  .object({
    remainingStock: z.number().int().nonnegative().nullable(),
    id: z.uuid(),
    slug: z.string(),
    version: z.number().int().positive(),
    definitionHash: z.string().regex(/^[a-f0-9]{64}$/),
    definition: packDefinitionSchema,
    odds: z
      .array(
        z
          .object({
            reward: earnedRewardSchema,
            numerator: z.number().int().positive(),
            denominator: z.number().int().positive(),
          })
          .strict(),
      )
      .max(100),
    fixedContents: cosmeticProductViewSchema.nullable(),
  })
  .strict();
export const packCatalogSchema = z
  .object({ available: z.boolean(), packs: z.array(packViewSchema).max(100) })
  .strict();
export const packOpenSchema = z
  .object({
    commandId: z.uuid(),
    expectedDefinitionHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const packOutcomeSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('CARD'),
      instanceId: z.uuid(),
      templateId: z.uuid(),
      faceId: z.string(),
      branch: z.enum(['BLUE', 'RED']),
      level: z.number().int().min(1).max(2),
      rarity: z.enum(['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY']),
    })
    .strict(),
  z
    .object({
      kind: z.literal('TRAIL_INK'),
      units: z.number().int().positive(),
    })
    .strict(),
]);
export const packOpeningSchema = z
  .object({
    openingId: z.uuid(),
    packId: z.uuid(),
    definitionHash: z.string().regex(/^[a-f0-9]{64}$/),
    currency: z.literal('TRAIL_CREDITS'),
    charged: z.string().regex(/^[1-9]\d*$/),
    rngVersion: z.literal('HMAC_SHA256_V1'),
    seedCommitment: z.string().regex(/^[a-f0-9]{64}$/),
    outcomes: z.array(packOutcomeSchema).min(1).max(10),
  })
  .strict();
export type PackOpeningReceipt = z.infer<typeof packOpeningSchema>;
export const supplyViewSchema = z
  .object({
    trailInk: z.string().regex(/^\d+$/),
    transferable: z.literal(false),
    purchasable: z.literal(false),
  })
  .strict();
export const fixedPackQuerySchema = z
  .object({
    platform: z.enum(['APPLE', 'GOOGLE']),
    expectedDefinitionHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const fixedPackOfferSchema = z
  .object({
    packId: z.uuid(),
    definitionHash: z.string().regex(/^[a-f0-9]{64}$/),
    product: cosmeticProductViewSchema,
    fulfillment: z.literal('VERIFIED_PLATFORM_BILLING'),
    functionalEffects: z.literal(false),
  })
  .strict();
export const packHistoryQuerySchema = z
  .object({
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export const packHistorySchema = z
  .object({
    items: z
      .array(
        z
          .object({ openedAt: z.iso.datetime(), receipt: packOpeningSchema })
          .strict(),
      )
      .max(50),
    nextCursor: z.uuid().nullable(),
  })
  .strict();
export const pendingPackSchema = z
  .object({ packId: z.uuid(), command: packOpenSchema })
  .strict();
export type PendingPack = z.infer<typeof pendingPackSchema>;
export type PackView = z.infer<typeof packViewSchema>;
export type PackHistory = z.infer<typeof packHistorySchema>;
export const packCancelResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('CANCELLED'), commandId: z.uuid() }).strict(),
  z
    .object({ status: z.literal('COMMITTED'), receipt: packOpeningSchema })
    .strict(),
]);
