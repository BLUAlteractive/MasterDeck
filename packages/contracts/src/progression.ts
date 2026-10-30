import { z } from 'zod';
export const progressKindSchema = z.enum([
  'POKER_COMPLETED',
  'POKER_WIN',
  'POKER_FULL_HOUSE',
  'SPADES_COMPLETED',
  'SPADES_WIN',
  'FUSION_COMPLETED',
]);
export const progressGoalSchema = z
  .object({
    id: z.string().regex(/^[A-Z0-9_]{3,80}$/),
    kind: progressKindSchema,
    target: z.number().int().min(1).max(1000000),
    badge: z.string().min(1).max(100),
    window: z.literal('LIFETIME'),
  })
  .strict();
export const progressionPolicySchema = z
  .object({
    version: z.string().regex(/^[A-Z0-9_]{3,80}$/),
    approvalReference: z.string().min(1).max(200),
    requirePermanent: z.boolean(),
    minimumOpponents: z.number().int().min(1).max(5),
    minimumPlayerCommands: z.number().int().min(0).max(1000),
    goals: z
      .array(progressGoalSchema)
      .max(100)
      .refine((g) => new Set(g.map((x) => x.id)).size === g.length),
  })
  .strict();
export type ProgressionPolicy = z.infer<typeof progressionPolicySchema>;
export type ProgressGoal = z.infer<typeof progressGoalSchema>;
export const progressViewSchema = z
  .object({
    available: z.boolean(),
    goals: z
      .array(
        z
          .object({
            id: z.string(),
            definition: progressGoalSchema,
            count: z.number().int().nonnegative(),
            windowKey: z.string(),
            awarded: z.boolean(),
          })
          .strict(),
      )
      .max(100),
    awards: z
      .array(
        z
          .object({
            id: z.uuid(),
            goalId: z.string(),
            windowKey: z.string(),
            badge: z.string(),
            awardedAt: z.iso.datetime(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
