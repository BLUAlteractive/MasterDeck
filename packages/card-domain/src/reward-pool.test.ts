import { it, expect } from 'vitest';
import { rewardPoolIndex, rewardPoolTotal } from './reward-pool';
it('maps every integer in a finite pool to the disclosed exact weights', () => {
  const pool = [{ weight: 5 }, { weight: 15 }, { weight: 980 }],
    counts = [0, 0, 0];
  for (let draw = 0; draw < 1000; draw++)
    counts[rewardPoolIndex(pool, draw)]!++;
  expect(counts).toEqual([5, 15, 980]);
  expect(rewardPoolTotal(pool)).toBe(1000);
  for (const draw of [-1, 1000, 0.5, NaN])
    expect(() => rewardPoolIndex(pool, draw)).toThrow();
});
it('rejects empty, noninteger and overflowing pools', () => {
  for (const pool of [
    [],
    [{ weight: 0 }],
    [{ weight: Infinity }],
    [{ weight: 0.5 }],
    [{ weight: 100000001 }],
  ])
    expect(() => rewardPoolTotal(pool)).toThrow();
});
