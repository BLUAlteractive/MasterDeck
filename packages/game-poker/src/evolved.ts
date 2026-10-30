import { getFace, canonicalFaces, type FaceId } from '@deckforge/game-core';
import { evaluateFiveCardHand, type FiveCardRank } from './five';
import { EVOLVED_A_EXPERIMENTAL_V1, evolvedTieValue } from './evolved-ranks';
export type SeriesEffect = Readonly<{
  id: string;
  seriesId: string;
  publicationVersion: string;
}>;
export type EvolvedRules = Readonly<{
  rulesetVersion: typeof EVOLVED_A_EXPERIMENTAL_V1;
  effectsVersion: string;
  sameSeriesEffects: readonly SeriesEffect[];
}>;
/** Trusted publication input only, never a client-provided effect or eligibility proof. */
export function createEvolvedRules(
  effectsVersion: string,
  effects: readonly SeriesEffect[] = [],
): EvolvedRules {
  const valid = (value: string) =>
    typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
  if (
    !valid(effectsVersion) ||
    effects.length > 100 ||
    effects.some(
      (effect) =>
        !valid(effect.id) ||
        !valid(effect.seriesId) ||
        !valid(effect.publicationVersion),
    ) ||
    new Set(effects.map((effect) => effect.id)).size !== effects.length ||
    new Set(effects.map((effect) => effect.seriesId)).size !== effects.length
  )
    throw new Error('INVALID_EVOLVED_POLICY');
  return Object.freeze({
    rulesetVersion: EVOLVED_A_EXPERIMENTAL_V1,
    effectsVersion,
    sameSeriesEffects: Object.freeze(
      effects.map((effect) => Object.freeze({ ...effect })),
    ),
  });
}
export const evolvedRarities = Object.freeze([
  'COMMON',
  'UNCOMMON',
  'RARE',
  'EPIC',
  'LEGENDARY',
] as const);
export type EarnedHole = Readonly<{
  instanceId: string;
  ownerId: string;
  faceId: FaceId;
  level: number;
  rarity: (typeof evolvedRarities)[number];
  playStyleFamily: string;
  seriesId: string;
  status: 'OWNED' | 'LOCKED';
}>;
/** Supplied by the server from verified owned/reserved inventory, never request JSON. */
export type EvolvedContext = Readonly<{
  playerId: string;
  hole: readonly FaceId[];
  board: readonly FaceId[];
  instances: readonly EarnedHole[];
}>;
export type EvolvedBonus = Readonly<{
  includedHoles: readonly Readonly<{
    instanceId: string;
    faceId: FaceId;
    level: number;
    rarity: (typeof evolvedRarities)[number];
    playStyleFamily: string;
    seriesId: string;
    levelPoints: number;
    rarityPoints: number;
  }>[];
  levelPoints: number;
  rarityPoints: number;
  stylePoints: number;
  pairPoints: number;
  seriesPoints: number;
  seriesEffectId: string | null;
  rawTotal: number;
  total: number;
  capApplied: boolean;
}>;
export type EvolvedCandidate = Readonly<{
  cards: readonly FaceId[];
  rank: FiveCardRank;
  tieValue: number;
  baseScore: number;
  bonus: EvolvedBonus;
  score: number;
}>;
export type EvolvedSeven = Readonly<{
  rulesetVersion: typeof EVOLVED_A_EXPERIMENTAL_V1;
  effectsVersion: string;
  best: EvolvedCandidate;
  bestFives: readonly EvolvedCandidate[];
  candidates: readonly EvolvedCandidate[];
}>;
function validateContext(context: EvolvedContext): void {
  if (
    !context.playerId?.trim() ||
    context.hole.length !== 2 ||
    context.board.length !== 5 ||
    new Set([...context.hole, ...context.board]).size !== 7 ||
    context.instances.length > 2 ||
    new Set(context.instances.map((instance) => instance.instanceId)).size !==
      context.instances.length ||
    new Set(context.instances.map((instance) => instance.faceId)).size !==
      context.instances.length
  )
    throw new Error('INVALID_EVOLVED_CONTEXT');
  [...context.hole, ...context.board].forEach(getFace);
  if (
    context.instances.some(
      (instance) =>
        !instance.instanceId?.trim() ||
        instance.ownerId !== context.playerId ||
        !context.hole.includes(instance.faceId) ||
        !Number.isInteger(instance.level) ||
        instance.level < 1 ||
        instance.level > 6 ||
        !evolvedRarities.includes(instance.rarity) ||
        !instance.playStyleFamily?.trim() ||
        !instance.seriesId?.trim() ||
        !['OWNED', 'LOCKED'].includes(instance.status),
    )
  )
    throw new Error('INELIGIBLE_HOLE_INSTANCE');
}
function scoreCandidate(
  cards: readonly FaceId[],
  context: EvolvedContext,
  rules: EvolvedRules,
): EvolvedCandidate {
  const rank = evaluateFiveCardHand(cards),
    tieValue = evolvedTieValue(rank);
  const included = context.instances
    .filter((instance) => cards.includes(instance.faceId))
    .sort((a, b) => a.faceId.localeCompare(b.faceId));
  const includedHoles = Object.freeze(
    included.map((instance) =>
      Object.freeze({
        instanceId: instance.instanceId,
        faceId: instance.faceId,
        level: instance.level,
        rarity: instance.rarity,
        playStyleFamily: instance.playStyleFamily,
        seriesId: instance.seriesId,
        levelPoints: 70 * (instance.level - 1),
        rarityPoints: 30 * evolvedRarities.indexOf(instance.rarity),
      }),
    ),
  );
  const levelPoints = includedHoles.reduce(
      (sum, instance) => sum + instance.levelPoints,
      0,
    ),
    rarityPoints = includedHoles.reduce(
      (sum, instance) => sum + instance.rarityPoints,
      0,
    );
  const both = included.length === 2;
  const stylePoints =
    both && included[0]!.playStyleFamily === included[1]!.playStyleFamily
      ? 120
      : 0;
  const pairPoints =
    stylePoints > 0 &&
    getFace(included[0]!.faceId).rank === getFace(included[1]!.faceId).rank
      ? 80
      : 0;
  const effect =
    both && included[0]!.seriesId === included[1]!.seriesId
      ? rules.sameSeriesEffects.find(
          (effect) => effect.seriesId === included[0]!.seriesId,
        )
      : undefined;
  const seriesPoints = effect ? 60 : 0,
    rawTotal =
      levelPoints + rarityPoints + stylePoints + pairPoints + seriesPoints,
    total = Math.min(rawTotal, 1200);
  const bonus = Object.freeze({
    includedHoles,
    levelPoints,
    rarityPoints,
    stylePoints,
    pairPoints,
    seriesPoints,
    seriesEffectId: effect?.id ?? null,
    rawTotal,
    total,
    capApplied: rawTotal > 1200,
  });
  const baseScore = 1000 * rank.categoryIndex + tieValue;
  return Object.freeze({
    cards: Object.freeze([...cards]),
    rank,
    tieValue,
    baseScore,
    bonus,
    score: baseScore + total,
  });
}
function validatedRules(rules: EvolvedRules): EvolvedRules {
  if (rules.rulesetVersion !== EVOLVED_A_EXPERIMENTAL_V1)
    throw new Error('INVALID_EVOLVED_POLICY');
  return createEvolvedRules(rules.effectsVersion, rules.sameSeriesEffects);
}
export function evaluateEvolvedFive(
  cards: readonly FaceId[],
  context: EvolvedContext,
  policy: EvolvedRules,
): EvolvedCandidate {
  validateContext(context);
  const rules = validatedRules(policy);
  if (cards.some((face) => ![...context.hole, ...context.board].includes(face)))
    throw new Error('INVALID_CANDIDATE');
  return scoreCandidate(cards, context, rules);
}
export function compareEvolvedCandidates(
  left: EvolvedCandidate,
  right: EvolvedCandidate,
): -1 | 0 | 1 {
  const delta =
    left.score - right.score || left.rank.strength - right.rank.strength;
  return delta > 0 ? 1 : delta < 0 ? -1 : 0;
}
export function evaluateEvolvedSeven(
  context: EvolvedContext,
  policy: EvolvedRules,
): EvolvedSeven {
  validateContext(context);
  const rules = validatedRules(policy);
  const all = [...context.hole, ...context.board].sort(
    (a, b) =>
      canonicalFaces.findIndex((face) => face.id === a) -
      canonicalFaces.findIndex((face) => face.id === b),
  );
  const candidates: EvolvedCandidate[] = [];
  for (let a = 0; a < 3; a++)
    for (let b = a + 1; b < 4; b++)
      for (let c = b + 1; c < 5; c++)
        for (let d = c + 1; d < 6; d++)
          for (let e = d + 1; e < 7; e++)
            candidates.push(
              scoreCandidate(
                [all[a]!, all[b]!, all[c]!, all[d]!, all[e]!],
                context,
                rules,
              ),
            );
  let best = candidates[0]!;
  for (const candidate of candidates)
    if (compareEvolvedCandidates(candidate, best) > 0) best = candidate;
  return Object.freeze({
    rulesetVersion: rules.rulesetVersion,
    effectsVersion: rules.effectsVersion,
    best,
    bestFives: Object.freeze(
      candidates.filter(
        (candidate) => compareEvolvedCandidates(candidate, best) === 0,
      ),
    ),
    candidates: Object.freeze(candidates),
  });
}
