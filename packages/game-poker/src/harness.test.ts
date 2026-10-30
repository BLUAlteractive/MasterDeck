import { expect, it } from 'vitest';
import { runPokerHarness, simulatePokerHand } from '../test/simulation';
it('finishes and independently replays 1000 deterministic legal hands in CI', () => {
  const summary = runPokerHarness();
  expect(summary.hands).toBe(1000);
  expect(summary.commands).toBeGreaterThan(1000);
  expect(summary.folds).toBeGreaterThan(0);
  expect(summary.showdowns).toBeGreaterThan(0);
  expect(summary.sidePots).toBeGreaterThan(0);
  expect(summary.actions).toEqual([
    'ALL_IN',
    'BET_TO',
    'CALL',
    'CHECK',
    'FOLD',
  ]);
  expect(summary.streets).toEqual([
    'COMPLETE',
    'FLOP',
    'PREFLOP',
    'RIVER',
    'TURN',
  ]);
  expect(summary.seatCounts).toEqual([2, 3, 4, 5, 6]);
}, 30000);
it('reproduces a single failure fixture without time or global random state', () => {
  expect(simulatePokerHand(874)).toEqual(simulatePokerHand(874));
  expect(simulatePokerHand(874).deck).not.toEqual(simulatePokerHand(875).deck);
});
it('bounds fixture requests and rejects invalid seeds', () => {
  for (const seed of [-1, 1.5, NaN, 0x100000000])
    expect(() => simulatePokerHand(seed)).toThrow();
  for (const count of [0, 10001, 1.5])
    expect(() => runPokerHarness(count)).toThrow();
});
