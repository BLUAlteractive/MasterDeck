import { z } from 'zod';
import { spadesRulesSchema } from './spades';
export const safeTableCodeSchema = z.enum([
  'HELLO',
  'THANKS',
  'WELL_PLAYED',
  'GOOD_GAME',
]);
export const spadesPolicySchema = z
  .object({
    approvalReference: z.string().min(1).max(128),
    rules: spadesRulesSchema,
  })
  .strict();
export type SpadesPolicy = z.infer<typeof spadesPolicySchema>;
export const spadesPolicyResponseSchema = z
  .object({ available: z.boolean(), policy: spadesPolicySchema.nullable() })
  .strict();
export const spadesStartSchema = z
  .object({
    lobbyId: z.uuid(),
    commandId: z.string().regex(/^[A-Za-z0-9_-]{10,128}$/),
    rematchOf: z.uuid().optional(),
  })
  .strict();
