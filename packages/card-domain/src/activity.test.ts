import { it, expect } from 'vitest';
import { activityRejection, activityCreditTarget } from './activity';
const now = Date.parse('2026-10-30T12:00:00Z'),
  p = { maxStepsPerMinute: 300, lookbackHours: 24 };
it('deduplicates 100 repeated overlapping source intervals conservatively without manufacturing prorated steps', () => {
  const accepted: { start: number; end: number }[] = [];
  let steps = 0;
  for (let round = 0; round < 100; round++)
    for (let i = 0; i < 100; i++) {
      const r = {
        start: now - (101 - i) * 60000,
        end: now - (100 - i) * 60000,
        steps: 100,
        manual: false,
        deleted: false,
      };
      if (!activityRejection(r, accepted, p, now, null)) {
        accepted.push(r);
        steps += r.steps;
      }
    }
  expect(steps).toBe(10000);
  expect(
    activityCreditTarget(steps, { stepsPerCredit: 100, dailyCreditCap: 150 }),
  ).toBe(100);
});
it('rejects manual, deleted, stale, future, implausible and privacy-cutoff samples, and caps only credit earning', () => {
  const r = {
    start: now - 60000,
    end: now,
    steps: 100,
    manual: false,
    deleted: false,
  };
  for (const patch of [
    { manual: true },
    { deleted: true },
    { end: now + 1 },
    { steps: 301 },
    { start: now - 25 * 3600000 },
  ])
    expect(
      activityRejection({ ...r, ...patch }, [], p, now, null),
    ).not.toBeNull();
  expect(activityRejection(r, [], p, now, now - 30000)).toBe('PRIVACY_CUTOFF');
  expect(
    activityCreditTarget(20000, { stepsPerCredit: 100, dailyCreditCap: 150 }),
  ).toBe(150);
});
