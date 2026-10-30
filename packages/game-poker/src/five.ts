import { canonicalFaces, type FaceId } from '@deckforge/game-core';

/** Conventional high poker, in ascending order. Royal flush is ace-high STRAIGHT_FLUSH. */
export const handCategories = Object.freeze([
  'HIGH_CARD',
  'ONE_PAIR',
  'TWO_PAIR',
  'THREE_OF_A_KIND',
  'STRAIGHT',
  'FLUSH',
  'FULL_HOUSE',
  'FOUR_OF_A_KIND',
  'STRAIGHT_FLUSH',
] as const);
export type HandCategory = (typeof handCategories)[number];
export type HandCategoryIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type FiveCardRank = Readonly<{
  category: HandCategory;
  categoryIndex: HandCategoryIndex;
  /** Most significant conventional tie rank first; a wheel has [5], not [14]. */
  tiebreak: readonly number[];
  /** Exact, higher-is-better comparison key. Not an ordinal, chip value or Evolved score. */
  strength: number;
}>;
export class InvalidPokerHand extends Error {
  readonly code = 'INVALID_FIVE_CARD_HAND';
  constructor() {
    super('Expected exactly five distinct canonical card faces.');
    this.name = 'InvalidPokerHand';
  }
}
const facesById = new Map(canonicalFaces.map((face) => [face.id, face]));
function result(
  categoryIndex: HandCategoryIndex,
  tiebreak: number[],
): FiveCardRank {
  // Five base-15 digits preserve every kicker; each digit 0..14 stays within its place.
  let strength: number = categoryIndex;
  for (let i = 0; i < 5; i++) strength = strength * 15 + (tiebreak[i] ?? 0);
  return Object.freeze({
    category: handCategories[categoryIndex],
    categoryIndex,
    tiebreak: Object.freeze(tiebreak),
    strength,
  });
}

/** Pure face-only evaluator. No ownership, rarity, cosmetics, RNG or hidden state is consulted. */
export function evaluateFiveCardHand(cards: readonly FaceId[]): FiveCardRank {
  if (!Array.isArray(cards) || cards.length !== 5 || new Set(cards).size !== 5)
    throw new InvalidPokerHand();
  const faces = Array.from(cards, (id) => {
    const face = facesById.get(id);
    if (!face) throw new InvalidPokerHand();
    return face;
  });
  const ranks = faces.map((face) => face.rank).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  const groups = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || b[0] - a[0],
  );
  const flush = faces.every((face) => face.suit === faces[0]!.suit);
  let straightHigh = 0;
  if (counts.size === 5) {
    if (ranks[0]! - ranks[4]! === 4) straightHigh = ranks[0]!;
    else if (ranks[0] === 14 && ranks[1] === 5 && ranks[4] === 2)
      straightHigh = 5;
  }
  const [first, second] = groups;
  if (flush && straightHigh) return result(8, [straightHigh]);
  if (first![1] === 4) return result(7, [first![0], second![0]]);
  if (first![1] === 3 && second![1] === 2)
    return result(6, [first![0], second![0]]);
  if (flush) return result(5, ranks);
  if (straightHigh) return result(4, [straightHigh]);
  if (first![1] === 3)
    return result(
      3,
      groups.map(([rank]) => rank),
    );
  if (first![1] === 2 && second![1] === 2)
    return result(
      2,
      groups.map(([rank]) => rank),
    );
  if (first![1] === 2)
    return result(
      1,
      groups.map(([rank]) => rank),
    );
  return result(0, ranks);
}

/** 1 means left wins, -1 means right wins, 0 means an exact conventional tie. */
export function compareFiveCardHands(
  left: readonly FaceId[],
  right: readonly FaceId[],
): -1 | 0 | 1 {
  const difference =
    evaluateFiveCardHand(left).strength - evaluateFiveCardHand(right).strength;
  return difference > 0 ? 1 : difference < 0 ? -1 : 0;
}
