import { z } from 'zod';
export const tournamentPolicySchema = z
  .object({
    version: z.string().min(1).max(128),
    approvalReference: z.string().min(1).max(200),
    format: z.literal('CLASSIC_HEADS_UP_SINGLE_HAND_V1'),
    prize: z.literal('PRESTIGE_TITLE'),
    workers: z.boolean().default(true),
    disputeWindowHours: z.number().int().min(1).max(168),
  })
  .strict();
export type TournamentPolicy = z.infer<typeof tournamentPolicySchema>;
export const tournamentCreateSchema = z
  .object({
    commandId: z.uuid(),
    reason: z.string().min(5).max(300),
    name: z.string().min(3).max(80),
    capacity: z.union([
      z.literal(2),
      z.literal(4),
      z.literal(8),
      z.literal(16),
      z.literal(32),
    ]),
    startsAt: z.iso.datetime(),
    title: z.string().min(3).max(80),
  })
  .strict();
export const tournamentCommandSchema = z
  .object({ commandId: z.uuid() })
  .strict();
export const tournamentReplaySchema = z
  .object({ commandId: z.uuid(), reason: z.string().min(5).max(300) })
  .strict();
export const tournamentViewSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    status: z.enum(['REGISTRATION', 'RUNNING', 'COMPLETED', 'CANCELLED']),
    startsAt: z.iso.datetime(),
    capacity: z.number().int(),
    registered: z.number().int(),
    format: z.literal('CLASSIC_HEADS_UP_SINGLE_HAND_V1'),
    rulesetVersion: z.literal('CLASSIC_NLHE_V1'),
    entryFee: z.literal(0),
    handBuyIn: z.number().int().positive(),
    prizeTitle: z.string(),
    eligibility: z.enum([
      'PERMANENT_ACCOUNT_REQUIRED',
      'AVAILABLE',
      'FULL',
      'CLOSED',
      'CONFIGURATION_REVIEW_REQUIRED',
    ]),
    ownEntry: z.number().int().nullable(),
    nextAction: z.enum([
      'REGISTER',
      'WAIT_START',
      'READY',
      'WAIT_OPPONENT',
      'PLAY',
      'COMPLETE',
      'CANCELLED',
      'INELIGIBLE',
    ]),
    matches: z.array(
      z
        .object({
          id: z.uuid(),
          round: z.number().int(),
          slot: z.number().int(),
          attempt: z.number().int(),
          leftSeed: z.number().int().nullable(),
          rightSeed: z.number().int().nullable(),
          winnerSeed: z.number().int().nullable(),
          status: z.enum(['WAITING', 'PLAYING', 'COMPLETE']),
          ownReady: z.boolean(),
          gameId: z.uuid().nullable(),
        })
        .strict(),
    ),
    championSeed: z.number().int().nullable(),
    reportUntil: z.iso.datetime().nullable(),
    standings: z.array(
      z
        .object({
          seed: z.number().int(),
          wins: z.number().int(),
          champion: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();
export type TournamentView = z.infer<typeof tournamentViewSchema>;
export const tournamentListSchema = z
  .object({
    items: z.array(tournamentViewSchema),
    nextCursor: z.uuid().nullable(),
  })
  .strict();
export const tournamentListQuerySchema = z
  .object({
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(20).default(10),
  })
  .strict();
export const tournamentReadyResultSchema = z
  .object({ recorded: z.literal(true), gameId: z.uuid().nullable() })
  .strict();
export const tournamentReadySchema = tournamentCommandSchema
  .extend({ attempt: z.number().int().positive() })
  .strict();
export const tournamentDisputeSchema = tournamentCommandSchema
  .extend({
    matchId: z.uuid(),
    code: z.enum(['RESULT_INCONSISTENT', 'CONNECTION_FAILURE', 'COLLUSION']),
  })
  .strict();
export const tournamentDisputeReceiptSchema = z
  .object({ id: z.uuid(), recorded: z.literal(true) })
  .strict();
export const tournamentIdSchema = z.uuid();
export const tournamentRegistrationReceiptSchema = z
  .object({ seed: z.number().int().min(1).max(32) })
  .strict();
