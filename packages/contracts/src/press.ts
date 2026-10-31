import { z } from 'zod';
import { validScreenTransition } from '@deckforge/card-domain';
import { adminCommandSchema } from './admin';
export const screenPatternSchema = z
  .object({
    name: z.string().min(3).max(100),
    tier: z.enum(['BASIC', 'FINE', 'MASTER']),
    branch: z.enum(['BLUE', 'RED']),
    sourceLevel: z.number().int().min(1).max(4),
    targetLevel: z.number().int().min(3).max(6),
    requiredSteps: z.number().int().min(1).max(1000000),
    requiredTrailInk: z.number().int().min(0).max(1000),
    creditPrice: z.number().int().min(1).max(1000000),
    currency: z.literal('TRAIL_CREDITS'),
    consumable: z.literal(true),
    ruleVersion: z.string().min(1).max(100),
    visualThemeId: z.literal('ORIGINAL_PLATEN_V1'),
    cancelAfterProgress: z.enum(['DISABLED', 'FORFEIT_SCREEN']),
  })
  .strict()
  .refine(
    (r) =>
      validScreenTransition(r.branch, r.sourceLevel, r.targetLevel, r.tier),
    'Invalid branch/tier transition',
  );
export type ScreenPatternDefinition = z.infer<typeof screenPatternSchema>;
export const screenPolicySchema = z
  .object({
    version: z.string().min(1).max(100),
    approvalReference: z.string().min(8).max(200),
    allowedPatternIds: z
      .array(z.uuid())
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length),
  })
  .strict();
export type ScreenPolicy = z.infer<typeof screenPolicySchema>;
export const screenAdminSchema = z.discriminatedUnion('action', [
  adminCommandSchema
    .extend({
      action: z.literal('DRAFT'),
      patternId: z.uuid(),
      slug: z.string().regex(/^[a-z0-9-]{3,80}$/),
      version: z.number().int().positive(),
      definition: screenPatternSchema,
    })
    .strict(),
  adminCommandSchema
    .extend({
      action: z.literal('REVIEW'),
      patternId: z.uuid(),
      review: z.enum(['CONTENT', 'ECONOMY']),
      definitionHash: z.string().regex(/^[a-f0-9]{64}$/),
      evidence: z.string().min(8).max(200),
    })
    .strict(),
  adminCommandSchema
    .extend({
      action: z.enum(['PUBLISH', 'RETIRE']),
      patternId: z.uuid(),
      expectedVersion: z.number().int().positive(),
    })
    .strict(),
]);
export const screenPatternViewSchema = z
  .object({
    id: z.uuid(),
    slug: z.string(),
    version: z.number().int().positive(),
    definitionHash: z.string().regex(/^[a-f0-9]{64}$/),
    definition: screenPatternSchema,
  })
  .strict();
export const screenCatalogSchema = z
  .object({
    available: z.boolean(),
    patterns: z.array(screenPatternViewSchema).max(100),
  })
  .strict();
