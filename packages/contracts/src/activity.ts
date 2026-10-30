import { z } from 'zod';
export const healthPermissionSchema = z.enum([
  'UNAVAILABLE',
  'NOT_REQUESTED',
  'READ_REQUESTED',
  'GRANTED',
  'DENIED',
]);
export const activitySampleSchema = z
  .object({
    source: z.enum(['HEALTHKIT', 'HEALTH_CONNECT']),
    recordId: z.string().min(1).max(200),
    origin: z.string().min(1).max(200),
    revision: z.string().min(1).max(100),
    start: z.iso.datetime(),
    end: z.iso.datetime(),
    steps: z.number().int().min(1).max(200000),
    manual: z.boolean(),
  })
  .strict()
  .refine(
    (s) =>
      Date.parse(s.end) > Date.parse(s.start) &&
      Date.parse(s.end) - Date.parse(s.start) <= 86400000,
  );
export type ActivitySample = z.infer<typeof activitySampleSchema>;
export const activityBatchSchema = z
  .object({
    permission: healthPermissionSchema,
    samples: z.array(activitySampleSchema).max(1000),
    truncated: z.boolean(),
  })
  .strict();
