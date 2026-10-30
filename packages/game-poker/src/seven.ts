import { canonicalFaces, type FaceId } from '@deckforge/game-core';
import { evaluateFiveCardHand, type FiveCardRank } from './five';
export type FiveCardSelection = readonly [
  FaceId,
  FaceId,
  FaceId,
  FaceId,
  FaceId,
];
export type SevenCardRank = Readonly<{
  rank: FiveCardRank;
  /** All equally best Classic selections, in stable canonical-face order, never suit-ranked. */
  bestFives: readonly FiveCardSelection[];
}>;
export class InvalidSevenCardHand extends Error {
  readonly code = 'INVALID_SEVEN_CARD_HAND';
  constructor() {
    super('Expected exactly seven distinct canonical card faces.');
    this.name = 'InvalidSevenCardHand';
  }
}
const canonicalOrder = new Map(
  canonicalFaces.map((face, index) => [face.id, index]),
);

/** Evaluate all 21 subsets; Classic Hold'em permits any five, without a hole-card quota. */
export function evaluateSevenCardHand(cards: readonly FaceId[]): SevenCardRank {
  if (!Array.isArray(cards) || cards.length !== 7 || new Set(cards).size !== 7)
    throw new InvalidSevenCardHand();
  const ordered = Array.from(cards, (id) => {
    const index = canonicalOrder.get(id);
    if (index === undefined) throw new InvalidSevenCardHand();
    return { id, index };
  })
    .sort((left, right) => left.index - right.index)
    .map(({ id }) => id);
  let bestRank: FiveCardRank | undefined;
  const bestFives: FiveCardSelection[] = [];
  for (let a = 0; a < 3; a++)
    for (let b = a + 1; b < 4; b++)
      for (let c = b + 1; c < 5; c++)
        for (let d = c + 1; d < 6; d++)
          for (let e = d + 1; e < 7; e++) {
            const selection: FiveCardSelection = Object.freeze([
              ordered[a]!,
              ordered[b]!,
              ordered[c]!,
              ordered[d]!,
              ordered[e]!,
            ]);
            const rank = evaluateFiveCardHand(selection);
            if (!bestRank || rank.strength > bestRank.strength) {
              bestRank = rank;
              bestFives.length = 0;
              bestFives.push(selection);
            } else if (rank.strength === bestRank.strength)
              bestFives.push(selection);
          }
  return Object.freeze({
    rank: bestRank!,
    bestFives: Object.freeze(bestFives),
  });
}
/** Equality ignores sixth/seventh cards and suits; chip splitting belongs to settlement. */
export function compareSevenCardHands(
  left: readonly FaceId[],
  right: readonly FaceId[],
): -1 | 0 | 1 {
  const difference =
    evaluateSevenCardHand(left).rank.strength -
    evaluateSevenCardHand(right).rank.strength;
  return difference > 0 ? 1 : difference < 0 ? -1 : 0;
}
