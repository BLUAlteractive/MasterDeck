import { expect, it } from 'vitest';
import { canonicalFaces, type FaceId } from '@deckforge/game-core';
import { createPokerHand, reducePokerHand, type PokerHand } from './hand';
import { allocatePokerPots } from './pots';
// Terminal fixtures isolate pot arithmetic from action ordering. Unique board royal gives exact ties.
function fixture(
  amounts: number[],
  folded: number[] = [],
  dealer = 0,
): PokerHand {
  const base = createPokerHand(
    {
      players: amounts.map((n, i) => ({
        id: String(i),
        stack: Math.max(1, n),
      })),
      dealer,
      smallBlind: 1,
      bigBlind: 2,
    },
    canonicalFaces.map((f) => f.id),
  );
  const hole: FaceId[][] = [
    ['2-C', '3-C'],
    ['4-C', '5-C'],
    ['6-C', '7-C'],
    ['8-C', '9-C'],
    ['10-C', 'J-C'],
    ['Q-C', 'K-C'],
  ];
  return {
    ...base,
    street: 'COMPLETE',
    completionReason: 'SHOWDOWN',
    toAct: null,
    board: ['10-S', 'J-S', 'Q-S', 'K-S', 'A-S'],
    players: base.players.map((p, i) => ({
      ...p,
      startingStack: amounts[i]!,
      stack: 0,
      committed: amounts[i]!,
      folded: folded.includes(i),
      hole: hole[i]!,
    })),
  };
}
it('builds contribution layers, excludes folded contenders, refunds unmatched excess', () => {
  const result = allocatePokerPots(fixture([10, 20, 35], [1]));
  expect(result.pots.map((p) => [p.amount, p.eligible, p.winners])).toEqual([
    [30, ['0', '2'], ['2', '0']],
    [20, ['2'], ['2']],
  ]);
  expect(result.players.map((p) => [p.payout, p.refund, p.finalStack])).toEqual(
    [
      [15, 0, 15],
      [0, 0, 0],
      [35, 15, 50],
    ],
  );
  expect(Object.isFrozen(result.pots[0]!.awards)).toBe(true);
});
it('assigns odd chips independently per pot clockwise left of button', () => {
  const result = allocatePokerPots(fixture([1, 2, 2, 2], [3], 0));
  expect(result.pots.map((p) => p.awards)).toEqual([
    [
      { playerId: '1', amount: 2 },
      { playerId: '2', amount: 1 },
      { playerId: '0', amount: 1 },
    ],
    [
      { playerId: '1', amount: 2 },
      { playerId: '2', amount: 1 },
    ],
  ]);
});
it('awards a fold win without evaluating or exposing holes', () => {
  let s = createPokerHand(
    {
      players: [
        { id: 'a', stack: 100 },
        { id: 'b', stack: 100 },
      ],
      dealer: 0,
      smallBlind: 1,
      bigBlind: 2,
    },
    canonicalFaces.map((f) => f.id),
  );
  s = reducePokerHand(s, { playerId: 'a', expectedVersion: 0, action: 'FOLD' });
  expect(allocatePokerPots(s).players).toEqual([
    { playerId: 'a', payout: 0, refund: 0, finalStack: 99 },
    { playerId: 'b', payout: 2, refund: 1, finalStack: 101 },
  ]);
});
it('chooses a distinct winner per side pot using only eligible hands', () => {
  const s = fixture([10, 20, 30]);
  const result = allocatePokerPots({
    ...s,
    board: ['2-S', '2-H', '7-D', '9-H', 'J-D'],
    players: s.players.map((p, i) => ({
      ...p,
      hole: (
        [
          ['2-C', '2-D'],
          ['A-C', 'A-D'],
          ['K-C', 'K-D'],
        ] as FaceId[][]
      )[i]!,
    })),
  });
  expect(result.pots.map((p) => p.winners)).toEqual([['0'], ['1']]);
  expect(result.players.map((p) => p.finalStack)).toEqual([30, 20, 10]);
});
it('conserves chips and contributor eligibility for 5000 generated side-pot layouts', () => {
  let seed = 78324;
  const draw = (upper: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % upper;
  };
  for (let trial = 0; trial < 5000; trial++) {
    const n = 2 + draw(5),
      amounts = Array.from({ length: n }, () => 1 + draw(1000));
    const max = Math.max(...amounts);
    const folded = amounts.flatMap((a, i) => (a < max && draw(2) ? [i] : []));
    const s = fixture(amounts, folded, draw(n)),
      result = allocatePokerPots(s);
    expect(result.players.reduce((sum, p) => sum + p.finalStack, 0)).toBe(
      amounts.reduce((a, b) => a + b, 0),
    );
    for (const pot of result.pots) {
      expect(pot.awards.reduce((sum, p) => sum + p.amount, 0)).toBe(pot.amount);
      for (const id of pot.winners) {
        expect(pot.eligible).toContain(id);
        expect(amounts[Number(id)]).toBeGreaterThanOrEqual(pot.cap);
        expect(folded).not.toContain(Number(id));
      }
    }
    expect(allocatePokerPots(s)).toEqual(result);
  }
}, 30000);
it('rejects nonterminal or inconsistent contribution states', () => {
  const s = fixture([10, 20]);
  for (const bad of [
    { ...s, street: 'RIVER' as const },
    { ...s, players: s.players.map((p) => ({ ...p, stack: 1 })) },
    { ...s, players: s.players.map((p) => ({ ...p, folded: true })) },
  ])
    expect(() => allocatePokerPots(bad)).toThrow();
});
