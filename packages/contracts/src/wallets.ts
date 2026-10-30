import { z } from 'zod';
export const walletViewSchema = z
  .object({
    playChips: z.string().regex(/^\d+$/),
    trailCredits: z.string().regex(/^\d+$/),
    storeGems: z.string().regex(/^\d+$/),
    restrictions: z
      .object({
        playChips: z.literal('EARNED_PLAY_ONLY'),
        trailCredits: z.literal('VALIDATED_ACTIVITY_OR_ACCESSIBLE_QUEST_ONLY'),
        storeGems: z.literal('PAID_COSMETICS_ONLY'),
        exchange: z.literal(false),
        cashOut: z.literal(false),
      })
      .strict(),
  })
  .strict();
