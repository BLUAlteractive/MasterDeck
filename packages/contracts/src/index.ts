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
export const ownedCardSchema = z
  .object({
    instanceId: z.uuid(),
    faceId: z.string().regex(/^(?:[2-9]|10|J|Q|K|A)-[CDHS]$/),
    level: z.number().int().min(1).max(6),
    branch: z.enum(['BLUE', 'RED']),
    rarity: raritySchema,
    stateVersion: z.number().int().positive(),
    status: z.enum(['OWNED', 'LOCKED']),
    seriesId: z.uuid(),
    seriesName: z.string().min(1).max(120),
    templateVersion: z.number().int().positive(),
    favorite: z.boolean(),
  })
  .strict();
export type OwnedCard = z.infer<typeof ownedCardSchema>;
export const privateCardsSchema = z
  .object({ items: z.array(ownedCardSchema), nextCursor: z.uuid().nullable() })
  .strict();
export const favoriteCommandSchema = z
  .object({ favorite: z.boolean() })
  .strict();
export const favoriteResponseSchema = z
  .object({ instanceId: z.uuid(), favorite: z.boolean() })
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
    cards: z
      .array(
        z
          .object({
            instanceId: z.uuid(),
            faceId: z.string().regex(/^(?:[2-9]|10|J|Q|K|A)-[CDHS]$/),
            level: z.literal(1),
            branch: z.literal('BLUE'),
            rarity: z.literal('COMMON'),
            stateVersion: z.literal(1),
          })
          .strict(),
      )
      .length(52),
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

const selectionKeySchema = z.string().regex(/^[A-Za-z0-9_-]{10,128}$/);
export const faceSelectionSchema = z
  .record(
    z.string().regex(/^(?:[2-9]|10|J|Q|K|A)-[CDHS]$/),
    z.uuid().transform((value) => value.toLowerCase()),
  )
  .refine(
    (value) => Object.keys(value).length === 52,
    'Exactly 52 faces required',
  );
export const loadoutCommandSchema = z
  .object({
    expectedVersion: z.number().int().min(0),
    idempotencyKey: selectionKeySchema,
    faceToInstanceIds: faceSelectionSchema,
  })
  .strict();
export const loadoutSavedSchema = z
  .object({
    id: z.uuid().transform((value) => value.toLowerCase()),
    version: z.number().int().positive(),
    faceToInstanceIds: faceSelectionSchema,
  })
  .strict();
const loadoutValidationSchema = z
  .object({
    valid: z.boolean(),
    issues: z.array(
      z
        .object({
          code: z.enum([
            'FACE_SET',
            'DUPLICATE_INSTANCE',
            'CARD_UNAVAILABLE',
            'FACE_MISMATCH',
          ]),
          faceId: z.string().optional(),
        })
        .strict(),
    ),
  })
  .strict();
export const currentLoadoutSchema = z
  .object({
    loadout: loadoutSavedSchema
      .extend({ validation: loadoutValidationSchema })
      .strict()
      .nullable(),
  })
  .strict();
const managerSlotSchema = z
  .object({
    slot: z.number().int().min(1).max(100),
    instanceId: z.uuid().transform((value) => value.toLowerCase()),
  })
  .strict();
export const managerCommandSchema = z
  .object({
    expectedVersion: z.number().int().min(0),
    idempotencyKey: selectionKeySchema,
    slots: z.array(managerSlotSchema).max(100),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (
      new Set(input.slots.map((slot) => slot.slot)).size !==
        input.slots.length ||
      new Set(input.slots.map((slot) => slot.instanceId)).size !==
        input.slots.length
    )
      ctx.addIssue({ code: 'custom', message: 'Duplicate manager selection' });
  });
export const managerSavedSchema = z
  .object({
    version: z.number().int().positive(),
    slots: z.array(managerSlotSchema).max(100),
  })
  .strict();
export const managerViewSchema = z
  .object({
    version: z.number().int().min(0),
    maxSlots: z.literal(100),
    activeInventoryCount: z.number().int().min(0),
    unmanagedCount: z.number().int().min(0),
    slots: z
      .array(
        managerSlotSchema
          .extend({
            status: z.enum(['OWNED', 'LOCKED', 'CONSUMED', 'REVOKED']),
            active: z.boolean(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();

/** Retained instances, including terminal rows. This is a private factual read model. */
export const archiveQuerySchema = inventoryQuerySchema
  .extend({
    view: z.enum(['all', 'current', 'former']).default('all'),
    seriesId: z.uuid().optional(),
  })
  .strict();
export const archiveCardSchema = ownedCardSchema
  .omit({ favorite: true })
  .extend({
    status: historyStateSchema.shape.status,
    holding: z.enum(['OWNED_NOW', 'PREVIOUSLY_OWNED']),
    editionSerial: z.number().int().positive().nullable(),
    createdAt: z.iso.datetime(),
    origin: z
      .object({
        eventId: z.uuid(),
        action: z.enum(['MINT', 'GRANT', 'FUSION_CREATE']),
        recordedAt: z.iso.datetime(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export const archiveResponseSchema = z
  .object({
    items: z.array(archiveCardSchema),
    nextCursor: z.uuid().nullable(),
  })
  .strict();
export type ArchiveCard = z.infer<typeof archiveCardSchema>;
export const albumSeriesSchema = z
  .object({
    seriesId: z.uuid(),
    seriesName: z.string().min(1).max(120),
    recordedInstances: z.number().int().nonnegative(),
    currentInstances: z.number().int().nonnegative(),
    recordedFaces: z.number().int().min(0).max(52),
    currentFaces: z.number().int().min(0).max(52),
    completeNow: z.boolean(),
    completeRecorded: z.boolean(),
  })
  .strict();
export const albumResponseSchema = z
  .object({
    items: z.array(albumSeriesSchema),
    nextCursor: z.uuid().nullable(),
  })
  .strict();

export * from './poker';
export * from './lobby';
export * from './chips';
export * from './evolved';
export * from './spades';
export * from './spades-social';

export * from './fusion';

export * from './activity';

export * from './progression';

export * from './wallets';

export * from './accessibility';

export * from './commerce';

export * from './billing';
export * from './tournaments';
export * from './admin';
export * from './privacy';
export * from './ingestion';
