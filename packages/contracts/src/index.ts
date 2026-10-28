import { z } from 'zod';

/** Public liveness response; contains no environment, identity or database details. */
export const healthResponseSchema = z
  .object({
    service: z.literal('deckforge-api'),
    status: z.literal('ok'),
  })
  .strict();
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const emptyCommandSchema = z.object({}).strict();
export const profileSchema = z
  .object({
    userId: z.uuid(),
    isGuest: z.boolean(),
    role: z.enum(['PLAYER', 'ADMIN']),
  })
  .strict();
export const guestLinkSchema = z
  .object({
    expectedUserId: z.uuid(),
    idempotencyKey: z.string().min(10).max(128),
  })
  .strict();
export const inventoryQuerySchema = z
  .object({
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export const privateCardsSchema = z
  .object({
    items: z.array(
      z
        .object({
          instanceId: z.uuid(),
          faceId: z.string().regex(/^(?:[2-9]|10|J|Q|K|A)-[CDHS]$/),
          level: z.number().int().min(1).max(6),
          branch: z.enum(['BLUE', 'RED']),
          rarity: z.enum(['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY']),
          stateVersion: z.number().int().positive(),
        })
        .strict(),
    ),
    nextCursor: z.uuid().nullable(),
  })
  .strict();

export const apiErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        requestId: z.uuid(),
      })
      .strict(),
  })
  .strict();
export const logoutResponseSchema = z
  .object({ status: z.literal('revoked') })
  .strict();
export const deletionResponseSchema = z
  .object({ requestId: z.uuid(), status: z.literal('pending') })
  .strict();
export const adminAccessSchema = z
  .object({ role: z.literal('ADMIN'), mfa: z.literal(true) })
  .strict();
