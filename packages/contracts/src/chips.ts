import { z } from 'zod';
import { pokerViewSchema } from './poker';
export const playChipBalanceSchema = z
  .object({
    currency: z.literal('PLAY_CHIPS'),
    balance: z.string().regex(/^(0|[1-9][0-9]{0,18})$/),
  })
  .strict();
export const gameStartSchema = z
  .object({
    lobbyId: z.uuid().transform((v) => v.toLowerCase()),
    commandId: z.string().regex(/^[A-Za-z0-9_-]{10,128}$/),
  })
  .strict();
export const gameFinishSchema = z
  .object({ gameId: z.uuid().transform((v) => v.toLowerCase()) })
  .strict();
export const gameResultSchema = z
  .object({
    gameId: z.uuid(),
    rulesetVersion: z.literal('CLASSIC_NLHE_V1'),
    stateVersion: z.number().int().min(0),
    allocation: pokerViewSchema.shape.outcome.unwrap().shape.allocation,
  })
  .strict();
