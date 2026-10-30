/** Test-only constructive oracle. It imports no production evaluator or classification helper.
 * Conventional rules: https://www.pokerstars.com/poker/games/rules/hand-rankings/?no_redirect=1
 * Frequencies: https://www.math.utah.edu/~treiberg/M3074StudEg.pdf
 * Build rank patterns per category instead of classifying dealt hands with a histogram.
 */
export type Pattern = {
  category: number;
  tie: number[];
  ranks: number[];
  flush: boolean;
};
const values = Array.from({ length: 13 }, (_, i) => i + 2);
export function combinations(
  values: readonly number[],
  count: number,
): number[][] {
  const all: number[][] = [];
  function walk(start: number, chosen: number[]) {
    if (chosen.length === count) {
      all.push([...chosen]);
      return;
    }
    for (let i = start; i < values.length; i++) {
      chosen.push(values[i]!);
      walk(i + 1, chosen);
      chosen.pop();
    }
  }
  walk(0, []);
  return all;
}
export function lexicographic(
  left: readonly number[],
  right: readonly number[],
) {
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0);
    if (delta) return delta;
  }
  return 0;
}
/** A multiset's order and actual suit names carry no information beyond the flush bit. */
export function patternKey(ranks: readonly number[], flush: boolean) {
  return [...ranks].sort((a, b) => a - b).join(',') + (flush ? ':f' : ':n');
}
export function buildPatternOracle(): Pattern[] {
  const patterns: Pattern[] = [];
  const straights = Array.from({ length: 10 }, (_, i) => i + 5).map((top) => ({
    top,
    ranks:
      top === 5
        ? [14, 2, 3, 4, 5]
        : Array.from({ length: 5 }, (_, i) => top - i),
  }));
  const straightSets = new Set(
    straights.map(({ ranks }) => patternKey(ranks, false)),
  );
  function add(
    category: number,
    tie: number[],
    ranks: number[],
    flush = false,
  ) {
    patterns.push({ category, tie, ranks, flush });
  }
  for (const ranks of combinations(values, 5)) {
    if (straightSets.has(patternKey(ranks, false))) continue;
    const tie = [...ranks].reverse();
    add(0, tie, ranks);
    add(5, tie, ranks, true);
  }
  for (const { top, ranks } of straights) {
    add(4, [top], ranks);
    add(8, [top], ranks, true);
  }
  for (const repeated of values) {
    const remaining = values.filter((rank) => rank !== repeated);
    for (const kickers of combinations(remaining, 3))
      add(
        1,
        [repeated, ...[...kickers].reverse()],
        [repeated, repeated, ...kickers],
      );
    for (const kickers of combinations(remaining, 2))
      add(
        3,
        [repeated, ...[...kickers].reverse()],
        [repeated, repeated, repeated, ...kickers],
      );
    for (const other of remaining) {
      add(6, [repeated, other], [repeated, repeated, repeated, other, other]);
      add(
        7,
        [repeated, other],
        [repeated, repeated, repeated, repeated, other],
      );
    }
  }
  for (const [low, high] of combinations(values, 2))
    for (const kicker of values)
      if (kicker !== low && kicker !== high)
        add(2, [high!, low!, kicker], [low!, low!, high!, high!, kicker]);
  return patterns.sort(
    (left, right) =>
      left.category - right.category || lexicographic(left.tie, right.tie),
  );
}
