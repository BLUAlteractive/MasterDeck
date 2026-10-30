import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { ProgressionPolicy } from '@deckforge/contracts';
import { identityFixture } from '../test/auth-fixture';
import { fullHouseFixture } from '../test/progress-fixture';
import { ProgressionService } from './progression';
const policy: ProgressionPolicy = {
  version: 'ACHIEVEMENTS_TEST_ONLY',
  approvalReference: 'FIXTURE_NOT_APPROVAL',
  requirePermanent: false,
  minimumOpponents: 1,
  minimumPlayerCommands: 1,
  goals: [
    {
      id: 'FULL_HOUSE_10',
      kind: 'POKER_FULL_HOUSE',
      target: 10,
      badge: 'Ten full houses',
      window: 'LIFETIME',
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
it('cannot farm ten full houses by replaying one immutable result; ten distinct results grant once across restart', async () => {
  const a = await f.actor(),
    b = await f.actor(),
    one = new ProgressionService(f.db, policy),
    two = new ProgressionService(f.secondDb, policy),
    ids = [a.userId, b.userId];
  const first = await fullHouseFixture(f.db, ids);
  await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      (i % 2 ? one : two).ingest('POKER', first),
    ),
  );
  const goalId = policy.version + ':FULL_HOUSE_10';
  expect(
    (
      await f.db.progressCounter.findUniqueOrThrow({
        where: {
          userId_goalId_windowKey: {
            userId: a.userId,
            goalId,
            windowKey: 'lifetime',
          },
        },
      })
    ).count,
  ).toBe(1);
  expect(await f.db.progressAward.count({ where: { userId: a.userId } })).toBe(
    0,
  );
  for (let i = 1; i < 10; i++)
    await two.ingest('POKER', await fullHouseFixture(f.db, ids));
  await new ProgressionService(f.secondDb, policy).ingest('POKER', first);
  expect(
    await f.db.progressAward.count({ where: { userId: a.userId, goalId } }),
  ).toBe(1);
  expect(
    await f.db.progressConsumption.count({
      where: { goalId, event: { userId: a.userId } },
    }),
  ).toBe(10);
  const view = await one.view(a.principal);
  expect(view.goals[0]?.count).toBe(10);
  expect(view.awards).toHaveLength(1);
  expect(JSON.stringify(view)).not.toContain('K-H');
  expect((await one.view(b.principal)).awards).toHaveLength(0);
  const award = await f.db.progressAward.findFirstOrThrow({
    where: { userId: a.userId },
  });
  await expect(
    f.db.progressAward.delete({ where: { id: award.id } }),
  ).rejects.toThrow();
  await expect(
    f.db.progressCounter.update({
      where: {
        userId_goalId_windowKey: {
          userId: a.userId,
          goalId,
          windowKey: 'lifetime',
        },
      },
      data: { count: 0 },
    }),
  ).rejects.toThrow();
}, 30000);
it('requires trusted existing results and rejects client event submissions and policy retuning', async () => {
  const a = await f.actor(),
    b = await f.actor();
  await expect(
    new ProgressionService(f.db, policy).ingest('POKER', randomUUID()),
  ).rejects.toMatchObject({ code: 'RESULT_NOT_READY' });
  expect(
    (
      await f.request('progression', a.bearer, {
        kind: 'POKER_FULL_HOUSE',
        amount: 10,
      })
    ).status,
  ).toBe(404);
  const id = await fullHouseFixture(f.db, [a.userId, b.userId]);
  await expect(
    new ProgressionService(f.db, {
      ...policy,
      minimumPlayerCommands: 0,
    }).ingest('POKER', id),
  ).rejects.toMatchObject({ code: 'PROGRESSION_POLICY_CHANGED' });
  expect(
    await f.db.progressSource.findUnique({
      where: { kind_sourceId: { kind: 'POKER', sourceId: id } },
    }),
  ).toBeNull();
  await expect(
    new ProgressionService(f.db).ingest('POKER', id),
  ).rejects.toMatchObject({ code: 'PROGRESSION_POLICY_NOT_CONFIGURED' });
});
it('records ineligible guest sources without granting a badge', async () => {
  const a = await f.actor(),
    b = await f.actor(),
    id = await fullHouseFixture(f.db, [a.userId, b.userId]);
  await new ProgressionService(f.db, {
    ...policy,
    version: 'PERMANENT_ONLY_TEST',
    requirePermanent: true,
  }).ingest('POKER', id);
  expect(
    await f.db.progressEvent.count({ where: { sourceKey: 'POKER:' + id } }),
  ).toBe(0);
});
