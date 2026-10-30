import { z } from 'zod';
const chips = z.number().int().min(0).max(1_000_000_000);
const face = z.string().regex(/^(?:[2-9]|10|J|Q|K|A)-[CDHS]$/);
const playerId = z.string().min(1).max(128);
const award = z.object({ playerId, amount: chips }).strict();
export const pokerViewSchema = z
  .object({
    rulesetVersion: z.literal('CLASSIC_NLHE_V1'),
    stateVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    street: z.enum(['PREFLOP', 'FLOP', 'TURN', 'RIVER', 'COMPLETE']),
    dealer: z.number().int().min(0).max(5),
    smallBlind: chips,
    bigBlind: chips,
    board: z.array(face).max(5),
    toAct: playerId.nullable(),
    currentBet: chips,
    players: z
      .array(
        z
          .object({
            id: playerId,
            stack: chips,
            committed: chips,
            streetBet: chips,
            folded: z.boolean(),
            allIn: z.boolean(),
            hole: z.array(face).length(2).nullable(),
          })
          .strict(),
      )
      .min(2)
      .max(6),
    legal: z
      .object({
        call: chips,
        canCheck: z.boolean(),
        canRaise: z.boolean(),
        minRaiseTo: z.number().int().min(0).max(2_000_000_000),
        maxTo: chips,
        canAllIn: z.boolean(),
      })
      .strict()
      .nullable(),
    outcome: z
      .object({
        reason: z.enum(['FOLD', 'SHOWDOWN']),
        allocation: z
          .object({
            pots: z
              .array(
                z
                  .object({
                    cap: chips,
                    amount: chips,
                    contributors: z.array(playerId).min(2).max(6),
                    eligible: z.array(playerId).min(1).max(6),
                    winners: z.array(playerId).min(1).max(6),
                    awards: z.array(award).min(1).max(6),
                  })
                  .strict(),
              )
              .max(6),
            players: z
              .array(
                z
                  .object({
                    playerId,
                    payout: chips,
                    refund: chips,
                    finalStack: chips,
                  })
                  .strict(),
              )
              .min(2)
              .max(6),
          })
          .strict(),
        hands: z
          .array(
            z
              .object({
                playerId,
                category: z.enum([
                  'HIGH_CARD',
                  'ONE_PAIR',
                  'TWO_PAIR',
                  'THREE_OF_A_KIND',
                  'STRAIGHT',
                  'FLUSH',
                  'FULL_HOUSE',
                  'FOUR_OF_A_KIND',
                  'STRAIGHT_FLUSH',
                ]),
                tiebreak: z
                  .array(z.number().int().min(2).max(14))
                  .min(1)
                  .max(5),
                bestFives: z.array(z.array(face).length(5)).min(1).max(21),
              })
              .strict(),
          )
          .max(6),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type PokerViewResponse = z.infer<typeof pokerViewSchema>;

export const pokerRoomJoinSchema = z
  .object({ gameId: z.uuid().transform((v) => v.toLowerCase()) })
  .strict();
export const pokerCommandSchema = z
  .object({
    gameId: z.uuid().transform((v) => v.toLowerCase()),
    commandId: z.string().regex(/^[A-Za-z0-9_-]{10,128}$/),
    stateVersion: z.number().int().min(0).max(2147483646),
    payload: z.discriminatedUnion('action', [
      z.object({ action: z.literal('FOLD') }).strict(),
      z.object({ action: z.literal('CHECK') }).strict(),
      z.object({ action: z.literal('CALL') }).strict(),
      z.object({ action: z.literal('ALL_IN') }).strict(),
      z
        .object({ action: z.literal('BET_TO'), target: chips.positive() })
        .strict(),
    ]),
  })
  .strict();
export const pokerRoomViewSchema = z
  .object({ gameId: z.uuid(), view: pokerViewSchema })
  .strict();
export const pokerCommandReceiptSchema = pokerRoomViewSchema
  .extend({ commandId: z.string(), stateVersion: z.number().int().min(1) })
  .strict();
export type PokerRoomCommand = z.infer<typeof pokerCommandSchema>;
