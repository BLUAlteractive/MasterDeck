import { it, expect } from 'vitest';
import { packDraws } from './rng';
import { sealBilling, openBilling } from '../billing/vault';
it('replays the same seeded/versioned draw sequence after authenticated seed storage and rejects wrong key/context', () => {
  const key = Buffer.alloc(32, 1),
    seed = Buffer.alloc(32, 2),
    box = sealBilling(
      { seed: seed.toString('hex') },
      key,
      'deckforge.pack.v1:test',
    );
  expect(box).not.toContain(seed.toString('hex'));
  const restored = openBilling(box, key, 'deckforge.pack.v1:test') as {
    seed: string;
  };
  const draws = packDraws(seed, 1234567, 10);
  expect(packDraws(Buffer.from(restored.seed, 'hex'), 1234567, 10)).toEqual(
    draws,
  );
  expect(draws.every((n) => n >= 0 && n < 1234567)).toBe(true);
  expect(packDraws(Buffer.alloc(32, 3), 1234567, 10)).not.toEqual(draws);
  expect(() => openBilling(box, key, 'wrong-context')).toThrow();
  expect(() =>
    openBilling(box, Buffer.alloc(32, 4), 'deckforge.pack.v1:test'),
  ).toThrow();
});
