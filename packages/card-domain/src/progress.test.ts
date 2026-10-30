import { it, expect } from 'vitest';
import { advanceProgress } from './progress';
it('awards a ten-outcome milestone exactly once across 1000 replay attempts', () => {
  const seen = new Set<number>();
  let count = 0,
    awards = 0;
  for (let i = 0; i < 1000; i++) {
    const key = (i * 7) % 13;
    const next = advanceProgress(count, 10, seen.has(key));
    seen.add(key);
    count = next.count;
    if (next.award) awards++;
  }
  expect(count).toBe(10);
  expect(awards).toBe(1);
});
it('rejects invalid counters and targets', () => {
  for (const [count, target] of [
    [-1, 10],
    [11, 10],
    [0, 0],
    [0, 1.5],
    [NaN, 10],
  ])
    expect(() => advanceProgress(count!, target!, false)).toThrow();
  expect(advanceProgress(9, 10, true)).toEqual({ count: 9, award: false });
});
