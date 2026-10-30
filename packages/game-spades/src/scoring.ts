import {
  createSpadesDeal,
  nextSeat,
  playSpades,
  type Seat,
  type SpadesDeal,
} from './tricks';
import type { FaceId } from '@deckforge/game-core';

/** Required immutable match policy. No production default or paid-currency effect. */
export type SpadesRules = Readonly<{
  version: string;
  nilEnabled: boolean;
  nilPoints: number;
  contractPoints: number;
  bagPoints: number;
  bagThreshold: number;
  bagPenalty: number;
  /** Failed nil tricks never satisfy partner's contract; this selects their bag treatment. */
  failedNilCountsAsBags: boolean;
  failedNilBagPoints: number;
  targetScore: number;
}>;
export type TeamScore = Readonly<{ score: number; bags: number }>;
export type TeamRoundScore = Readonly<
  TeamScore & {
    contract: number;
    contractTricks: number;
    madeContract: boolean;
    overtricks: number;
    nilTricks: number;
    nilScore: number;
    bagsAdded: number;
    bagPenaltyCount: number;
    delta: number;
  }
>;
export type SpadesRoundResult = Readonly<{
  round: number;
  teams: readonly TeamRoundScore[];
}>;
const MAX_SCORE = 1_000_000_000;
function integer(value: number, min: number, max: number): boolean {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}
export function validateSpadesRules(input: SpadesRules): SpadesRules {
  if (
    typeof input.version !== 'string' ||
    !input.version.trim() ||
    input.version.length > 128 ||
    typeof input.nilEnabled !== 'boolean' ||
    typeof input.failedNilCountsAsBags !== 'boolean' ||
    !integer(input.nilPoints, 1, 10000) ||
    !integer(input.contractPoints, 1, 1000) ||
    !integer(input.bagPoints, 0, 1000) ||
    !integer(input.bagThreshold, 1, 100) ||
    !integer(input.bagPenalty, 1, 10000) ||
    !integer(input.failedNilBagPoints, 0, 1000) ||
    !integer(input.targetScore, 1, 1_000_000) ||
    (!input.failedNilCountsAsBags && input.failedNilBagPoints !== 0)
  )
    throw new Error('INVALID_SPADES_RULES');
  return Object.freeze({ ...input });
}
function validateBids(bids: readonly number[], rules: SpadesRules): void {
  if (
    bids.length !== 4 ||
    bids.some((bid) => !integer(bid, rules.nilEnabled ? 0 : 1, 13))
  )
    throw new Error('INVALID_BIDS');
}
export function scoreSpadesRound(
  policy: SpadesRules,
  previous: readonly TeamScore[],
  bids: readonly number[],
  tricks: readonly number[],
): readonly TeamRoundScore[] {
  const rules = validateSpadesRules(policy);
  validateBids(bids, rules);
  if (
    tricks.length !== 4 ||
    tricks.some((count) => !integer(count, 0, 13)) ||
    tricks.reduce((sum, count) => sum + count, 0) !== 13
  )
    throw new Error('INVALID_TRICK_COUNTS');
  if (
    previous.length !== 2 ||
    previous.some(
      (team) =>
        !integer(team.score, -MAX_SCORE, MAX_SCORE) ||
        !integer(team.bags, 0, rules.bagThreshold - 1),
    )
  )
    throw new Error('INVALID_TEAM_SCORES');
  return Object.freeze(
    previous.map((prior, team) => {
      const seats = [team, team + 2];
      const contract = seats.reduce((sum, seat) => sum + bids[seat]!, 0);
      const contractTricks = seats.reduce(
        (sum, seat) => sum + (bids[seat] === 0 ? 0 : tricks[seat]!),
        0,
      );
      const nilTricks = seats.reduce(
        (sum, seat) => sum + (bids[seat] === 0 ? tricks[seat]! : 0),
        0,
      );
      const nilScore = seats.reduce(
        (sum, seat) =>
          sum +
          (bids[seat] === 0
            ? tricks[seat] === 0
              ? rules.nilPoints
              : -rules.nilPoints
            : 0),
        0,
      );
      const madeContract = contractTricks >= contract;
      const overtricks = madeContract ? contractTricks - contract : 0;
      const failedNilBags = rules.failedNilCountsAsBags ? nilTricks : 0;
      const bagsAdded = overtricks + failedNilBags;
      const bagPenaltyCount = Math.floor(
        (prior.bags + bagsAdded) / rules.bagThreshold,
      );
      const delta =
        (madeContract ? 1 : -1) * rules.contractPoints * contract +
        rules.bagPoints * overtricks +
        rules.failedNilBagPoints * failedNilBags +
        nilScore -
        bagPenaltyCount * rules.bagPenalty;
      const score = prior.score + delta;
      if (!integer(score, -MAX_SCORE, MAX_SCORE))
        throw new Error('SCORE_LIMIT');
      return Object.freeze({
        contract,
        contractTricks,
        madeContract,
        overtricks,
        nilTricks,
        nilScore,
        bagsAdded,
        bagPenaltyCount,
        delta,
        score,
        bags: (prior.bags + bagsAdded) % rules.bagThreshold,
      });
    }),
  );
}
export function spadesMatchWinner(
  teams: readonly TeamScore[],
  targetScore: number,
): 0 | 1 | null {
  if (
    teams.length !== 2 ||
    !integer(targetScore, 1, 1_000_000) ||
    teams.some((team) => !integer(team.score, -MAX_SCORE, MAX_SCORE))
  )
    throw new Error('INVALID_TEAM_SCORES');
  const a = teams[0]!.score,
    b = teams[1]!.score;
  if (Math.max(a, b) < targetScore || a === b) return null;
  return a > b ? 0 : 1;
}
export type SpadesMatch = Readonly<{
  rules: SpadesRules;
  phase: 'BIDDING' | 'PLAYING' | 'ROUND_COMPLETE' | 'MATCH_COMPLETE';
  round: number;
  stateVersion: number;
  deal: SpadesDeal;
  bids: readonly (number | null)[];
  toBid: Seat;
  teams: readonly TeamScore[];
  results: readonly SpadesRoundResult[];
  winner: 0 | 1 | null;
}>;
export type SpadesMatchCommand = Readonly<
  { playerId: string; expectedVersion: number } & (
    { kind: 'BID'; tricks: number } | { kind: 'PLAY'; face: FaceId }
  )
>;
export function createSpadesMatch(
  players: readonly string[],
  dealer: Seat,
  deck: readonly FaceId[],
  policy: SpadesRules,
): SpadesMatch {
  return Object.freeze({
    rules: validateSpadesRules(policy),
    phase: 'BIDDING',
    round: 1,
    stateVersion: 0,
    deal: createSpadesDeal(players, dealer, deck),
    bids: Object.freeze([null, null, null, null]),
    toBid: nextSeat(dealer),
    teams: Object.freeze([
      Object.freeze({ score: 0, bags: 0 }),
      Object.freeze({ score: 0, bags: 0 }),
    ]),
    results: Object.freeze([]),
    winner: null,
  });
}
export function applySpadesMatch(
  state: SpadesMatch,
  command: SpadesMatchCommand,
): SpadesMatch {
  if (
    !Number.isSafeInteger(command.expectedVersion) ||
    command.expectedVersion !== state.stateVersion
  )
    throw new Error('STALE_VERSION');
  if (command.kind === 'BID') {
    if (state.phase !== 'BIDDING') throw new Error('NOT_BIDDING');
    if (command.playerId !== state.deal.players[state.toBid])
      throw new Error('NOT_YOUR_TURN');
    if (!integer(command.tricks, state.rules.nilEnabled ? 0 : 1, 13))
      throw new Error('INVALID_BID');
    const bids = [...state.bids];
    bids[state.toBid] = command.tricks;
    return Object.freeze({
      ...state,
      bids: Object.freeze(bids),
      toBid: nextSeat(state.toBid),
      phase: bids.every((bid) => bid !== null) ? 'PLAYING' : 'BIDDING',
      stateVersion: state.stateVersion + 1,
    });
  }
  if (command.kind !== 'PLAY' || state.phase !== 'PLAYING')
    throw new Error('NOT_PLAYING');
  const deal = playSpades(state.deal, {
    playerId: command.playerId,
    expectedVersion: state.deal.stateVersion,
    face: command.face,
  });
  if (!deal.finished)
    return Object.freeze({
      ...state,
      deal,
      stateVersion: state.stateVersion + 1,
    });
  const teams = scoreSpadesRound(
    state.rules,
    state.teams,
    state.bids as readonly number[],
    deal.tricksWon,
  );
  const winner = spadesMatchWinner(teams, state.rules.targetScore);
  return Object.freeze({
    ...state,
    deal,
    teams,
    winner,
    phase: winner === null ? 'ROUND_COMPLETE' : 'MATCH_COMPLETE',
    stateVersion: state.stateVersion + 1,
    results: Object.freeze([
      ...state.results,
      Object.freeze({ round: state.round, teams }),
    ]),
  });
}
/** Trusted server lifecycle operation: no client-selected deck or score. */
export function nextSpadesRound(
  state: SpadesMatch,
  expectedVersion: number,
  deck: readonly FaceId[],
): SpadesMatch {
  if (
    expectedVersion !== state.stateVersion ||
    !Number.isSafeInteger(expectedVersion)
  )
    throw new Error('STALE_VERSION');
  if (state.phase !== 'ROUND_COMPLETE') throw new Error('ROUND_NOT_COMPLETE');
  return Object.freeze({
    ...state,
    round: state.round + 1,
    stateVersion: state.stateVersion + 1,
    deal: createSpadesDeal(
      state.deal.players,
      nextSeat(state.deal.dealer),
      deck,
    ),
    phase: 'BIDDING',
    bids: Object.freeze([null, null, null, null]),
    toBid: nextSeat(nextSeat(state.deal.dealer)),
  });
}
