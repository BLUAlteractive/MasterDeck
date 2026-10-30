import { getFace } from '@deckforge/game-core';
import type { PokerHand } from './hand';
import {
  evaluateEvolvedSeven,
  type EarnedHole,
  type EvolvedCandidate,
  type EvolvedRules,
} from './evolved';
function describe(candidate: EvolvedCandidate): string {
  const bonus = candidate.bonus;
  const holes = bonus.includedHoles.length
    ? bonus.includedHoles
        .map(
          (hole) =>
            `${getFace(hole.faceId).label}, level ${hole.level}, ${hole.rarity.toLowerCase()}, earned style ${hole.playStyleFamily}`,
        )
        .join('; ')
    : 'none';
  return `${candidate.rank.category.replaceAll('_', ' ').toLowerCase()}. Evolved power ${candidate.score}: category base ${candidate.rank.categoryIndex * 1000}, category tie value ${candidate.tieValue}, collectible bonus ${bonus.total}. Eligible included holes: ${holes}. Level ${bonus.levelPoints}; rarity ${bonus.rarityPoints}; matched earned style ${bonus.stylePoints}; pocket pair ${bonus.pairPoints}; published series effect ${bonus.seriesPoints}${bonus.seriesEffectId ? ' (' + bonus.seriesEffectId + ')' : ''}. Uncapped bonus ${bonus.rawTotal}; cap 1200; ${bonus.capApplied ? 'cap applied' : 'no cap reduction'}. Exact conventional tiebreak ${candidate.rank.tiebreak.join(', ')}. Equal power compares exact conventional rank, then splits. Unused holes and community cards earn no bonus.`;
}
/** Experimental analysis only; does not change this hand's Classic settlement. */
export function projectEvolvedExplanation(
  hand: PokerHand,
  viewerId: string,
  playerId: string,
  instances: readonly EarnedHole[],
  rules: EvolvedRules,
) {
  if (!hand.players.some((player) => player.id === viewerId))
    throw new Error('NOT_A_PARTICIPANT');
  const player = hand.players.find((player) => player.id === playerId);
  if (!player) throw new Error('NOT_A_PARTICIPANT');
  const visible =
    viewerId === playerId ||
    (hand.street === 'COMPLETE' &&
      hand.completionReason === 'SHOWDOWN' &&
      !player.folded);
  if (!visible) return null;
  if (hand.board.length !== 5) return null;
  const evaluated = evaluateEvolvedSeven(
    { playerId, hole: player.hole, board: hand.board, instances },
    rules,
  );
  return Object.freeze({
    mode: 'EVOLVED_EXPERIMENTAL' as const,
    rulesetVersion: evaluated.rulesetVersion,
    effectsVersion: evaluated.effectsVersion,
    playerId,
    summary: describe(evaluated.best),
    candidates: Object.freeze(
      evaluated.candidates.map((candidate) =>
        Object.freeze({
          cards: candidate.cards,
          category: candidate.rank.category,
          categoryIndex: candidate.rank.categoryIndex,
          tiebreak: candidate.rank.tiebreak,
          tieValue: candidate.tieValue,
          baseScore: candidate.baseScore,
          bonus: candidate.bonus,
          score: candidate.score,
          selected: evaluated.bestFives.includes(candidate),
          description: describe(candidate),
        }),
      ),
    ),
  });
}
