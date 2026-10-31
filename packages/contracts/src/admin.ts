import { catalogManifestSchema } from '@deckforge/card-domain';
import { z } from 'zod';
export const adminCapabilities = [
  'CONTENT_EDITOR',
  'CONTENT_REVIEWER',
  'CONTENT_PUBLISHER',
  'PRODUCT_OPERATOR',
  'SUPPORT',
  'AUDITOR',
  'PRIVACY_OPERATOR',
  'RELEASE_OPERATOR',
] as const;
export const adminCommandSchema = z
  .object({ commandId: z.uuid(), reason: z.string().trim().min(8).max(300) })
  .strict();
export const contentCommandSchema = z.discriminatedUnion('action', [
  adminCommandSchema
    .extend({ action: z.literal('RETIRE'), seriesId: z.uuid() })
    .strict(),
  adminCommandSchema
    .extend({
      action: z.literal('DRAFT'),
      seriesId: z.uuid(),
      slug: z.string().regex(/^[a-z0-9-]{3,80}$/),
      displayName: z.string().min(3).max(120),
      rightsOwner: z.string().min(3).max(200),
      templates: catalogManifestSchema.shape.templates,
    })
    .strict(),
  adminCommandSchema
    .extend({
      action: z.literal('REVIEW'),
      seriesId: z.uuid(),
      review: z.enum(['DESIGN', 'PRODUCTION']),
      evidence: z.string().min(8).max(200),
    })
    .strict(),
  adminCommandSchema
    .extend({ action: z.literal('PUBLISH'), seriesId: z.uuid() })
    .strict(),
  adminCommandSchema
    .extend({
      action: z.literal('PRODUCT_SWITCH'),
      productId: z.uuid(),
      enabled: z.boolean(),
    })
    .strict(),
]);
export type ContentCommand = z.infer<typeof contentCommandSchema>;
export const safetyContextSchema = z
  .object({ game: z.enum(['POKER', 'SPADES']), gameId: z.uuid() })
  .strict();
export const safetyCommandSchema = z.discriminatedUnion('action', [
  safetyContextSchema
    .extend({
      action: z.literal('REPORT'),
      commandId: z.uuid(),
      code: z.enum([
        'RESULT_INCONSISTENT',
        'CONNECTION_FAILURE',
        'HARASSMENT',
        'COLLUSION',
      ]),
    })
    .strict(),
  safetyContextSchema
    .extend({
      action: z.literal('SET_BLOCK'),
      commandId: z.uuid(),
      targetUserId: z.uuid(),
      blocked: z.boolean(),
    })
    .strict(),
]);
export const safetyViewSchema = z
  .object({
    gameId: z.uuid(),
    participants: z
      .array(
        z
          .object({
            userId: z.uuid(),
            seat: z.number().int(),
            blocked: z.boolean(),
          })
          .strict(),
      )
      .max(5),
    reports: z
      .array(
        z
          .object({
            id: z.uuid(),
            code: z.string(),
            createdAt: z.iso.datetime(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export const safetyReceiptSchema = z
  .object({ recorded: z.literal(true), reference: z.uuid() })
  .strict();
export const moderationCommandSchema = z.discriminatedUnion('action', [
  adminCommandSchema
    .extend({
      action: z.enum(['SUSPEND', 'REINSTATE']),
      targetUserId: z.uuid(),
    })
    .strict(),
  adminCommandSchema
    .extend({
      action: z.literal('INSPECT'),
      game: z.enum(['POKER', 'SPADES']),
      gameId: z.uuid(),
    })
    .strict(),
  adminCommandSchema
    .extend({
      action: z.literal('REVIEW_REPORT'),
      reportId: z.uuid(),
      decision: z.enum(['NO_ACTION', 'ESCALATE', 'RESOLVED']),
    })
    .strict(),
]);
export type SafetyCommand = z.infer<typeof safetyCommandSchema>;
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const operationalSummarySchema = z
  .object({
    generatedAt: z.iso.datetime(),
    windowStart: z.iso.datetime(),
    source: z.literal('DATABASE_REPEATABLE_READ'),
    funnel: z
      .object({
        newAccounts: count,
        permanentNewAccounts: count,
        starterGrants: count,
        completedPoker: count,
        completedSpades: count,
        fusions: count,
        activeVerifiedPurchases: count,
        revokedPurchases: count,
      })
      .strict(),
    wec: z
      .object({
        count,
        definition: z.literal('MATCH_AND_SERVER_OBSERVED_COLLECTION_ACTION_7D'),
        coverage: z.string(),
      })
      .strict(),
    integrity: z
      .object({
        playChipMismatches: count,
        restrictedMismatches: count,
        missingCardOrigins: count,
        purchaseGrantMismatches: count,
        playChipTotal: z.string(),
        restrictedTotals: z.array(
          z.object({ currency: z.string(), total: z.string() }).strict(),
        ),
      })
      .strict(),
    queues: z
      .object({
        billingInbox: count,
        billingAcknowledgements: count,
        voidCoverageGaps: count,
        unsettledPoker: count,
        unprocessedTournamentResults: count,
        gameReports: count,
      })
      .strict(),
    latency: z
      .object({
        source: z.literal('PROCESS_HTTP'),
        since: z.iso.datetime(),
        requests: count,
        p95UpperMs: z.number().nonnegative().nullable(),
        buckets: z.array(
          z.object({ upperMs: z.number().nullable(), count }).strict(),
        ),
      })
      .strict(),
  })
  .strict();
export type OperationalSummary = z.infer<typeof operationalSummarySchema>;
