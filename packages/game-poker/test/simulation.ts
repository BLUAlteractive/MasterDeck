/** Test/development fixtures only: this PRNG is deliberately NOT a runtime shuffle source. */
import { shuffleFaces } from '@deckforge/game-core';
import {
  allocatePokerPots,
  createPokerHand,
  legalPokerActions,
  reducePokerHand,
  replayPokerHand,
  type PokerCommand,
} from '../src/index';
export function simulatePokerHand(seed: number) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new Error('INVALID_FIXTURE_SEED');
  let value = seed ^ 0x9e3779b9;
  const draw = (upper: number) => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    value >>>= 0;
    return value % upper;
  };
  const count = 2 + draw(5),
    bigBlind = 2 + draw(19);
  const config = {
    players: Array.from({ length: count }, (_, i) => ({
      id: 'seat-' + i,
      stack: 1 + draw(400),
    })),
    dealer: draw(count),
    smallBlind: Math.max(1, Math.floor(bigBlind / 2)),
    bigBlind,
  };
  const deck = shuffleFaces(draw);
  let state = createPokerHand(config, deck);
  const commands: PokerCommand[] = [];
  const actions = new Set<string>();
  const streets = new Set<string>([state.street]);
  while (state.toAct !== null) {
    if (commands.length >= 2000)
      throw new Error('FIXTURE_ACTION_BOUND seed=' + seed);
    const player = state.players[state.toAct]!,
      legal = legalPokerActions(state, player.id)!;
    const choices: PokerCommand['action'][] = [
      legal.canCheck ? 'CHECK' : 'CALL',
    ];
    if (legal.call > 0) choices.push('FOLD');
    if (legal.canAllIn) choices.push('ALL_IN');
    if (legal.canRaise && legal.minRaiseTo <= legal.maxTo)
      choices.push('BET_TO');
    // Every fourth fixture is a full check/call script, ensuring street coverage.
    const action =
      seed % 4 === 0 ? choices[0]! : choices[draw(choices.length)]!;
    const command: PokerCommand = {
      playerId: player.id,
      expectedVersion: state.stateVersion,
      action,
      ...(action === 'BET_TO' ? { target: legal.minRaiseTo } : {}),
    };
    commands.push(command);
    actions.add(action);
    state = reducePokerHand(state, command);
    streets.add(state.street);
    if (
      state.players.some(
        (p) =>
          p.stack < 0 ||
          p.committed < 0 ||
          p.stack + p.committed !== p.startingStack,
      )
    )
      throw new Error('FIXTURE_CHIP_INVARIANT seed=' + seed);
  }
  const replay = replayPokerHand(config, deck, commands);
  if (JSON.stringify(replay) !== JSON.stringify(state))
    throw new Error('FIXTURE_REPLAY seed=' + seed);
  const allocation = allocatePokerPots(state);
  if (
    allocation.players.reduce((n, p) => n + p.finalStack, 0) !==
    config.players.reduce((n, p) => n + p.stack, 0)
  )
    throw new Error('FIXTURE_ALLOCATION seed=' + seed);
  return {
    seed,
    config,
    deck,
    commands,
    state,
    allocation,
    actions: [...actions].sort(),
    streets: [...streets].sort(),
  };
}
export function runPokerHarness(count = 1000, startSeed = 1) {
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 10000 ||
    !Number.isSafeInteger(startSeed) ||
    startSeed < 0 ||
    startSeed + count > 0x100000000
  )
    throw new Error('INVALID_FIXTURE_RANGE');
  const summary = {
    hands: 0,
    commands: 0,
    folds: 0,
    showdowns: 0,
    sidePots: 0,
    actions: [] as string[],
    streets: [] as string[],
    seatCounts: [] as number[],
  };
  const actions = new Set<string>(),
    streets = new Set<string>(),
    seats = new Set<number>();
  for (let seed = startSeed; seed < startSeed + count; seed++) {
    const run = simulatePokerHand(seed);
    summary.hands++;
    summary.commands += run.commands.length;
    if (run.state.completionReason === 'FOLD') summary.folds++;
    else summary.showdowns++;
    if (run.allocation.pots.length > 1) summary.sidePots++;
    run.actions.forEach((a) => actions.add(a));
    run.streets.forEach((s) => streets.add(s));
    seats.add(run.state.players.length);
  }
  summary.actions = [...actions].sort();
  summary.streets = [...streets].sort();
  summary.seatCounts = [...seats].sort();
  return summary;
}
