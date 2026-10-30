import { legalSpadesPlays, teamOf } from './tricks';
import type { SpadesMatch } from './scoring';
/** Allow-list only. Opponent hands/decks/private event payloads never leave the server. */
export function projectSpadesMatch(state: SpadesMatch, viewerId: string) {
  const seat = state.deal.players.indexOf(viewerId);
  if (seat < 0) throw new Error('NOT_A_PARTICIPANT');
  const actor =
    state.phase === 'BIDDING'
      ? state.toBid
      : state.phase === 'PLAYING'
        ? state.deal.toAct
        : null;
  const legal =
    actor === seat
      ? state.phase === 'BIDDING'
        ? Object.freeze({
            kind: 'BID' as const,
            min: state.rules.nilEnabled ? 0 : 1,
            max: 13,
          })
        : Object.freeze({
            kind: 'PLAY' as const,
            cards: legalSpadesPlays(state.deal),
          })
      : state.phase === 'ROUND_COMPLETE'
        ? Object.freeze({ kind: 'CONTINUE' as const })
        : null;
  return Object.freeze({
    kind: 'SPADES' as const,
    rulesetVersion: state.rules.version,
    stateVersion: state.stateVersion,
    phase: state.phase,
    round: state.round,
    dealer: state.deal.dealer,
    toAct: actor === null ? null : state.deal.players[actor]!,
    rules: state.rules,
    players: Object.freeze(
      state.deal.players.map((id, index) =>
        Object.freeze({
          id,
          seat: index,
          team: teamOf(index as 0 | 1 | 2 | 3),
          hand: id === viewerId ? state.deal.hands[index]! : null,
          remaining: state.deal.hands[index]!.length,
          bid: state.bids[index]!,
          tricks: state.deal.tricksWon[index]!,
        }),
      ),
    ),
    currentTrick: state.deal.currentTrick,
    lastTrick: state.deal.tricks.at(-1) ?? null,
    tricksCompleted: state.deal.tricks.length,
    spadesBroken: state.deal.spadesBroken,
    teams: state.teams,
    lastResult: state.results.at(-1) ?? null,
    winner: state.winner,
    legal,
  });
}
