import { z } from 'zod';
import { progressGoalSchema } from './progression';
export const accessiblePolicySchema = z
  .object({
    version: z.string().min(1).max(100),
    approvalReference: z.string().min(1).max(200),
    requirePermanent: z.boolean(),
    minimumOpponents: z.number().int().min(1).max(5),
    minimumPlayerCommands: z.number().int().min(0).max(1000),
    maxTrailPerDay: z.number().int().min(1).max(1000000),
    goals: z
      .array(
        z
          .object({
            goalId: z.string().min(1).max(200),
            equivalencePlanId: z.string().min(1).max(100),
            trailCredits: z.number().int().min(1).max(1000000),
            pressRecipeId: z.string().min(1).max(100),
          })
          .strict(),
      )
      .min(1)
      .max(20)
      .refine((g) => new Set(g.map((x) => x.goalId)).size === g.length),
  })
  .strict();
export type AccessiblePolicy = z.infer<typeof accessiblePolicySchema>;
export const accessibleStartSchema = z
  .object({ goalId: z.string().min(1).max(200), commandId: z.uuid() })
  .strict();
export const accessibleCommandSchema = z
  .object({ enrollmentId: z.uuid(), commandId: z.uuid() })
  .strict();
export const accessibleStartResponseSchema = z
  .object({ enrollmentId: z.uuid() })
  .strict();
export const accessibleReceiptSchema = z
  .object({
    id: z.uuid(),
    enrollmentId: z.uuid(),
    trailCredits: z.string().regex(/^[1-9]\d*$/),
    transferId: z.uuid(),
    completedAt: z.iso.datetime(),
    pressProof: z
      .object({
        kind: z.literal('ACCESSIBLE_QUEST'),
        equivalencePlanId: z.string(),
        recipeId: z.string(),
        status: z.literal('AWAITING_PRESS_INTEGRATION'),
      })
      .strict(),
  })
  .strict();
export type AccessibleReceipt = z.infer<typeof accessibleReceiptSchema>;
export const accessibleViewSchema = z
  .object({
    available: z.boolean(),
    quests: z
      .array(
        z
          .object({
            goalId: z.string(),
            definition: progressGoalSchema,
            trailCredits: z.string(),
            equivalencePlanId: z.string(),
            pressRecipeId: z.string(),
            enrollment: z
              .object({
                id: z.uuid(),
                status: z.enum(['ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED']),
                paused: z.boolean(),
                progress: z.number().int().nonnegative(),
                expiresAt: z.iso.datetime(),
                receipt: accessibleReceiptSchema.nullable(),
              })
              .strict()
              .nullable(),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();
export type AccessibleView = z.infer<typeof accessibleViewSchema>;
