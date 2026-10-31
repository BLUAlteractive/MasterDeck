import { z } from 'zod';
export const activityPolicySchema = z
  .object({
    version: z.string().min(1).max(100),
    approvalReference: z.string().min(8).max(200),
    stepsPerCredit: z.number().int().min(1).max(10000),
    dailyCreditCap: z.number().int().min(1).max(1000000),
    maxStepsPerMinute: z.number().int().min(1).max(300),
    maxDailySteps: z.number().int().min(1).max(500000),
    lookbackHours: z.number().int().min(1).max(24),
    retentionHours: z.number().int().min(25).max(168),
  })
  .strict()
  .refine((p) => p.retentionHours > p.lookbackHours);
export type ActivityPolicy = z.infer<typeof activityPolicySchema>;
export const activityIngestSchema = z
  .object({ commandId: z.uuid(), evidence: z.string().min(1).max(8192) })
  .strict();
export const activityIngestReceiptSchema = z
  .object({
    receiptId: z.uuid(),
    acceptedSteps: z.number().int().nonnegative(),
    duplicates: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    trailCreditsGranted: z.string().regex(/^\d+$/),
    reviewRequired: z.boolean(),
  })
  .strict();
export const activitySummarySchema = z
  .object({
    available: z.boolean(),
    consented: z.boolean(),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    acceptedSteps: z.number().int().nonnegative(),
    trailCreditsGranted: z.string().regex(/^\d+$/),
    reviewRequired: z.boolean(),
    policy: z
      .object({
        version: z.string(),
        stepsPerCredit: z.number().int().positive(),
        dailyCreditCap: z.number().int().positive(),
      })
      .strict()
      .nullable(),
  })
  .strict();
