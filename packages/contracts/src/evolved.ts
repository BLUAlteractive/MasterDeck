import { z } from 'zod';
const face = z.string().regex(/^(?:[2-9]|10|J|Q|K|A)-[CDHS]$/);
const id = z.string().min(1).max(128);
const points = z.number().int().min(0).max(1200);
const included = z
  .object({
    instanceId: id,
    faceId: face,
    level: z.number().int().min(1).max(6),
    rarity: z.enum(['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY']),
    playStyleFamily: id,
    seriesId: id,
    levelPoints: points,
    rarityPoints: points,
  })
  .strict();
const bonus = z
  .object({
    includedHoles: z.array(included).max(2),
    levelPoints: points,
    rarityPoints: points,
    stylePoints: points,
    pairPoints: points,
    seriesPoints: points,
    seriesEffectId: id.nullable(),
    rawTotal: z.number().int().min(0).max(2400),
    total: points,
    capApplied: z.boolean(),
  })
  .strict();
const categories = [
  'HIGH_CARD',
  'ONE_PAIR',
  'TWO_PAIR',
  'THREE_OF_A_KIND',
  'STRAIGHT',
  'FLUSH',
  'FULL_HOUSE',
  'FOUR_OF_A_KIND',
  'STRAIGHT_FLUSH',
] as const;
const candidate = z
  .object({
    cards: z.array(face).length(5),
    category: z.enum(categories),
    categoryIndex: z.number().int().min(0).max(8),
    tiebreak: z.array(z.number().int().min(2).max(14)).min(1).max(5),
    tieValue: z.number().int().min(0).max(499),
    baseScore: z.number().int().min(0).max(8499),
    bonus,
    score: z.number().int().min(0).max(9699),
    selected: z.boolean(),
    description: z.string().min(1).max(4096),
  })
  .strict()
  .superRefine((value, ctx) => {
    const b = value.bonus;
    if (
      new Set(value.cards).size !== 5 ||
      new Set(b.includedHoles.map((hole) => hole.instanceId)).size !==
        b.includedHoles.length ||
      b.includedHoles.some((hole) => !value.cards.includes(hole.faceId)) ||
      value.category !== categories[value.categoryIndex] ||
      value.baseScore !== value.categoryIndex * 1000 + value.tieValue ||
      value.score !== value.baseScore + b.total ||
      b.total !== Math.min(b.rawTotal, 1200) ||
      b.rawTotal !==
        b.levelPoints +
          b.rarityPoints +
          b.stylePoints +
          b.pairPoints +
          b.seriesPoints ||
      b.capApplied !== b.rawTotal > 1200
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Inconsistent Evolved explanation.',
      });
  });
export const evolvedExplanationSchema = z
  .object({
    mode: z.literal('EVOLVED_EXPERIMENTAL'),
    rulesetVersion: z.literal('EVOLVED_A_EXPERIMENTAL_V1'),
    effectsVersion: id,
    playerId: id,
    summary: z.string().min(1).max(4096),
    candidates: z.array(candidate).length(21),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      !value.candidates.some((candidate) => candidate.selected) ||
      new Set(
        value.candidates.map((candidate) =>
          [...candidate.cards].sort().join(','),
        ),
      ).size !== 21
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Expected 21 unique candidates and a selection.',
      });
  });
export type EvolvedExplanationView = z.infer<typeof evolvedExplanationSchema>;
