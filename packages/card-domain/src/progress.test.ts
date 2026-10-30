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
import { progressWindow } from './progress';
const interval = {
  startsAt: '2026-01-01T00:00:00.000Z',
  endsAt: '2027-01-01T00:00:00.000Z',
};
it('uses UTC day and Monday week boundaries including offset/DST dates', () => {
  expect(
    progressWindow(
      { window: 'DAILY', ...interval },
      new Date('2026-03-08T23:30:00-07:00'),
    ),
  ).toBe('daily:2026-03-09');
  expect(
    progressWindow(
      { window: 'WEEKLY', ...interval },
      new Date('2026-03-08T23:30:00Z'),
    ),
  ).toBe('weekly:2026-03-02');
  expect(
    progressWindow(
      { window: 'WEEKLY', ...interval },
      new Date('2026-03-09T00:00:00Z'),
    ),
  ).toBe('weekly:2026-03-09');
});
it('has inclusive season start and exclusive end, independent of worker time', () => {
  const goal = { window: 'SEASON' as const, ...interval };
  expect(progressWindow(goal, new Date(interval.startsAt))).toBe(
    'season:' + Date.parse(interval.startsAt),
  );
  expect(progressWindow(goal, new Date(interval.endsAt))).toBeNull();
  expect(progressWindow(goal, new Date('2025-12-31T23:59:59Z'))).toBeNull();
});
it('requires explicit timed publication intervals and valid event times', () => {
  expect(() => progressWindow({ window: 'DAILY' }, new Date())).toThrow();
  expect(() =>
    progressWindow(
      { window: 'DAILY', startsAt: interval.endsAt, endsAt: interval.startsAt },
      new Date(),
    ),
  ).toThrow();
  expect(() => progressWindow({ window: 'LIFETIME' }, new Date(NaN))).toThrow();
});
