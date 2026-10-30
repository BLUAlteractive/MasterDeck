import { it, expect } from 'vitest';
import {
  tournamentSeeds,
  tournamentBracket,
  tournamentWinner,
} from './tournament';
it('builds balanced complete trees with each seed exactly once for every supported size', () => {
  for (const size of [2, 4, 8, 16, 32]) {
    const seeds = tournamentSeeds(size),
      matches = tournamentBracket(size);
    expect([...seeds].sort((a, b) => a - b)).toEqual(
      Array.from({ length: size }, (_, i) => i + 1),
    );
    expect(matches).toHaveLength(size - 1);
    for (let i = 0; i < size; i += 2)
      expect(seeds[i]! + seeds[i + 1]!).toBe(size + 1);
    expect(matches.filter((m) => m.round === Math.log2(size) - 1)).toHaveLength(
      1,
    );
    expect(tournamentBracket(size)).toEqual(matches);
  }
  expect(() => tournamentSeeds(3)).toThrow();
});
it('uses final stacks with explicit rematches for ties and rejects malformed results', () => {
  expect(
    tournamentWinner([
      { id: 'a', finalStack: 10 },
      { id: 'b', finalStack: 4 },
    ]),
  ).toBe('a');
  expect(
    tournamentWinner([
      { id: 'a', finalStack: 4 },
      { id: 'b', finalStack: 4 },
    ]),
  ).toBeNull();
  expect(() =>
    tournamentWinner([
      { id: 'a', finalStack: -1 },
      { id: 'b', finalStack: 4 },
    ]),
  ).toThrow();
  expect(() =>
    tournamentWinner([
      { id: 'a', finalStack: 1 },
      { id: 'a', finalStack: 4 },
    ]),
  ).toThrow();
});
