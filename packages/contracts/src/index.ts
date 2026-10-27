import { z } from 'zod';

/** Public liveness response; contains no environment, identity or database details. */
export const healthResponseSchema = z
  .object({
    service: z.literal('deckforge-api'),
    status: z.literal('ok'),
  })
  .strict();
export type HealthResponse = z.infer<typeof healthResponseSchema>;
