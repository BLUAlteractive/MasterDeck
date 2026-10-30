import { beforeAll, afterAll, it, expect } from 'vitest';
import type { ProgressionPolicy } from '@deckforge/contracts';
import { identityFixture } from '../test/auth-fixture';
import { fullHouseFixture } from '../test/progress-fixture';
import { ProgressionService } from './progression';
const eligibility = {
  requirePermanent: false,
  minimumOpponents: 1,
  minimumPlayerCommands: 1,
};
const base: ProgressionPolicy = {
  ...eligibility,
  version: 'MISSION_FACT_FIXTURE',
  approvalReference: 'FIXTURE_ONLY',
  goals: [],
};
const publication = {
  startsAt: '2020-01-01T00:00:00.000Z',
  endsAt: '2040-01-01T00:00:00.000Z',
};
const policy: ProgressionPolicy = {
  ...base,
  version: 'MISSION_WINDOWS_FIXTURE',
  goals: [
    {
      id: 'DAILY_PLAY',
      kind: 'POKER_COMPLETED',
      target: 1,
      badge: 'Daily play',
      window: 'DAILY',
      ...publication,
    },
    {
      id: 'WEEKLY_PLAY',
      kind: 'POKER_COMPLETED',
      target: 2,
      badge: 'Weekly play',
      window: 'WEEKLY',
      ...publication,
    },
    {
      id: 'SEASON_PLAY',
      kind: 'POKER_COMPLETED',
      target: 2,
      badge: 'Season play',
      window: 'SEASON',
      ...publication,
    },
  ],
};
let f: Awaited<ReturnType<typeof identityFixture>>;
beforeAll(async () => {
  f = await identityFixture();
});
afterAll(async () => {
  await f?.close();
});
it('recovers timed goals from persisted server events after restart and duplicate workers without reissuing rewards', async () => {
  const a = await f.actor(),
    b = await f.actor(),
    ingest = new ProgressionService(f.db, base);
  for (let i = 0; i < 2; i++)
    await ingest.ingest(
      'POKER',
      await fullHouseFixture(f.db, [a.userId, b.userId]),
    );
  const one = new ProgressionService(f.db, policy),
    two = new ProgressionService(f.secondDb, policy);
  await Promise.all(
    Array.from({ length: 10 }, (_, i) => (i % 2 ? one : two).recoverGoals()),
  );
  await new ProgressionService(f.secondDb, policy).recoverGoals();
  const awards = await f.db.progressAward.findMany({
    where: { userId: a.userId, goalId: { startsWith: policy.version + ':' } },
  });
  expect(awards).toHaveLength(3);
  const missions = await one.missions(a.principal);
  expect(missions.missions.every((m) => m.completed)).toBe(true);
  expect(missions.missions.map((m) => m.progress)).toEqual([1, 2, 2]);
  expect((await one.view(a.principal)).awards).toHaveLength(3);
  expect(
    (await one.missions((await f.actor()).principal)).missions.every(
      (m) => m.progress === 0 && !m.completed,
    ),
  ).toBe(true);
});
it('credits delayed facts to their original day, not worker arrival, and rejects wrong-window SQL', async () => {
  const a = await f.actor(),
    b = await f.actor(),
    when = new Date('2026-01-05T23:59:59.000Z');
  await new ProgressionService(f.db, base).ingest(
    'POKER',
    await fullHouseFixture(f.db, [a.userId, b.userId], when),
  );
  const service = new ProgressionService(f.db, policy);
  await service.recoverGoals();
  const counter = await f.db.progressCounter.findFirstOrThrow({
    where: { userId: a.userId, goalId: policy.version + ':DAILY_PLAY' },
  });
  expect(counter.windowKey).toBe('daily:2026-01-05');
  const event = await f.db.progressEvent.findFirstOrThrow({
    where: { userId: a.userId, kind: 'POKER_COMPLETED' },
  });
  await expect(
    f.db.progressConsumption.create({
      data: {
        eventId: event.id,
        goalId: counter.goalId,
        windowKey: 'daily:2026-01-06',
      },
    }),
  ).rejects.toThrow();
  expect(
    (await service.missions(a.principal)).missions.find(
      (m) => m.definition.id === 'DAILY_PLAY',
    )?.progress,
  ).toBe(0);
});
it('does not backfill outside published intervals or from a weaker eligibility policy', async () => {
  const a = await f.actor(),
    b = await f.actor();
  await new ProgressionService(f.db, base).ingest(
    'POKER',
    await fullHouseFixture(f.db, [a.userId, b.userId]),
  );
  const strict: ProgressionPolicy = {
    ...policy,
    version: 'STRICT_MISSIONS_FIXTURE',
    requirePermanent: true,
  };
  await new ProgressionService(f.db, strict).recoverGoals();
  expect(
    await f.db.progressAward.count({
      where: { userId: a.userId, goalId: { startsWith: strict.version + ':' } },
    }),
  ).toBe(0);
  const future: ProgressionPolicy = {
    ...policy,
    version: 'FUTURE_MISSIONS_FIXTURE',
    goals: policy.goals.map((g) => ({
      ...g,
      startsAt: '2035-01-01T00:00:00.000Z',
    })),
  };
  await new ProgressionService(f.db, future).recoverGoals();
  expect(
    await f.db.progressCounter.count({
      where: { userId: a.userId, goalId: { startsWith: future.version + ':' } },
    }),
  ).toBe(0);
  expect((await f.request('progression/missions')).status).toBe(401);
});
