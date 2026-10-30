import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  accessibleReceiptSchema,
  accessibleStartResponseSchema,
  accessibleViewSchema,
  type AccessiblePolicy,
  type ProgressionPolicy,
} from '@deckforge/contracts';
import { identityFixture } from '../test/auth-fixture';
import { fullHouseFixture } from '../test/progress-fixture';
import { ProgressionService } from './progression';
import { AccessibleQuestService } from './accessibility';
import { moveRestrictedCurrency } from './wallets';
import { hash, json } from './rooms/shared';
const eligibility = {
  requirePermanent: false,
  minimumOpponents: 1,
  minimumPlayerCommands: 1,
};
const goal = {
  id: 'NONWALK_PLAY',
  kind: 'POKER_COMPLETED' as const,
  target: 2,
  badge: 'Nonwalking play quest',
  window: 'DAILY' as const,
  startsAt: '2020-01-01T00:00:00.000Z',
  endsAt: '2040-01-01T00:00:00.000Z',
};
const goalId = 'ACCESSIBLE_FIXTURE:' + goal.id;
const policy: AccessiblePolicy = {
  ...eligibility,
  version: 'ACCESSIBLE_TEST_ONLY',
  approvalReference: 'FIXTURE_NOT_APPROVAL',
  maxTrailPerDay: 100,
  goals: [
    {
      goalId,
      equivalencePlanId: 'FIXTURE_SAME_BENEFIT_PLAN',
      trailCredits: 100,
      pressRecipeId: 'FIXTURE_BLUE_BASIC',
    },
  ],
};
const facts: ProgressionPolicy = {
  ...eligibility,
  version: 'ACCESSIBLE_FACT_FIXTURE',
  approvalReference: 'FIXTURE_ONLY',
  goals: [],
};
let f: Awaited<ReturnType<typeof identityFixture>>;
beforeAll(async () => {
  f = await identityFixture(null, null, null, { accessiblePolicy: policy });
  await f.db.progressGoal.create({
    data: { id: goalId, definition: json(goal), policyHash: hash(policy) },
  });
});
afterAll(async () => {
  await f?.close();
});
const key = () => randomUUID();
it('requires opt-in and new verified events; one claim produces earned credits and a distinct nonwalking proof once', async () => {
  const a = await f.actor(),
    b = await f.actor(),
    ingest = new ProgressionService(f.db, facts);
  await ingest.ingest(
    'POKER',
    await fullHouseFixture(f.db, [a.userId, b.userId]),
  );
  const start = await f.request('accessibility/quests/start', a.bearer, {
    goalId,
    commandId: key(),
  });
  expect(start.status).toBe(200);
  const { enrollmentId } = accessibleStartResponseSchema.parse(
    await start.json(),
  );
  const service = new AccessibleQuestService(f.db, policy);
  expect(
    (await service.view(a.principal)).quests[0]?.enrollment?.progress,
  ).toBe(0);
  await expect(
    service.claim(a.principal, { enrollmentId, commandId: key() }),
  ).rejects.toMatchObject({ code: 'QUEST_INCOMPLETE' });
  for (let i = 0; i < 2; i++)
    await ingest.ingest(
      'POKER',
      await fullHouseFixture(f.db, [a.userId, b.userId]),
    );
  expect(
    (await service.view(a.principal)).quests[0]?.enrollment?.progress,
  ).toBe(2);
  const input = { enrollmentId, commandId: key() },
    second = new AccessibleQuestService(f.secondDb, policy);
  const receipts = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      (i % 2 ? service : second).claim(a.principal, input),
    ),
  );
  expect(new Set(receipts.map((r) => r.id)).size).toBe(1);
  const receipt = accessibleReceiptSchema.parse(receipts[0]);
  expect(receipt.pressProof.kind).toBe('ACCESSIBLE_QUEST');
  expect(receipt.pressProof.status).toBe('AWAITING_PRESS_INTEGRATION');
  expect(JSON.stringify(receipt)).not.toContain('steps');
  expect(
    await f.db.accessibleQuestFact.count({ where: { enrollmentId } }),
  ).toBe(2);
  expect(
    await f.db.accessibleQuestCompletion.count({ where: { enrollmentId } }),
  ).toBe(1);
  expect(
    (
      await f.db.restrictedAccount.findUniqueOrThrow({
        where: {
          userId_currency: { userId: a.userId, currency: 'TRAIL_CREDITS' },
        },
      })
    ).balance,
  ).toBe(100n);
  await expect(
    new AccessibleQuestService(f.db).claim(a.principal, {
      ...input,
      commandId: key(),
    }),
  ).resolves.toEqual(receipt);
  await expect(
    second.claim(b.principal, { enrollmentId, commandId: key() }),
  ).rejects.toMatchObject({ code: 'QUEST_UNAVAILABLE' });
  const view = accessibleViewSchema.parse(
    await (await f.request('accessibility/quests', a.bearer)).json(),
  );
  expect(view.quests[0]?.enrollment?.receipt).toEqual(receipt);
  await expect(
    f.db.accessibleQuestCompletion.delete({ where: { id: receipt.id } }),
  ).rejects.toThrow();
}, 30000);
it('enforces shared activity/quest daily cap without consuming facts or manufacturing a proof', async () => {
  const a = await f.actor(),
    b = await f.actor(),
    service = new AccessibleQuestService(f.db, policy);
  const { enrollmentId } = await service.start(a.principal, {
    goalId,
    commandId: key(),
  });
  for (let i = 0; i < 2; i++)
    await new ProgressionService(f.db, facts).ingest(
      'POKER',
      await fullHouseFixture(f.db, [a.userId, b.userId]),
    );
  await f.db.$transaction((tx) =>
    moveRestrictedCurrency(tx, {
      userId: a.userId,
      currency: 'TRAIL_CREDITS',
      purpose: 'EARN_ACTIVITY',
      amount: 1n,
      sourceKey: key(),
      operatorId: 'ISOLATED_TEST_ONLY',
      proofReference: 'NOT_A_REAL_ACTIVITY_PROOF',
      policyVersion: 'FIXTURE_ONLY',
    }),
  );
  await expect(
    service.claim(a.principal, { enrollmentId, commandId: key() }),
  ).rejects.toMatchObject({ code: 'DAILY_TRAIL_CAP' });
  expect(
    await f.db.accessibleQuestFact.count({ where: { enrollmentId } }),
  ).toBe(0);
  expect(
    await f.db.accessibleQuestCompletion.findUnique({
      where: { enrollmentId },
    }),
  ).toBeNull();
});
it('supports cancellation without health/GPS disclosure and rejects fabricated fields, missing opt-in and unbacked quest credits', async () => {
  const a = await f.actor(),
    service = new AccessibleQuestService(f.db, policy);
  expect(
    (
      await f.request('accessibility/quests/start', a.bearer, {
        goalId,
        commandId: key(),
        steps: 10000,
      })
    ).status,
  ).toBe(400);
  expect((await f.request('accessibility/quests')).status).toBe(401);
  const start = await service.start(a.principal, { goalId, commandId: key() });
  await service.cancel(a.principal, { ...start, commandId: key() });
  await service.cancel(a.principal, { ...start, commandId: key() });
  expect((await service.view(a.principal)).quests[0]?.enrollment?.status).toBe(
    'CANCELLED',
  );
  expect(
    await f.db.restrictedAccount.findUnique({
      where: {
        userId_currency: { userId: a.userId, currency: 'TRAIL_CREDITS' },
      },
    }),
  ).toBeNull();
  await expect(
    f.db.$transaction((tx) =>
      moveRestrictedCurrency(tx, {
        userId: a.userId,
        currency: 'TRAIL_CREDITS',
        purpose: 'EARN_ACCESSIBLE_QUEST',
        amount: 100n,
        sourceKey: key(),
        operatorId: 'test',
        proofReference: key(),
        policyVersion: policy.version,
      }),
    ),
  ).rejects.toThrow();
});
it('allows a new daily enrollment after an expired lease without reusing its records', async () => {
  const a = await f.actor(),
    start = new Date();
  start.setUTCDate(start.getUTCDate() - 1);
  start.setUTCHours(1, 0, 0, 0);
  const end = new Date(start);
  end.setUTCHours(24, 0, 0, 0);
  const oldId = key();
  await f.db.accessibleQuestEnrollment.create({
    data: {
      id: oldId,
      userId: a.userId,
      goalId,
      windowKey: 'daily:' + start.toISOString().slice(0, 10),
      definition: json(goal),
      policy: json(policy),
      startedAt: start,
      expiresAt: end,
    },
  });
  const service = new AccessibleQuestService(f.db, policy);
  expect((await service.view(a.principal)).quests[0]?.enrollment).toBeNull();
  const next = await service.start(a.principal, { goalId, commandId: key() });
  expect(next.enrollmentId).not.toBe(oldId);
  expect(
    (
      await f.db.accessibleQuestEnrollment.findUniqueOrThrow({
        where: { id: oldId },
      })
    ).status,
  ).toBe('EXPIRED');
  expect(
    (await service.view(a.principal)).quests[0]?.enrollment?.progress,
  ).toBe(0);
});
