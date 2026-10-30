import { type PokerHand, legalPokerActions } from './hand';
import { allocatePokerPots, type PokerAllocation } from './pots';
import { evaluateSevenCardHand } from './seven';
import type { FiveCardRank } from './five';
import type { FaceId } from '@deckforge/game-core';
export type PokerView = Readonly<{
  rulesetVersion: PokerHand['rulesetVersion'];
  stateVersion: number;
  street: PokerHand['street'];
  dealer: number;
  smallBlind: number;
  bigBlind: number;
  board: readonly FaceId[];
  toAct: string | null;
  currentBet: number;
  players: readonly Readonly<{
    id: string;
    stack: number;
    committed: number;
    streetBet: number;
    folded: boolean;
    allIn: boolean;
    hole: readonly FaceId[] | null;
  }>[];
  legal: ReturnType<typeof legalPokerActions>;
  outcome: Readonly<{
    reason: 'FOLD' | 'SHOWDOWN';
    allocation: PokerAllocation;
    hands: readonly Readonly<{
      playerId: string;
      category: FiveCardRank['category'];
      tiebreak: readonly number[];
      bestFives: readonly (readonly FaceId[])[];
    }>[];
  }> | null;
}>;
/** Allow-list projection only. Never spread private state or event JSON into a payload. */
export function projectPokerHand(s: PokerHand, viewerId: string): PokerView {
  if (!s.players.some((p) => p.id === viewerId))
    throw new Error('NOT_A_PARTICIPANT');
  const showdown = s.street === 'COMPLETE' && s.completionReason === 'SHOWDOWN';
  const outcome =
    s.street === 'COMPLETE'
      ? Object.freeze({
          reason: s.completionReason!,
          allocation: allocatePokerPots(s),
          hands: Object.freeze(
            showdown
              ? s.players
                  .filter((p) => !p.folded)
                  .map((p) => {
                    const evaluated = evaluateSevenCardHand([
                      ...p.hole,
                      ...s.board,
                    ]);
                    return Object.freeze({
                      playerId: p.id,
                      category: evaluated.rank.category,
                      tiebreak: evaluated.rank.tiebreak,
                      bestFives: evaluated.bestFives,
                    });
                  })
              : [],
          ),
        })
      : null;
  return Object.freeze({
    rulesetVersion: s.rulesetVersion,
    stateVersion: s.stateVersion,
    street: s.street,
    dealer: s.dealer,
    smallBlind: s.smallBlind,
    bigBlind: s.bigBlind,
    board: Object.freeze([...s.board]),
    toAct: s.toAct === null ? null : s.players[s.toAct]!.id,
    currentBet: s.currentBet,
    players: Object.freeze(
      s.players.map((p) =>
        Object.freeze({
          id: p.id,
          stack: p.stack,
          committed: p.committed,
          streetBet: p.streetBet,
          folded: p.folded,
          allIn: !p.folded && p.stack === 0,
          hole:
            p.id === viewerId || (showdown && !p.folded)
              ? Object.freeze([...p.hole])
              : null,
        }),
      ),
    ),
    legal: legalPokerActions(s, viewerId),
    outcome,
  });
}
