/** Independent test-only direct rank/suit classifier. No production evaluator or encoder imports.
 * Rules: https://www.pokerstars.com/poker/learn/lesson/texas-holdem-rules/?scroll=null
 * Unlike production's 21 subset evaluations, determine the best rank directly from all cards.
 */
export type ReferenceRank = { categoryIndex: number; tiebreak: number[] };
const labels = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
];
const suits = ['C', 'D', 'H', 'S'];
function straightTop(values: readonly number[]) {
  const ranks = new Set(values);
  for (let high = 14; high >= 5; high--) {
    const needed =
      high === 5
        ? [14, 2, 3, 4, 5]
        : Array.from({ length: 5 }, (_, i) => high - i);
    if (needed.every((rank) => ranks.has(rank))) return high;
  }
  return 0;
}
/** Five is accepted only to independently verify which of seven's subsets tie the best rank. */
export function referenceHighHand(cards: readonly string[]): ReferenceRank {
  if (cards.length !== 5 && cards.length !== 7)
    throw new Error('Reference expects five or seven');
  const counts = Array<number>(15).fill(0);
  const bySuit: number[][] = [[], [], [], []];
  for (const id of cards) {
    const [label, suit] = id.split('-');
    const rank = labels.indexOf(label!) + 2;
    const suitIndex = suits.indexOf(suit!);
    if (rank < 2 || suitIndex < 0) throw new Error('Invalid reference fixture');
    counts[rank]!++;
    bySuit[suitIndex]!.push(rank);
  }
  const descending = Array.from({ length: 13 }, (_, i) => 14 - i).filter(
    (rank) => counts[rank]! > 0,
  );
  const quads = descending.filter((rank) => counts[rank] === 4);
  const trips = descending.filter((rank) => counts[rank]! >= 3);
  const pairs = descending.filter((rank) => counts[rank]! >= 2);
  const flush = bySuit.find((ranks) => ranks.length >= 5);
  const straightFlush = flush ? straightTop(flush) : 0;
  if (straightFlush) return { categoryIndex: 8, tiebreak: [straightFlush] };
  if (quads.length)
    return {
      categoryIndex: 7,
      tiebreak: [quads[0]!, descending.find((rank) => rank !== quads[0])!],
    };
  if (trips.length) {
    const pair = pairs.find((rank) => rank !== trips[0]);
    if (pair !== undefined)
      return { categoryIndex: 6, tiebreak: [trips[0]!, pair] };
  }
  if (flush)
    return {
      categoryIndex: 5,
      tiebreak: [...flush].sort((a, b) => b - a).slice(0, 5),
    };
  const straight = straightTop(descending);
  if (straight) return { categoryIndex: 4, tiebreak: [straight] };
  if (trips.length)
    return {
      categoryIndex: 3,
      tiebreak: [
        trips[0]!,
        ...descending.filter((rank) => rank !== trips[0]).slice(0, 2),
      ],
    };
  if (pairs.length >= 2)
    return {
      categoryIndex: 2,
      tiebreak: [
        pairs[0]!,
        pairs[1]!,
        descending.find((rank) => rank !== pairs[0] && rank !== pairs[1])!,
      ],
    };
  if (pairs.length)
    return {
      categoryIndex: 1,
      tiebreak: [
        pairs[0]!,
        ...descending.filter((rank) => rank !== pairs[0]).slice(0, 3),
      ],
    };
  return { categoryIndex: 0, tiebreak: descending.slice(0, 5) };
}
export function referenceCompare(
  left: ReferenceRank,
  right: ReferenceRank,
): -1 | 0 | 1 {
  if (left.categoryIndex !== right.categoryIndex)
    return left.categoryIndex > right.categoryIndex ? 1 : -1;
  for (let i = 0; i < left.tiebreak.length; i++) {
    if (left.tiebreak[i] !== right.tiebreak[i])
      return left.tiebreak[i]! > right.tiebreak[i]! ? 1 : -1;
  }
  return 0;
}
/** Bitmask enumeration is separate from production's nested-index traversal. */
export function referenceBestSubsets(cards: readonly string[]): string[][] {
  const best = referenceHighHand(cards);
  const selections: string[][] = [];
  for (let mask = 0; mask < 128; mask++) {
    const candidate = cards.filter((_card, i) => mask & (1 << i));
    if (
      candidate.length === 5 &&
      referenceCompare(referenceHighHand(candidate), best) === 0
    )
      selections.push([...candidate].sort());
  }
  return selections;
}
