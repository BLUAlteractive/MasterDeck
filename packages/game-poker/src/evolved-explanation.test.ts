import { describe, expect, it } from 'vitest';
import { canonicalFaces } from '@deckforge/game-core';
import { evolvedExplanationSchema } from '../../contracts/src/evolved';
import {
  createPokerHand,
  reducePokerHand,
  legalPokerActions,
  type PokerHand,
} from './hand';
import { createEvolvedRules, type EarnedHole } from './evolved';
import { projectEvolvedExplanation } from './evolved-explanation';
const rules = createEvolvedRules('NO_EFFECTS_V1');
function river(): PokerHand {
  let hand = createPokerHand(
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
    canonicalFaces.map((face) => face.id),
  );
  while (hand.street !== 'RIVER') {
    const player = hand.players[hand.toAct!]!;
    const legal = legalPokerActions(hand, player.id)!;
    hand = reducePokerHand(hand, {
      playerId: player.id,
      expectedVersion: hand.stateVersion,
      action: legal.canCheck ? 'CHECK' : 'CALL',
    });
  }
  return hand;
}
function instances(hand: PokerHand, playerId: string): EarnedHole[] {
  return hand.players
    .find((player) => player.id === playerId)!
    .hole.map((faceId) => ({
      instanceId: 'instance-' + faceId,
      ownerId: playerId,
      faceId,
      level: 6,
      rarity: 'LEGENDARY',
      playStyleFamily: 'earned',
      seriesId: 'fixture',
      status: 'LOCKED',
    }));
}
describe('safe transparent Evolved explanation', () => {
  it('publishes all 21 candidates with reproducible components, exclusions and selected best', () => {
    const hand = river(),
      view = projectEvolvedExplanation(
        hand,
        'a',
        'a',
        instances(hand, 'a'),
        rules,
      )!;
    expect(evolvedExplanationSchema.safeParse(view).success).toBe(true);
    expect(view.candidates).toHaveLength(21);
    for (const candidate of view.candidates) {
      expect(candidate.score).toBe(candidate.baseScore + candidate.bonus.total);
      expect(candidate.description).toContain('cap 1200');
      expect(candidate.description).toContain('then splits');
      expect(
        candidate.bonus.includedHoles.every((hole) =>
          candidate.cards.includes(hole.faceId),
        ),
      ).toBe(true);
    }
    const boardOnly = view.candidates.find((candidate) =>
      candidate.cards.every((face) => hand.board.includes(face)),
    )!;
    expect(boardOnly.bonus.total).toBe(0);
    expect(boardOnly.description).toContain('Eligible included holes: none');
    expect(view.summary).toContain(
      'Unused holes and community cards earn no bonus',
    );
    expect(JSON.stringify(view)).not.toContain('deck');
    expect(JSON.stringify(view)).not.toContain('ownerId');
  });
  it('hides opponents before showdown and folded opponents after showdown', () => {
    let hand = river();
    expect(
      projectEvolvedExplanation(hand, 'a', 'b', instances(hand, 'b'), rules),
    ).toBe(null);
    expect(() =>
      projectEvolvedExplanation(hand, 'outsider', 'b', [], rules),
    ).toThrow('NOT_A_PARTICIPANT');
    const folded = hand.players[hand.toAct!]!.id;
    hand = reducePokerHand(hand, {
      playerId: folded,
      expectedVersion: hand.stateVersion,
      action: 'FOLD',
    });
    while (hand.street !== 'COMPLETE') {
      const player = hand.players[hand.toAct!]!;
      const legal = legalPokerActions(hand, player.id)!;
      hand = reducePokerHand(hand, {
        playerId: player.id,
        expectedVersion: hand.stateVersion,
        action: legal.canCheck ? 'CHECK' : 'CALL',
      });
    }
    const viewer = hand.players.find((player) => !player.folded)!.id;
    expect(
      projectEvolvedExplanation(
        hand,
        viewer,
        folded,
        instances(hand, folded),
        rules,
      ),
    ).toBe(null);
    const opponent = hand.players.find(
      (player) => !player.folded && player.id !== viewer,
    )!.id;
    expect(
      evolvedExplanationSchema.safeParse(
        projectEvolvedExplanation(
          hand,
          viewer,
          opponent,
          instances(hand, opponent),
          rules,
        ),
      ).success,
    ).toBe(true);
  });
  it('rejects payload pollution and inconsistent scores at the wire boundary', () => {
    const hand = river(),
      view = projectEvolvedExplanation(
        hand,
        'a',
        'a',
        instances(hand, 'a'),
        rules,
      )!;
    expect(
      evolvedExplanationSchema.safeParse({ ...view, deck: hand.deck }).success,
    ).toBe(false);
    expect(
      evolvedExplanationSchema.safeParse({
        ...view,
        candidates: view.candidates.map((candidate, index) =>
          index ? candidate : { ...candidate, score: candidate.score + 1 },
        ),
      }).success,
    ).toBe(false);
    expect(
      evolvedExplanationSchema.safeParse({
        ...view,
        candidates: view.candidates.map((candidate, index) =>
          index
            ? candidate
            : { ...candidate, bonus: { ...candidate.bonus, paidBoost: 999 } },
        ),
      }).success,
    ).toBe(false);
  });
});
