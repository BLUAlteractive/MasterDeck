import { z } from 'zod';
import { raritySchema } from '@deckforge/card-domain';

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
          rarity: raritySchema,
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

export const publicCatalogAssetSchema = z
  .object({
    id: z.uuid(),
    key: z.string().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();
export const catalogSeriesSchema = z
  .object({
    id: z.uuid(),
    slug: z.string(),
    displayName: z.string(),
    version: z.number().int().positive(),
    starterEligible: z.boolean(),
    cards: z
      .array(
        z
          .object({
            faceId: z.string().regex(/^(?:[2-9]|10|J|Q|K|A)-[CDHS]$/),
            rarity: raritySchema,
            playStyleFamily: z.string(),
            front: publicCatalogAssetSchema,
            back: publicCatalogAssetSchema,
          })
          .strict(),
      )
      .length(52),
  })
  .strict();
export const catalogListSchema = z
  .object({
    items: z.array(catalogSeriesSchema),
    nextCursor: z.uuid().nullable(),
  })
  .strict();
export const catalogQuerySchema = z
  .object({
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(20).default(10),
  })
  .strict();

export const starterGrantCommandSchema = z
  .object({
    seriesId: z.uuid(),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{10,128}$/),
  })
  .strict();
export const starterGrantResponseSchema = z
  .object({
    grantId: z.uuid(),
    seriesId: z.uuid(),
    manifestVersion: z.number().int().positive(),
    cards: privateCardsSchema.shape.items.length(52),
  })
  .strict()
  .superRefine((result, ctx) => {
    if (
      new Set(result.cards.map((card) => card.instanceId)).size !== 52 ||
      new Set(result.cards.map((card) => card.faceId)).size !== 52 ||
      result.cards.some(
        (card) =>
          card.level !== 1 ||
          card.branch !== 'BLUE' ||
          card.rarity !== 'COMMON' ||
          card.stateVersion !== 1,
      )
    )
      ctx.addIssue({ code: 'custom', message: 'Invalid starter result' });
  });

export const cardHistoryQuerySchema = z
  .object({
    afterVersion: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
const historyStateSchema = z
  .object({
    status: z.enum(['OWNED', 'LOCKED', 'CONSUMED', 'REVOKED']),
    level: z.number().int().min(1).max(6),
    branch: z.enum(['BLUE', 'RED']),
    rarity: raritySchema,
  })
  .strict();
export const cardHistoryResponseSchema = z
  .object({
    instanceId: z.uuid(),
    faceId: z.string().regex(/^(?:[2-9]|10|J|Q|K|A)-[CDHS]$/),
    seriesId: z.uuid(),
    editionSerial: z.number().int().positive().nullable(),
    originEventId: z.uuid().nullable(),
    currentStatus: historyStateSchema.shape.status,
    currentVersion: z.number().int().positive(),
    events: z.array(
      z
        .object({
          eventId: z.uuid(),
          action: z.enum([
            'MINT',
            'GRANT',
            'FUSION_CONSUME',
            'FUSION_CREATE',
            'PRESS_EVOLVE',
            'LOCK',
            'UNLOCK',
            'REVOKE',
          ]),
          stateVersion: z.number().int().positive(),
          recordedAt: z.iso.datetime(),
          actor: z.enum(['SELF', 'OPERATOR', 'SYSTEM', 'UNKNOWN']),
          state: historyStateSchema.nullable(),
        })
        .strict(),
    ),
    nextVersion: z.number().int().positive().nullable(),
  })
  .strict();
export { historyStateSchema };
