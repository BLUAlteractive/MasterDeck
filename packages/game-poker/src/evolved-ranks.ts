import { evaluateFiveCardHand, type FiveCardRank } from './five';
import type { FaceId } from '@deckforge/game-core';
export const EVOLVED_A_EXPERIMENTAL_V1 = 'EVOLVED_A_EXPERIMENTAL_V1' as const;
const straightTies = Object.freeze([
  0, 56, 112, 168, 225, 281, 337, 393, 450, 499,
]);
export type EvolvedRank = Readonly<{
  rank: FiveCardRank;
  ordinal: number;
  classCount: number;
  tieValue: number;
}>;
/** Construct all rank multisets, independently of physical suit multiplicities. */
function buildTable(): readonly EvolvedRank[] {
  const classes = new Map<number, FiveCardRank>();
  function visit(ranks: number[], minimum: number): void {
    if (ranks.length === 5) {
      const counts = new Map<number, number>();
      if (
        ranks.some((rank) => ranks.filter((value) => value === rank).length > 4)
      )
        return;
      const cards = ranks.map((rank, index) => {
        const count = counts.get(rank) ?? 0;
        counts.set(rank, count + 1);
        const label =
          ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[
            rank
          ] ?? String(rank);
        return `${label}-${['C', 'D', 'H', 'S'][ranks.filter((value) => value === rank).length > 1 ? count : index % 4]}` as FaceId;
      });
      const rank = evaluateFiveCardHand(cards);
      classes.set(rank.strength, rank);
      if (counts.size === 5) {
        const flush = evaluateFiveCardHand(
          cards.map((face) => `${face.split('-')[0]}-C` as FaceId),
        );
        classes.set(flush.strength, flush);
      }
      return;
    }
    for (let rank = minimum; rank <= 14; rank++) visit([...ranks, rank], rank);
  }
  visit([], 2);
  const ordered = [...classes.values()].sort((a, b) => a.strength - b.strength);
  if (ordered.length !== 7462) throw new Error('EVOLVED_RANK_TABLE_INTEGRITY');
  const categories = Array.from({ length: 9 }, (_, category) =>
    ordered.filter((rank) => rank.categoryIndex === category),
  );
  return Object.freeze(
    ordered.map((rank) => {
      const category = categories[rank.categoryIndex]!;
      const ordinal = category.findIndex(
        (value) => value.strength === rank.strength,
      );
      return Object.freeze({
        rank,
        ordinal,
        classCount: category.length,
        tieValue:
          rank.categoryIndex === 4
            ? straightTies[ordinal]!
            : Math.floor((499 * ordinal) / (category.length - 1)),
      });
    }),
  );
}
let cached: readonly EvolvedRank[] | undefined;
let byStrength: Map<number, EvolvedRank> | undefined;
export function getEvolvedRankClasses(): readonly EvolvedRank[] {
  if (!cached) {
    cached = buildTable();
    byStrength = new Map(cached.map((entry) => [entry.rank.strength, entry]));
  }
  return cached;
}
export function evolvedTieValue(rank: FiveCardRank): number {
  getEvolvedRankClasses();
  const entry = byStrength!.get(rank.strength);
  if (
    !entry ||
    entry.rank.categoryIndex !== rank.categoryIndex ||
    entry.rank.tiebreak.length !== rank.tiebreak.length ||
    entry.rank.tiebreak.some((value, index) => value !== rank.tiebreak[index])
  )
    throw new Error('INVALID_EVOLVED_RANK');
  return entry.tieValue;
}
