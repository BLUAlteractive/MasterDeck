import { expect, it } from 'vitest';
import { canonicalFaces } from '@deckforge/game-core';
import { createPokerHand, reducePokerHand } from './hand';
import { projectPokerHand } from './projection';
import { evaluateSevenCardHand } from './seven';
import { simulatePokerHand } from '../test/simulation';
const initial = () =>
  createPokerHand(
    {
      players: [
        { id: 'a', stack: 100 },
        { id: 'b', stack: 100 },
        { id: 'c', stack: 100 },
      ],
      dealer: 0,
      smallBlind: 1,
      bigBlind: 2,
    },
    canonicalFaces.map((f) => f.id),
  );
it('exposes own holes only and rejects a nonmember viewer', () => {
  const s = initial();
  const view = projectPokerHand(s, 'a');
  expect(view.players.map((p) => p.hole)).toEqual([
    s.players[0]!.hole,
    null,
    null,
  ]);
  expect(Object.keys(view)).not.toEqual(
    expect.arrayContaining(['deck', 'burned', 'cursor']),
  );
  expect(() => projectPokerHand(s, 'outsider')).toThrow('NOT_A_PARTICIPANT');
  expect(Object.isFrozen(view.players[0]!.hole)).toBe(true);
});
it('a fold outcome contains no opponents holes or hand breakdown', () => {
  let s = initial();
  s = reducePokerHand(s, { playerId: 'a', expectedVersion: 0, action: 'FOLD' });
  s = reducePokerHand(s, { playerId: 'b', expectedVersion: 1, action: 'FOLD' });
  const view = projectPokerHand(s, 'a');
  expect(view.outcome!.hands).toEqual([]);
  expect(view.players[1]!.hole).toBe(null);
  expect(view.players[2]!.hole).toBe(null);
});
it('reproduces ranks and pot winners from visible cards across 1000 terminal fixtures', () => {
  for (let seed = 1; seed <= 1000; seed++) {
    const { state } = simulatePokerHand(seed),
      view = projectPokerHand(state, state.players[0]!.id);
    for (const player of view.players) {
      if (player.folded && player.id !== state.players[0]!.id)
        expect(player.hole).toBe(null);
    }
    const ranks = new Map<string, number>();
    for (const hand of view.outcome!.hands) {
      const player = view.players.find((p) => p.id === hand.playerId)!;
      const rank = evaluateSevenCardHand([...player.hole!, ...view.board]);
      ranks.set(player.id, rank.rank.strength);
      expect(hand.category).toBe(rank.rank.category);
      expect(hand.tiebreak).toEqual(rank.rank.tiebreak);
      expect(hand.bestFives).toEqual(rank.bestFives);
    }
    for (const pot of view.outcome!.allocation.pots) {
      if (view.outcome!.reason === 'SHOWDOWN')
        for (const winner of pot.winners)
          expect(ranks.get(winner)).toBe(
            Math.max(...pot.eligible.map((id) => ranks.get(id)!)),
          );
    }
  }
}, 30000);
