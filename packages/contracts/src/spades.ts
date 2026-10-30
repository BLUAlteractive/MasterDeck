import { z } from 'zod';
const face = z.string().regex(/^(?:[2-9]|10|J|Q|K|A)-[CDHS]$/),
  id = z.string().min(1).max(128),
  seat = z.number().int().min(0).max(3);
export const spadesRulesSchema = z
  .object({
    version: id,
    nilEnabled: z.boolean(),
    nilPoints: z.number().int().min(1).max(10000),
    contractPoints: z.number().int().min(1).max(1000),
    bagPoints: z.number().int().min(0).max(1000),
    bagThreshold: z.number().int().min(1).max(100),
    bagPenalty: z.number().int().min(1).max(10000),
    failedNilCountsAsBags: z.boolean(),
    failedNilBagPoints: z.number().int().min(0).max(1000),
    targetScore: z.number().int().min(1).max(1000000),
  })
  .strict()
  .refine(
    (rules) => rules.failedNilCountsAsBags || rules.failedNilBagPoints === 0,
  );
const team = z
  .object({
    score: z.number().int().min(-1000000000).max(1000000000),
    bags: z.number().int().min(0).max(99),
  })
  .strict();
const roundTeam = team
  .extend({
    contract: z.number().int().min(0).max(26),
    contractTricks: z.number().int().min(0).max(13),
    madeContract: z.boolean(),
    overtricks: z.number().int().min(0).max(13),
    nilTricks: z.number().int().min(0).max(13),
    nilScore: z.number().int().min(-20000).max(20000),
    bagsAdded: z.number().int().min(0).max(13),
    bagPenaltyCount: z.number().int().min(0).max(112),
    delta: z.number().int().min(-2000000).max(2000000),
  })
  .strict();
const teams = z.union([z.array(team).length(2), z.array(roundTeam).length(2)]);
const play = z.object({ seat, face }).strict(),
  trick = z.object({ plays: z.array(play).length(4), winner: seat }).strict();
const result = z
  .object({
    round: z.number().int().positive(),
    teams: z.array(roundTeam).length(2),
  })
  .strict();
export const spadesViewSchema = z
  .object({
    kind: z.literal('SPADES'),
    rulesetVersion: id,
    stateVersion: z.number().int().min(0),
    phase: z.enum(['BIDDING', 'PLAYING', 'ROUND_COMPLETE', 'MATCH_COMPLETE']),
    round: z.number().int().positive(),
    dealer: seat,
    toAct: id.nullable(),
    rules: spadesRulesSchema,
    players: z
      .array(
        z
          .object({
            id,
            seat,
            team: z.union([z.literal(0), z.literal(1)]),
            hand: z.array(face).max(13).nullable(),
            remaining: z.number().int().min(0).max(13),
            bid: z.number().int().min(0).max(13).nullable(),
            tricks: z.number().int().min(0).max(13),
          })
          .strict(),
      )
      .length(4),
    currentTrick: z.array(play).max(3),
    lastTrick: trick.nullable(),
    tricksCompleted: z.number().int().min(0).max(13),
    spadesBroken: z.boolean(),
    teams,
    lastResult: result.nullable(),
    winner: z.union([z.literal(0), z.literal(1)]).nullable(),
    legal: z
      .discriminatedUnion('kind', [
        z
          .object({
            kind: z.literal('BID'),
            min: z.number().int().min(0).max(1),
            max: z.literal(13),
          })
          .strict(),
        z
          .object({
            kind: z.literal('PLAY'),
            cards: z.array(face).min(1).max(13),
          })
          .strict(),
        z.object({ kind: z.literal('CONTINUE') }).strict(),
      ])
      .nullable(),
  })
  .strict();
export const spadesRoomViewSchema = z
  .object({
    gameId: z.uuid(),
    view: spadesViewSchema,
    turnDeadline: z.null(),
    settled: z.boolean(),
  })
  .strict();
export const spadesCommandSchema = z
  .object({
    gameId: z.uuid().transform((value) => value.toLowerCase()),
    commandId: z.string().regex(/^[A-Za-z0-9_-]{10,128}$/),
    stateVersion: z.number().int().min(0).max(2147483646),
    payload: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('BID'),
          tricks: z.number().int().min(0).max(13),
        })
        .strict(),
      z.object({ kind: z.literal('PLAY'), face }).strict(),
      z.object({ kind: z.literal('CONTINUE') }).strict(),
    ]),
  })
  .strict();
export const spadesReceiptSchema = spadesRoomViewSchema
  .extend({ commandId: id, stateVersion: z.number().int().positive() })
  .strict();
export const spadesResumeResponseSchema = spadesRoomViewSchema
  .extend({ continuity: z.literal('SNAPSHOT') })
  .strict();
export type SpadesView = z.infer<typeof spadesViewSchema>;
export type SpadesRoomView = z.infer<typeof spadesRoomViewSchema>;
export type SpadesCommand = z.infer<typeof spadesCommandSchema>;
