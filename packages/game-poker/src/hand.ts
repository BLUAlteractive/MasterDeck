import { shuffleFaces, validateDeck, type FaceId } from '@deckforge/game-core';

export const CLASSIC_RULESET = 'CLASSIC_NLHE_V1' as const;
export const MAX_TABLE_CHIPS = 1_000_000_000;
export type PokerConfig = Readonly<{
  players: readonly Readonly<{ id: string; stack: number }>[];
  dealer: number;
  smallBlind: number;
  bigBlind: number;
}>;
export type PokerPlayer = Readonly<{
  id: string;
  startingStack: number;
  stack: number;
  committed: number;
  streetBet: number;
  folded: boolean;
  acted: boolean;
  actedAt: number | null;
  hole: readonly FaceId[];
}>;
export type PokerStreet = 'PREFLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'COMPLETE';
/** Entirely private. Never send this state or replay log to a client. */
export type PokerHand = Readonly<{
  rulesetVersion: typeof CLASSIC_RULESET;
  stateVersion: number;
  players: readonly PokerPlayer[];
  dealer: number;
  smallBlind: number;
  bigBlind: number;
  street: PokerStreet;
  board: readonly FaceId[];
  burned: readonly FaceId[];
  deck: readonly FaceId[];
  cursor: number;
  currentBet: number;
  lastFullRaise: number;
  toAct: number | null;
  completionReason: 'FOLD' | 'SHOWDOWN' | null;
}>;
export type PokerAction = 'FOLD' | 'CHECK' | 'CALL' | 'BET_TO' | 'ALL_IN';
export type PokerCommand = Readonly<{
  playerId: string;
  expectedVersion: number;
  action: PokerAction;
  target?: number;
}>;
type MutablePlayer = { -readonly [K in keyof PokerPlayer]: PokerPlayer[K] };
type MutableHand = {
  -readonly [
    K in keyof Omit<PokerHand, 'players' | 'board' | 'burned'>
  ]: PokerHand[K];
} & {
  players: MutablePlayer[];
  board: FaceId[];
  burned: FaceId[];
};
export class InvalidPokerCommand extends Error {
  constructor(
    readonly code:
      'INVALID_CONFIG' | 'INVALID_COMMAND' | 'STALE_VERSION' | 'ILLEGAL_ACTION',
  ) {
    super(code);
  }
}
function fail(code: InvalidPokerCommand['code']): never {
  throw new InvalidPokerCommand(code);
}
function integer(n: number, min = 0) {
  return Number.isSafeInteger(n) && n >= min && n <= MAX_TABLE_CHIPS;
}
function freeze(s: MutableHand): PokerHand {
  s.players.forEach((p) => {
    Object.freeze(p.hole);
    Object.freeze(p);
  });
  Object.freeze(s.players);
  Object.freeze(s.board);
  Object.freeze(s.burned);
  return Object.freeze(s);
}
function next(
  s: MutableHand,
  after: number,
  predicate: (p: MutablePlayer) => boolean,
): number | null {
  for (let offset = 1; offset <= s.players.length; offset++) {
    const i = (after + offset) % s.players.length;
    if (predicate(s.players[i]!)) return i;
  }
  return null;
}
function pay(p: MutablePlayer, amount: number) {
  p.stack -= amount;
  p.committed += amount;
  p.streetBet += amount;
}
function active(p: PokerPlayer) {
  return !p.folded && p.stack > 0;
}
function callPrice(s: PokerHand, p: PokerPlayer) {
  // No dry side-pot: a lone player with chips only matches real opposing wagers.
  return s.players.filter(active).length > 1
    ? s.currentBet
    : Math.max(
        0,
        ...s.players.filter((q) => q.id !== p.id).map((q) => q.streetBet),
      );
}
export function legalPokerActions(s: PokerHand, playerId: string) {
  const p = s.toAct === null ? undefined : s.players[s.toAct];
  if (!p || p.id !== playerId || !active(p) || s.street === 'COMPLETE')
    return null;
  const call = Math.min(p.stack, Math.max(0, callPrice(s, p) - p.streetBet));
  const maxTo = p.streetBet + p.stack;
  const canRaise =
    s.players.filter(active).length > 1 &&
    (p.actedAt === null || s.currentBet - p.actedAt >= s.lastFullRaise) &&
    maxTo > s.currentBet;
  return Object.freeze({
    call,
    canCheck: call === 0,
    canRaise,
    minRaiseTo: s.currentBet + s.lastFullRaise,
    maxTo,
    canAllIn: maxTo <= callPrice(s, p) || canRaise,
  });
}
function advance(s: MutableHand, after: number) {
  for (;;) {
    const live = s.players.filter((p) => !p.folded);
    if (live.length === 1) {
      s.street = 'COMPLETE';
      s.completionReason = 'FOLD';
      s.toAct = null;
      return;
    }
    const actors = s.players.filter(active);
    const pending = (p: MutablePlayer) =>
      active(p) &&
      (actors.length > 1
        ? !p.acted || p.streetBet < callPrice(s, p)
        : p.streetBet < callPrice(s, p));
    const actor = next(s, after, pending);
    if (actor !== null) {
      s.toAct = actor;
      return;
    }
    if (s.street === 'RIVER') {
      s.street = 'COMPLETE';
      s.completionReason = 'SHOWDOWN';
      s.toAct = null;
      return;
    }
    s.burned.push(s.deck[s.cursor++]!);
    const count = s.street === 'PREFLOP' ? 3 : 1;
    for (let i = 0; i < count; i++) s.board.push(s.deck[s.cursor++]!);
    s.street =
      s.street === 'PREFLOP' ? 'FLOP' : s.street === 'FLOP' ? 'TURN' : 'RIVER';
    s.currentBet = 0;
    s.lastFullRaise = s.bigBlind;
    s.players.forEach((p) => {
      p.streetBet = 0;
      p.acted = false;
      p.actedAt = null;
    });
    after = s.dealer;
  }
}
export function createPokerHand(
  config: PokerConfig,
  inputDeck: readonly FaceId[],
): PokerHand {
  const { players, dealer, smallBlind, bigBlind } = config;
  if (
    players.length < 2 ||
    players.length > 6 ||
    !Number.isInteger(dealer) ||
    dealer < 0 ||
    dealer >= players.length ||
    !integer(smallBlind, 1) ||
    !integer(bigBlind, smallBlind) ||
    Array.from(players).some(
      (p) =>
        !p ||
        typeof p.id !== 'string' ||
        !p.id.length ||
        p.id.length > 128 ||
        !integer(p.stack, 1),
    ) ||
    new Set(players.map((p) => p.id)).size !== players.length ||
    players.reduce((a, p) => a + p.stack, 0) > MAX_TABLE_CHIPS
  )
    fail('INVALID_CONFIG');
  const deck = validateDeck(inputDeck);
  const seats = players.map((p) => ({
    id: p.id,
    startingStack: p.stack,
    stack: p.stack,
    committed: 0,
    streetBet: 0,
    folded: false,
    acted: false,
    actedAt: null as number | null,
    hole: [] as FaceId[],
  }));
  let cursor = 0;
  for (let round = 0; round < 2; round++)
    for (let offset = 1; offset <= seats.length; offset++)
      seats[(dealer + offset) % seats.length]!.hole.push(deck[cursor++]!);
  const sb = seats.length === 2 ? dealer : (dealer + 1) % seats.length;
  const bb = (sb + 1) % seats.length;
  pay(seats[sb]!, Math.min(smallBlind, seats[sb]!.stack));
  pay(seats[bb]!, Math.min(bigBlind, seats[bb]!.stack));
  const s: MutableHand = {
    rulesetVersion: CLASSIC_RULESET,
    stateVersion: 0,
    players: seats,
    dealer,
    smallBlind,
    bigBlind,
    street: 'PREFLOP',
    board: [],
    burned: [],
    deck,
    cursor,
    currentBet: bigBlind,
    lastFullRaise: bigBlind,
    toAct: null,
    completionReason: null,
  };
  advance(s, bb);
  return freeze(s);
}
export function startPokerHand(
  config: PokerConfig,
  nextInt: (upper: number) => number,
) {
  return createPokerHand(config, shuffleFaces(nextInt));
}
export function reducePokerHand(
  state: PokerHand,
  command: PokerCommand,
): PokerHand {
  if (
    !command ||
    typeof command !== 'object' ||
    Object.keys(command).some(
      (k) => !['playerId', 'expectedVersion', 'action', 'target'].includes(k),
    ) ||
    !Number.isSafeInteger(command.expectedVersion) ||
    command.expectedVersion < 0 ||
    !['FOLD', 'CHECK', 'CALL', 'BET_TO', 'ALL_IN'].includes(command.action) ||
    (command.action === 'BET_TO'
      ? !integer(command.target!, 1)
      : command.target !== undefined)
  )
    fail('INVALID_COMMAND');
  if (command.expectedVersion !== state.stateVersion) fail('STALE_VERSION');
  const legal = legalPokerActions(state, command.playerId);
  if (!legal) fail('ILLEGAL_ACTION');
  const s: MutableHand = {
    ...state,
    players: state.players.map((p) => ({ ...p })),
    board: [...state.board],
    burned: [...state.burned],
  };
  const actor = s.toAct!;
  const p = s.players[actor]!;
  if (command.action === 'FOLD') p.folded = true;
  else if (command.action === 'CHECK') {
    if (!legal.canCheck) fail('ILLEGAL_ACTION');
  } else if (command.action === 'CALL') {
    if (!legal.call) fail('ILLEGAL_ACTION');
    pay(p, legal.call);
  } else {
    const target = command.action === 'ALL_IN' ? legal.maxTo : command.target!;
    if (command.action === 'ALL_IN' && !legal.canAllIn) fail('ILLEGAL_ACTION');
    if (target <= s.currentBet) {
      if (command.action !== 'ALL_IN' || target > callPrice(s, p))
        fail('ILLEGAL_ACTION');
    } else {
      if (
        !legal.canRaise ||
        target > legal.maxTo ||
        (target < legal.minRaiseTo && target !== legal.maxTo)
      )
        fail('ILLEGAL_ACTION');
      const raise = target - s.currentBet;
      if (raise >= s.lastFullRaise) s.lastFullRaise = raise;
      s.currentBet = target;
    }
    pay(p, target - p.streetBet);
  }
  p.acted = true;
  p.actedAt = s.currentBet;
  s.stateVersion++;
  advance(s, actor);
  return freeze(s);
}
/** Private deterministic replay; callers must retain the initial deck, never disclose it. */
export function replayPokerHand(
  config: PokerConfig,
  deck: readonly FaceId[],
  commands: readonly PokerCommand[],
) {
  return commands.reduce(reducePokerHand, createPokerHand(config, deck));
}
