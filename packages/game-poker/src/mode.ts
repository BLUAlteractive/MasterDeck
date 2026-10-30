import { CLASSIC_RULESET } from './hand';
import { evaluateSevenCardHand } from './seven';
import {
  evaluateEvolvedSeven,
  type EvolvedContext,
  type EvolvedRules,
} from './evolved';
import { EVOLVED_A_EXPERIMENTAL_V1 } from './evolved-ranks';
import type { FaceId } from '@deckforge/game-core';
export type PokerModeEvaluation =
  | Readonly<{
      mode: 'CLASSIC';
      rulesetVersion: typeof CLASSIC_RULESET;
      faces: readonly FaceId[];
    }>
  | Readonly<{
      mode: 'EVOLVED';
      rulesetVersion: typeof EVOLVED_A_EXPERIMENTAL_V1;
      context: EvolvedContext;
      policy: EvolvedRules;
    }>;
/** Explicit mode dispatch. Classic never reads inventory, effects or an Evolved result. */
export function evaluatePokerMode(input: PokerModeEvaluation) {
  if (input.mode === 'CLASSIC' && input.rulesetVersion === CLASSIC_RULESET)
    return Object.freeze({
      mode: 'CLASSIC' as const,
      rulesetVersion: CLASSIC_RULESET,
      result: evaluateSevenCardHand(input.faces),
    });
  if (
    input.mode === 'EVOLVED' &&
    input.rulesetVersion === EVOLVED_A_EXPERIMENTAL_V1 &&
    input.policy.rulesetVersion === input.rulesetVersion
  )
    return Object.freeze({
      mode: 'EVOLVED' as const,
      rulesetVersion: input.rulesetVersion,
      result: evaluateEvolvedSeven(input.context, input.policy),
    });
  throw new Error('MODE_RULESET_MISMATCH');
}
