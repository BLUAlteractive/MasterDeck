import {
  getFace,
  shuffleFaces,
  validateDeck,
  type FaceId,
} from '@deckforge/game-core';

export type Seat = 0 | 1 | 2 | 3;
export const SPADES_TRICKS_V1 = 'SPADES_TRICKS_V1' as const;
export type Play = Readonly<{ seat: Seat; face: FaceId }>;
export type Trick = Readonly<{ plays: readonly Play[]; winner: Seat }>;
/** Private server/domain state. Never serialize opponents' hands to clients. */
export type SpadesDeal = Readonly<{
  rulesetVersion: typeof SPADES_TRICKS_V1;
  players: readonly string[];
  dealer: Seat;
  hands: readonly (readonly FaceId[])[];
  toAct: Seat;
  currentTrick: readonly Play[];
  tricks: readonly Trick[];
  tricksWon: readonly number[];
  spadesBroken: boolean;
  stateVersion: number;
  finished: boolean;
}>;
export type SpadesPlayCommand = Readonly<{
  playerId: string;
  expectedVersion: number;
  face: FaceId;
}>;
export function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat;
}
export function teamOf(seat: Seat): 0 | 1 {
  return (seat % 2) as 0 | 1;
}
function validSeat(seat: number): asserts seat is Seat {
  if (!Number.isInteger(seat) || seat < 0 || seat > 3)
    throw new Error('INVALID_SEAT');
}
function freezeDeal(state: SpadesDeal): SpadesDeal {
  return Object.freeze({
    ...state,
    players: Object.freeze([...state.players]),
    hands: Object.freeze(state.hands.map((hand) => Object.freeze([...hand]))),
    currentTrick: Object.freeze(
      state.currentTrick.map((play) => Object.freeze({ ...play })),
    ),
    tricks: Object.freeze(
      state.tricks.map((trick) =>
        Object.freeze({
          ...trick,
          plays: Object.freeze(
            trick.plays.map((play) => Object.freeze({ ...play })),
          ),
        }),
      ),
    ),
    tricksWon: Object.freeze([...state.tricksWon]),
  });
}
export function createSpadesDeal(
  players: readonly string[],
  dealer: Seat,
  deckInput: readonly FaceId[],
): SpadesDeal {
  validSeat(dealer);
  if (
    players.length !== 4 ||
    new Set(players).size !== 4 ||
    players.some(
      (player) =>
        typeof player !== 'string' || !player.trim() || player.length > 128,
    )
  )
    throw new Error('INVALID_PLAYERS');
  const deck = validateDeck(deckInput);
  const hands: FaceId[][] = [[], [], [], []];
  deck.forEach((face, index) => hands[(dealer + 1 + index) % 4]!.push(face));
  return freezeDeal({
    rulesetVersion: SPADES_TRICKS_V1,
    players,
    dealer,
    hands,
    toAct: nextSeat(dealer),
    currentTrick: [],
    tricks: [],
    tricksWon: [0, 0, 0, 0],
    spadesBroken: false,
    stateVersion: 0,
    finished: false,
  });
}
/** RNG is injected by a trusted server; this package performs no IO. */
export function startSpadesDeal(
  players: readonly string[],
  dealer: Seat,
  nextInt: (upper: number) => number,
): SpadesDeal {
  return createSpadesDeal(players, dealer, shuffleFaces(nextInt));
}
export function winningSeat(plays: readonly Play[]): Seat {
  if (
    plays.length !== 4 ||
    new Set(plays.map((play) => play.seat)).size !== 4 ||
    new Set(plays.map((play) => play.face)).size !== 4
  )
    throw new Error('INVALID_TRICK');
  plays.forEach((play) => validSeat(play.seat));
  const led = getFace(plays[0]!.face).suit;
  let winner = plays[0]!;
  for (const play of plays.slice(1)) {
    const candidate = getFace(play.face),
      best = getFace(winner.face);
    if (
      (candidate.suit === 'SPADES' && best.suit !== 'SPADES') ||
      (candidate.suit === best.suit && candidate.rank > best.rank) ||
      (best.suit !== 'SPADES' && best.suit !== led && candidate.suit === led)
    )
      winner = play;
  }
  return winner.seat;
}
export function legalSpadesPlays(state: SpadesDeal): readonly FaceId[] {
  if (state.finished) return Object.freeze([]);
  const hand = state.hands[state.toAct]!;
  const led = state.currentTrick[0];
  if (led) {
    const following = hand.filter(
      (face) => getFace(face).suit === getFace(led.face).suit,
    );
    return Object.freeze(following.length ? following : [...hand]);
  }
  const nonSpades = hand.filter((face) => getFace(face).suit !== 'SPADES');
  return Object.freeze(
    !state.spadesBroken && nonSpades.length ? nonSpades : [...hand],
  );
}
export function playSpades(
  state: SpadesDeal,
  command: SpadesPlayCommand,
): SpadesDeal {
  if (state.rulesetVersion !== SPADES_TRICKS_V1)
    throw new Error('INVALID_RULESET');
  if (
    !Number.isSafeInteger(command.expectedVersion) ||
    command.expectedVersion !== state.stateVersion
  )
    throw new Error('STALE_VERSION');
  if (state.finished) throw new Error('DEAL_COMPLETE');
  if (command.playerId !== state.players[state.toAct])
    throw new Error('NOT_YOUR_TURN');
  if (!legalSpadesPlays(state).includes(command.face))
    throw new Error('ILLEGAL_CARD');
  const seat = state.toAct;
  const hands = state.hands.map((hand, index) =>
    index === seat ? hand.filter((face) => face !== command.face) : hand,
  );
  let currentTrick: readonly Play[] = [
    ...state.currentTrick,
    { seat, face: command.face },
  ];
  let tricks = state.tricks;
  const tricksWon = [...state.tricksWon];
  let toAct = nextSeat(seat);
  if (currentTrick.length === 4) {
    toAct = winningSeat(currentTrick);
    tricks = [...tricks, { plays: currentTrick, winner: toAct }];
    tricksWon[toAct] = tricksWon[toAct]! + 1;
    currentTrick = [];
  }
  return freezeDeal({
    ...state,
    hands,
    toAct,
    currentTrick,
    tricks,
    tricksWon,
    spadesBroken: state.spadesBroken || getFace(command.face).suit === 'SPADES',
    stateVersion: state.stateVersion + 1,
    finished: tricks.length === 13,
  });
}
