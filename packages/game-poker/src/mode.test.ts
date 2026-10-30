import { expect, it, vi } from 'vitest';
import { evaluatePokerMode, type PokerModeEvaluation } from './mode';
import * as evolved from './evolved';
import { evaluateSevenCardHand } from './seven';
import type { FaceId } from '@deckforge/game-core';
it('Classic does not call the bonus evaluator even when extra forged metadata is supplied', () => {
  const spy = vi
    .spyOn(evolved, 'evaluateEvolvedSeven')
    .mockImplementation(() => {
      throw new Error('must never execute for Classic');
    });
  const faces: FaceId[] = ['A-C', 'A-D', 'K-H', 'Q-S', 'J-C', '2-D', '3-H'];
  try {
    expect(
      evaluatePokerMode({
        mode: 'CLASSIC',
        rulesetVersion: 'CLASSIC_NLHE_V1',
        faces,
        context: { boost: 99999 },
      } as PokerModeEvaluation),
    ).toEqual({
      mode: 'CLASSIC',
      rulesetVersion: 'CLASSIC_NLHE_V1',
      result: evaluateSevenCardHand(faces),
    });
    expect(spy).not.toHaveBeenCalled();
  } finally {
    spy.mockRestore();
  }
});
it('rejects cross-mode versions instead of falling through to another scorer', () => {
  expect(() =>
    evaluatePokerMode({
      mode: 'CLASSIC',
      rulesetVersion: 'EVOLVED_A_EXPERIMENTAL_V1',
      faces: [],
    } as unknown as PokerModeEvaluation),
  ).toThrow('MODE_RULESET_MISMATCH');
});
