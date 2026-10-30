import { describe, expect, it } from 'vitest';
import {
  canonicalFaces,
  getFace,
  suits,
  type FaceId,
} from '@deckforge/game-core';
import {
  compareFiveCardHands,
  evaluateFiveCardHand,
  InvalidPokerHand,
  handCategories,
} from './index';
const hand = (value: string): FaceId[] =>
  value.split(' ').map((id) => getFace(id).id);
const examples = [
  ['HIGH_CARD', 'A-S J-H 9-D 6-C 3-S', [14, 11, 9, 6, 3]],
  ['ONE_PAIR', 'Q-S Q-H A-D 9-C 3-S', [12, 14, 9, 3]],
  ['TWO_PAIR', 'K-S K-H 2-D 2-C A-S', [13, 2, 14]],
  ['THREE_OF_A_KIND', '8-S 8-H 8-D A-C 4-S', [8, 14, 4]],
  ['STRAIGHT', '9-S 8-H 7-D 6-C 5-S', [9]],
  ['FLUSH', 'A-S J-S 9-S 6-S 3-S', [14, 11, 9, 6, 3]],
  ['FULL_HOUSE', '3-S 3-H 3-D A-C A-S', [3, 14]],
  ['FOUR_OF_A_KIND', '4-S 4-H 4-D 4-C A-S', [4, 14]],
  ['STRAIGHT_FLUSH', '9-S 8-S 7-S 6-S 5-S', [9]],
] as const;
function permutations<T>(values: readonly T[]): T[][] {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) =>
    permutations(values.filter((_item, i) => i !== index)).map((rest) => [
      value,
      ...rest,
    ]),
  );
}
describe('standard five-card high poker', () => {
  it.each(examples)(
    'classifies %s with the complete conventional tie vector',
    (category, cards, tiebreak) => {
      const result = evaluateFiveCardHand(hand(cards));
      expect(result).toMatchObject({
        category,
        tiebreak,
        categoryIndex: handCategories.indexOf(category),
      });
      expect(Number.isSafeInteger(result.strength)).toBe(true);
    },
  );
  it('keeps every category boundary stronger than every lower category', () => {
    for (let i = 1; i < examples.length; i++) {
      const left = hand(examples[i]![1]),
        right = hand(examples[i - 1]![1]);
      expect(compareFiveCardHands(left, right)).toBe(1);
      expect(compareFiveCardHands(right, left)).toBe(-1);
    }
    expect(
      compareFiveCardHands(
        hand('2-S 2-H 2-D 3-C 3-S'),
        hand('A-S K-S Q-S J-S 9-S'),
      ),
    ).toBe(1);
    expect(
      compareFiveCardHands(
        hand('7-S 5-S 4-S 3-S 2-S'),
        hand('A-S K-H Q-D J-C 10-S'),
      ),
    ).toBe(1);
  });
  it('treats the wheel as five-high, royal as ace-high straight flush, and forbids wraparound straights', () => {
    expect(evaluateFiveCardHand(hand('A-S 2-H 3-D 4-C 5-S'))).toMatchObject({
      category: 'STRAIGHT',
      tiebreak: [5],
    });
    expect(
      compareFiveCardHands(
        hand('6-S 2-H 3-D 4-C 5-S'),
        hand('A-S 2-H 3-D 4-C 5-S'),
      ),
    ).toBe(1);
    expect(evaluateFiveCardHand(hand('A-H 2-H 3-H 4-H 5-H'))).toMatchObject({
      category: 'STRAIGHT_FLUSH',
      tiebreak: [5],
    });
    expect(evaluateFiveCardHand(hand('10-S J-S Q-S K-S A-S'))).toMatchObject({
      category: 'STRAIGHT_FLUSH',
      categoryIndex: 8,
      tiebreak: [14],
    });
    for (const value of ['Q-S K-H A-D 2-C 3-S', 'K-S A-H 2-D 3-C 4-S'])
      expect(evaluateFiveCardHand(hand(value)).category).toBe('HIGH_CARD');
  });
  it.each([
    ['A-S J-H 9-D 6-C 4-S', 'A-H J-D 9-C 6-S 3-H'],
    ['A-S J-S 9-S 6-S 4-S', 'A-H J-H 9-H 6-H 3-H'],
    ['Q-S Q-H A-D 9-C 4-S', 'Q-D Q-C A-H 9-S 3-H'],
    ['Q-S Q-H A-D 10-C 2-S', 'Q-D Q-C A-H 9-S 8-H'],
    ['Q-S Q-H A-D 3-C 2-S', 'Q-D Q-C K-H J-S 10-H'],
    ['K-S K-H 2-D 2-C A-S', 'Q-S Q-H J-D J-C A-S'],
    ['K-S K-H 3-D 3-C 2-S', 'K-D K-C 2-H 2-S A-H'],
    ['K-S K-H 2-D 2-C A-S', 'K-D K-C 2-H 2-S Q-H'],
    ['8-S 8-H 8-D A-C 5-S', '8-S 8-H 8-D A-C 4-S'],
    ['8-S 8-H 8-D A-C 2-S', '8-S 8-H 8-D K-C Q-S'],
    ['3-S 3-H 3-D 2-C 2-S', '2-S 2-H 2-D A-C A-S'],
    ['3-S 3-H 3-D A-C A-S', '3-S 3-H 3-D K-C K-S'],
    ['4-S 4-H 4-D 4-C 2-S', '3-S 3-H 3-D 3-C A-S'],
    ['4-S 4-H 4-D 4-C A-S', '4-S 4-H 4-D 4-C K-S'],
  ])('orders exact kickers for %s versus %s', (left, right) => {
    expect(compareFiveCardHands(hand(left), hand(right))).toBe(1);
    expect(compareFiveCardHands(hand(right), hand(left))).toBe(-1);
  });
  it('is invariant to all 120 input orders and every global suit permutation', () => {
    for (const [, value] of examples) {
      const cards = Object.freeze(hand(value));
      const expected = evaluateFiveCardHand(cards);
      for (const permutation of permutations(cards))
        expect(evaluateFiveCardHand(permutation)).toEqual(expected);
      for (const suitOrder of permutations(suits)) {
        const renamed = cards.map((id) => {
          const face = getFace(id);
          const nextSuit = suitOrder[suits.indexOf(face.suit)]!;
          return canonicalFaces.find(
            (candidate) =>
              candidate.rank === face.rank && candidate.suit === nextSuit,
          )!.id;
        });
        expect(evaluateFiveCardHand(renamed)).toEqual(expected);
        expect(compareFiveCardHands(cards, renamed)).toBe(0);
      }
    }
  });
  it('never mutates inputs and returns an immutable rank independent of later input changes', () => {
    const cards = hand('3-S A-H 9-D 6-C J-S');
    const before = [...cards];
    const rank = evaluateFiveCardHand(Object.freeze(cards));
    expect(cards).toEqual(before);
    expect(Object.isFrozen(rank)).toBe(true);
    expect(Object.isFrozen(rank.tiebreak)).toBe(true);
    expect(Object.isFrozen(handCategories)).toBe(true);
    expect(Reflect.set(rank, 'strength', -1)).toBe(false);
    expect(Reflect.set(rank.tiebreak, '0', 2)).toBe(false);
    expect(compareFiveCardHands(cards, cards)).toBe(0);
    const mutable = [...before];
    const snapshot = evaluateFiveCardHand(mutable);
    mutable[0] = '2-C';
    expect(snapshot).toEqual(rank);
  });
  it.each(
    [
      null,
      undefined,
      {},
      'A-S K-S Q-S J-S 10-S',
      [],
      ['A-S', 'K-S', 'Q-S', 'J-S'],
      ['A-S', 'K-S', 'Q-S', 'J-S', '10-S', '9-S'],
      ['A-S', 'A-S', 'Q-S', 'J-S', '10-S'],
      ['A-S', 'K-S', 'Q-S', 'J-S', 'JOKER'],
      ['A-S', 'K-S', 'Q-S', 'J-S', 'a-s'],
      ['A-S', 'K-S', 'Q-S', 'J-S', 14],
      [
        'A-S',
        'K-S',
        'Q-S',
        'J-S',
        { id: '10-S', rank: 14, rarity: 'LEGENDARY' },
      ],
      Object.assign(new Array(5), { 0: 'A-S', 1: 'K-S', 2: 'Q-S', 3: 'J-S' }),
    ].map((input) => ({ input })),
  )(
    'rejects malformed/duplicate/forged inputs %# with a safe domain error',
    ({ input }) => {
      expect(() =>
        Reflect.apply(evaluateFiveCardHand, undefined, [input]),
      ).toThrow(InvalidPokerHand);
      const valid = hand('A-S K-S Q-S J-S 10-S');
      expect(() =>
        Reflect.apply(compareFiveCardHands, undefined, [valid, input]),
      ).toThrow(InvalidPokerHand);
      expect(() =>
        Reflect.apply(compareFiveCardHands, undefined, [input, valid]),
      ).toThrow(InvalidPokerHand);
      try {
        Reflect.apply(evaluateFiveCardHand, undefined, [input]);
      } catch (error) {
        expect(error).toMatchObject({
          code: 'INVALID_FIVE_CARD_HAND',
          message: 'Expected exactly five distinct canonical card faces.',
        });
      }
    },
  );
});
