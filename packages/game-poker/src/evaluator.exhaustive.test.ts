import { describe, expect, it } from 'vitest';
import { canonicalFaces, type FaceId } from '@deckforge/game-core';
import { evaluateFiveCardHand } from './index';
import { buildPatternOracle, patternKey } from '../test/pattern-oracle';

// Primary combinatorial counts, including four royal flushes in the forty straight flushes:
// https://www.math.utah.edu/~treiberg/M3074StudEg.pdf
const expectedHands = [
  1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40,
];
const expectedClasses = [1277, 2860, 858, 858, 10, 1277, 156, 156, 10];
const handsPerClass = [1020, 384, 144, 64, 1020, 4, 24, 4, 4];

describe('exhaustive conventional poker oracle', () => {
  it('matches every physical five-card hand and all 7,462 ordered rank classes', () => {
    const started = Date.now();
    const oracle = buildPatternOracle();
    expect(oracle).toHaveLength(7462);
    const oracleCategories = Array<number>(9).fill(0);
    const reference = new Map(
      oracle.map((pattern, index) => {
        oracleCategories[pattern.category]!++;
        return [
          patternKey(pattern.ranks, pattern.flush),
          { ...pattern, ordinal: index + 1 },
        ];
      }),
    );
    expect(reference.size).toBe(7462);
    expect(oracleCategories).toEqual(expectedClasses);
    const counts = Array<number>(9).fill(0);
    const actualClasses = new Map<
      number,
      { ordinal: number; category: number; count: number }
    >();
    const ordinalStrengths = new Map<number, number>();
    let hands = 0;
    // Reuse only this test's input buffer; evaluator results cannot retain or mutate it.
    const cards: FaceId[] = Array<FaceId>(5);
    for (let a = 0; a < 48; a++)
      for (let b = a + 1; b < 49; b++)
        for (let c = b + 1; c < 50; c++)
          for (let d = c + 1; d < 51; d++)
            for (let e = d + 1; e < 52; e++) {
              const faces = [
                canonicalFaces[a]!,
                canonicalFaces[b]!,
                canonicalFaces[c]!,
                canonicalFaces[d]!,
                canonicalFaces[e]!,
              ];
              for (let i = 0; i < 5; i++) cards[i] = faces[i]!.id;
              const flush = faces.every((face) => face.suit === faces[0]!.suit);
              const expected = reference.get(
                patternKey(
                  faces.map((face) => face.rank),
                  flush,
                ),
              );
              const rank = evaluateFiveCardHand(cards);
              if (
                !expected ||
                rank.categoryIndex !== expected.category ||
                rank.tiebreak.length !== expected.tie.length ||
                rank.tiebreak.some(
                  (value, index) => value !== expected.tie[index],
                )
              )
                throw new Error(
                  'Independent rank-pattern mismatch: ' + cards.join(' '),
                );
              const previous = ordinalStrengths.get(expected.ordinal);
              if (previous !== undefined && previous !== rank.strength)
                throw new Error(
                  'Equal conventional hands have different strength keys',
                );
              ordinalStrengths.set(expected.ordinal, rank.strength);
              const group = actualClasses.get(rank.strength);
              if (group && group.ordinal !== expected.ordinal)
                throw new Error('Conventional rank collision');
              if (group) group.count++;
              else
                actualClasses.set(rank.strength, {
                  ordinal: expected.ordinal,
                  category: rank.categoryIndex,
                  count: 1,
                });
              counts[rank.categoryIndex]!++;
              hands++;
            }
    expect(hands).toBe(2598960);
    expect(counts).toEqual(expectedHands);
    expect(actualClasses.size).toBe(7462);
    expect(ordinalStrengths.size).toBe(7462);
    const ordered = [...actualClasses.entries()].sort(
      (left, right) => left[0] - right[0],
    );
    expect(ordered.map(([, value]) => value.ordinal)).toEqual(
      Array.from({ length: 7462 }, (_, i) => i + 1),
    );
    for (const [, value] of ordered)
      expect(value.count).toBe(handsPerClass[value.category]);
    console.info(
      JSON.stringify({
        event: 'poker.five.exhaustive',
        hands,
        rankClasses: actualClasses.size,
        categoryCounts: counts,
        durationMs: Date.now() - started,
      }),
    );
  }, 90000);
});
