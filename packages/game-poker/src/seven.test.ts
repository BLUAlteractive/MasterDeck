import { describe, expect, it } from 'vitest';
import {
  canonicalFaces,
  getFace,
  suits,
  type FaceId,
} from '@deckforge/game-core';
import {
  compareSevenCardHands,
  evaluateSevenCardHand,
  InvalidSevenCardHand,
} from './index';
import {
  referenceHighHand,
  referenceBestSubsets,
  referenceCompare,
} from '../test/seven-reference';
const hand = (value: string): FaceId[] =>
  value.split(' ').map((id) => getFace(id).id);
const examples = [
  [0, 'A-S J-H 9-D 7-C 5-S 3-H 2-D', [14, 11, 9, 7, 5]],
  [1, 'Q-S Q-H A-D 9-C 3-S 2-H 5-D', [12, 14, 9, 5]],
  [2, 'A-S A-H K-D K-C Q-S Q-H 2-D', [14, 13, 12]],
  [3, '8-S 8-H 8-D A-C 4-S 2-H 6-D', [8, 14, 6]],
  [4, '9-S 8-H 7-D 6-C 5-S 4-H 2-D', [9]],
  [5, 'A-S J-S 9-S 6-S 3-S 2-S K-D', [14, 11, 9, 6, 3]],
  [6, '3-S 3-H 3-D A-C A-S A-H 2-D', [14, 3]],
  [7, '4-S 4-H 4-D 4-C A-S K-H 2-D', [4, 14]],
  [8, '9-S 8-S 7-S 6-S 5-S 4-S 2-H', [9]],
] as const;
const selectionKeys = (selections: readonly (readonly string[])[]) =>
  selections.map((selection) => [...selection].sort().join(',')).sort();
function permutations<T>(values: readonly T[]): T[][] {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) =>
    permutations(values.filter((_value, i) => i !== index)).map((rest) => [
      value,
      ...rest,
    ]),
  );
}
/** Deterministic, noncryptographic fixture sampling ONLY. Never a runtime shuffle/deal source. */
function fixture(seed: number): FaceId[] {
  let state = seed >>> 0;
  const deck = canonicalFaces.map((face) => face.id);
  for (let i = 0; i < 7; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const position = i + (state % (52 - i));
    [deck[i], deck[position]] = [deck[position]!, deck[i]!];
  }
  return deck.slice(0, 7);
}
describe('best five of seven, Classic', () => {
  it.each(examples)(
    'selects category %i and its exact tie vector from seven',
    (categoryIndex, value, tiebreak) => {
      const cards = hand(value);
      const result = evaluateSevenCardHand(cards);
      expect(result.rank).toMatchObject({ categoryIndex, tiebreak });
      expect(result.rank).toMatchObject(referenceHighHand(cards));
      expect(selectionKeys(result.bestFives)).toEqual(
        selectionKeys(referenceBestSubsets(cards)),
      );
    },
  );
  it('handles wheel/royal and chooses the highest run from six or seven suited cards', () => {
    expect(
      evaluateSevenCardHand(hand('A-S 2-H 3-D 4-C 5-S K-H K-D')).rank,
    ).toMatchObject({ category: 'STRAIGHT', tiebreak: [5] });
    expect(
      evaluateSevenCardHand(hand('A-H 2-H 3-H 4-H 5-H K-S Q-D')).rank,
    ).toMatchObject({ category: 'STRAIGHT_FLUSH', tiebreak: [5] });
    expect(
      evaluateSevenCardHand(hand('A-H 2-H 3-H 4-H 5-H 6-H K-S')).rank,
    ).toMatchObject({ category: 'STRAIGHT_FLUSH', tiebreak: [6] });
    expect(
      evaluateSevenCardHand(hand('8-S 9-S 10-S J-S Q-S K-S A-S')).rank,
    ).toMatchObject({ category: 'STRAIGHT_FLUSH', tiebreak: [14] });
    expect(
      evaluateSevenCardHand(hand('Q-S K-H A-D 2-C 3-S 8-H 9-D')).rank.category,
    ).toBe('HIGH_CARD');
    expect(
      evaluateSevenCardHand(hand('9-S 9-H 9-D A-C A-S K-H K-D')).rank.tiebreak,
    ).toEqual([9, 14]);
  });
  it('allows zero, one or two hole cards rather than imposing Omaha-style restrictions', () => {
    const board = hand('10-H J-H Q-H K-H A-H');
    const zero = evaluateSevenCardHand([...hand('2-C 3-D'), ...board]);
    expect(zero.bestFives).toEqual([board]);
    expect(
      compareSevenCardHands(
        [...hand('2-C 3-D'), ...board],
        [...hand('4-C 5-D'), ...board],
      ),
    ).toBe(0);
    const oneHole = hand('K-C 2-D');
    const one = evaluateSevenCardHand([
      ...oneHole,
      ...hand('A-S A-H 9-D 7-C 3-S'),
    ]);
    expect(
      one.bestFives.every(
        (selection) =>
          selection.filter((id) => oneHole.includes(id)).length === 1,
      ),
    ).toBe(true);
    const twoHole = hand('A-C K-D');
    const two = evaluateSevenCardHand([
      ...twoHole,
      ...hand('Q-S J-H 10-D 2-C 3-S'),
    ]);
    expect(two.rank).toMatchObject({ category: 'STRAIGHT', tiebreak: [14] });
    expect(
      two.bestFives.every((selection) =>
        twoHole.every((id) => selection.includes(id)),
      ),
    ).toBe(true);
  });
  it('ignores sixth/seventh cards in ties, including shared-board quads and pair kickers', () => {
    for (const boardValue of ['A-S A-H A-D A-C K-S', 'A-S A-H K-D Q-C J-S']) {
      const board = hand(boardValue);
      expect(
        compareSevenCardHands(
          [...board, ...hand('2-H 3-D')],
          [...board, ...hand('4-H 5-D')],
        ),
      ).toBe(0);
    }
    expect(
      compareSevenCardHands(
        hand('9-S 8-H 7-D 6-C 5-S A-D 2-H'),
        hand('9-D 8-C 7-H 6-S 5-D K-H 3-S'),
      ),
    ).toBe(0);
    const left = hand('A-S A-H K-D Q-C 9-S 3-H 2-D');
    const right = hand('A-D A-C K-H Q-S 8-D 4-H 2-C');
    expect(compareSevenCardHands(left, right)).toBe(1);
    expect(compareSevenCardHands(right, left)).toBe(-1);
  });
  it('retains every equally best selection without input-order or suit ranking', () => {
    const cards = Object.freeze(hand('A-S A-H A-D A-C K-S K-H K-D'));
    const expected = evaluateSevenCardHand(cards);
    expect(expected.bestFives).toHaveLength(3);
    expect(selectionKeys(expected.bestFives)).toEqual(
      selectionKeys(referenceBestSubsets(cards)),
    );
    for (const permutation of permutations(cards))
      expect(evaluateSevenCardHand(permutation)).toEqual(expected);
    for (const [, value] of examples)
      for (const nextSuits of permutations(suits)) {
        const original = hand(value);
        const renamed = original.map((id) => {
          const face = getFace(id);
          return canonicalFaces.find(
            (candidate) =>
              candidate.rank === face.rank &&
              candidate.suit === nextSuits[suits.indexOf(face.suit)],
          )!.id;
        });
        expect(evaluateSevenCardHand(renamed).rank).toEqual(
          evaluateSevenCardHand(original).rank,
        );
        expect(compareSevenCardHands(renamed, original)).toBe(0);
      }
  }, 60000);
  it('freezes all output layers and retains no mutable input references', () => {
    const cards = hand('A-S A-H A-D A-C K-S K-H K-D');
    const before = [...cards];
    const result = evaluateSevenCardHand(Object.freeze(cards));
    expect(cards).toEqual(before);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.rank)).toBe(true);
    expect(Object.isFrozen(result.rank.tiebreak)).toBe(true);
    expect(Object.isFrozen(result.bestFives)).toBe(true);
    expect(result.bestFives.every(Object.isFrozen)).toBe(true);
    expect(Reflect.set(result.bestFives, '0', [])).toBe(false);
    expect(Reflect.set(result.bestFives[0]!, '0', '2-C')).toBe(false);
    const mutable = [...cards];
    const snapshot = evaluateSevenCardHand(mutable);
    mutable[0] = '2-C';
    expect(snapshot).toEqual(result);
  });
  it.each(
    [
      null,
      undefined,
      {},
      'A-S K-S Q-S J-S 10-S 2-D 3-H',
      [],
      ['A-S', 'K-S', 'Q-S', 'J-S', '10-S'],
      ['A-S', 'K-S', 'Q-S', 'J-S', '10-S', '2-D'],
      ['A-S', 'K-S', 'Q-S', 'J-S', '10-S', '2-D', '3-H', '4-C'],
      ['A-S', 'K-S', 'Q-S', 'J-S', '10-S', '2-D', 'A-S'],
      ['A-S', 'K-S', 'Q-S', 'J-S', '10-S', '2-D', 'JOKER'],
      [
        'A-S',
        'K-S',
        'Q-S',
        'J-S',
        '10-S',
        '2-D',
        { id: '3-H', rarity: 'LEGENDARY' },
      ],
      Object.assign(new Array(7), {
        0: 'A-S',
        1: 'K-S',
        2: 'Q-S',
        3: 'J-S',
        4: '10-S',
        5: '2-D',
      }),
    ].map((input) => ({ input })),
  )(
    'rejects invalid seven-card inputs %# before selecting even an obvious royal',
    ({ input }) => {
      const valid = hand('A-S K-S Q-S J-S 10-S 2-D 3-H');
      for (const action of [
        () => Reflect.apply(evaluateSevenCardHand, undefined, [input]),
        () => Reflect.apply(compareSevenCardHands, undefined, [valid, input]),
        () => Reflect.apply(compareSevenCardHands, undefined, [input, valid]),
      ]) {
        expect(action).toThrow(InvalidSevenCardHand);
        try {
          action();
        } catch (error) {
          expect(error).toMatchObject({
            code: 'INVALID_SEVEN_CARD_HAND',
            message: 'Expected exactly seven distinct canonical card faces.',
          });
        }
      }
    },
  );
  it('matches a direct independent reference on 50,000 deterministic seven-card fixtures', () => {
    const categories = new Set<number>();
    const winningMasks = new Set<number>();
    const order = new Map(
      canonicalFaces.map((face, index) => [face.id, index]),
    );
    let previous:
      | { cards: FaceId[]; rank: ReturnType<typeof referenceHighHand> }
      | undefined;
    for (let seed = 0; seed < 50000; seed++) {
      const cards = fixture(seed);
      const expected = referenceHighHand(cards);
      const actual = evaluateSevenCardHand(cards);
      if (
        actual.rank.categoryIndex !== expected.categoryIndex ||
        actual.rank.tiebreak.length !== expected.tiebreak.length ||
        actual.rank.tiebreak.some((value, i) => value !== expected.tiebreak[i])
      )
        throw new Error(
          'Seven-card reference mismatch at seed ' +
            seed +
            ': ' +
            cards.join(' '),
        );
      categories.add(actual.rank.categoryIndex);
      const ordered = [...cards].sort((a, b) => order.get(a)! - order.get(b)!);
      for (const selection of actual.bestFives) {
        if (
          selection.length !== 5 ||
          new Set(selection).size !== 5 ||
          selection.some((id) => !cards.includes(id))
        )
          throw new Error('Invalid best selection at seed ' + seed);
        winningMasks.add(
          selection.reduce((mask, id) => mask | (1 << ordered.indexOf(id)), 0),
        );
      }
      if (seed % 100 === 0)
        expect(selectionKeys(actual.bestFives)).toEqual(
          selectionKeys(referenceBestSubsets(cards)),
        );
      if (previous && seed % 10 === 0) {
        const sign = referenceCompare(expected, previous.rank);
        expect(compareSevenCardHands(cards, previous.cards)).toBe(sign);
        expect(compareSevenCardHands(previous.cards, cards)).toBe(
          sign === 0 ? 0 : -sign,
        );
      }
      previous = { cards, rank: expected };
    }
    expect([...categories].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(winningMasks.size).toBe(21);
  }, 90000);
});
