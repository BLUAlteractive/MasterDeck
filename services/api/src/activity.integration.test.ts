import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { identityFixture } from '../test/auth-fixture';
import { PrivacyService, type PrivacyConfig } from './privacy/service';
import { ActivityService, type ActivityConfig } from './activity/service';
import { moveRestrictedCurrency } from './wallets';
let f: Awaited<ReturnType<typeof identityFixture>>,
  service: ActivityService,
  privacy: PrivacyService;
const packets = new Map<string, unknown>(),
  target = randomUUID();
const config: ActivityConfig = {
  policy: {
    version: 'TEST_ACTIVITY_V1',
    approvalReference: 'TEST_ONLY_NOT_APPROVAL',
    stepsPerCredit: 100,
    dailyCreditCap: 150,
    maxStepsPerMinute: 300,
    maxDailySteps: 100000,
    lookbackHours: 24,
    retentionHours: 48,
  },
  verifier: {
    async verify(evidence) {
      if (!packets.has(evidence)) throw new Error('TEST_ONLY_UNVERIFIED');
      return packets.get(evidence);
    },
  },
  async allocatePress(_tx, _userId, records) {
    return { jobId: target, units: records.reduce((n, r) => n + r.steps, 0) };
  },
};
const privacyConfig: PrivacyConfig = {
  policyVersion: 'TEST_ONLY_V1',
  policyUrl: 'https://example.invalid/privacy',
  approvalReference: 'TEST_ONLY_NOT_APPROVAL',
  retentionApprovalReference: 'TEST_ONLY_RETENTION',
  analyticsRetentionDays: 30,
  identityHashKey: randomBytes(32),
  provider: null,
};
beforeAll(async () => {
  f = await identityFixture(null, null, null, {
    activity: config,
    privacy: privacyConfig,
  });
  service = new ActivityService(f.db, config);
  privacy = new PrivacyService(f.auth, privacyConfig);
}, 30000);
afterAll(async () => {
  await f?.close();
});
async function consent(index: number) {
  const p = f.players[index]!;
  await privacy.consent(p.principal, {
    commandId: randomUUID(),
    purpose: 'ACTIVITY_UPLOAD',
    enabled: true,
    policyVersion: privacyConfig.policyVersion,
  });
  return p;
}
const sampleNow = Date.now() - 60000;
const midnight = new Date(sampleNow).setUTCHours(0, 0, 0, 0);
const sampleAnchor =
  sampleNow - midnight >= 400 * 60000 ? sampleNow : midnight - 60000;
async function earned(userId: string) {
  return (
    await f.db.activityAllocation.findMany({
      where: { userId, channel: 'TRAIL_CREDITS' },
    })
  ).reduce((n, r) => n + r.units, 0);
}
function records(count = 100, steps = 100, offset = 0) {
  const now = sampleAnchor;
  return Array.from({ length: count }, (_, i) => ({
    source: 'HEALTHKIT' as 'HEALTHKIT' | 'HEALTH_CONNECT',
    recordId: randomUUID(),
    revision: 1,
    start: new Date(now - (offset + count - i) * 60000).toISOString(),
    end: new Date(now - (offset + count - i - 1) * 60000).toISOString(),
    steps,
    manual: false,
    deleted: false,
  }));
}
function input(userId: string, items: ReturnType<typeof records>) {
  const evidence = randomUUID();
  packets.set(evidence, { userId, proofId: randomUUID(), records: items });
  return { commandId: randomUUID(), evidence };
}
it('reimports 100 samples concurrently once with independent exactly-once credit and one selected Press allocation', async () => {
  const p = await consent(0),
    samples = records(),
    body = input(p.userId, samples),
    other = new ActivityService(f.secondDb, config);
  const replies = await Promise.all(
    Array.from({ length: 100 }, (_, i) =>
      (i % 2 ? other : service).ingest(p.principal, body),
    ),
  );
  for (const reply of replies) expect(reply).toEqual(replies[0]);
  expect(replies[0]).toMatchObject({
    acceptedSteps: 10000,
    trailCreditsGranted: '100',
    reviewRequired: false,
  });
  const allocations = await f.db.activityAllocation.findMany({
    where: { userId: p.userId },
  });
  expect(allocations.map((a) => a.channel).sort()).toEqual([
    'PRESS_STEPS',
    'TRAIL_CREDITS',
  ]);
  expect(allocations.find((a) => a.channel === 'PRESS_STEPS')).toMatchObject({
    targetId: target,
    units: 10000,
  });
  const replay = await service.ingest(p.principal, input(p.userId, samples));
  expect(replay).toMatchObject({
    acceptedSteps: 0,
    duplicates: 100,
    trailCreditsGranted: '0',
  });
  expect(await earned(p.userId)).toBe(100);
}, 30000);
it('excludes overlap from other OS/devices and caps credits without capping the independent Press units', async () => {
  const p = await consent(1),
    samples = records();
  await service.ingest(p.principal, input(p.userId, samples));
  const duplicates = samples.map((r) => ({
    ...r,
    source: 'HEALTH_CONNECT' as const,
    recordId: randomUUID(),
  }));
  const overlap = await service.ingest(
    p.principal,
    input(p.userId, duplicates),
  );
  expect(overlap).toMatchObject({
    acceptedSteps: 0,
    rejected: 100,
    trailCreditsGranted: '0',
  });
  const extra = records(50, 200, 150);
  expect(
    await service.ingest(p.principal, input(p.userId, extra)),
  ).toMatchObject({ acceptedSteps: 10000, trailCreditsGranted: '50' });
  expect(await earned(p.userId)).toBe(150);
  expect(
    (
      await f.db.activityAllocation.findMany({
        where: { userId: p.userId, channel: 'PRESS_STEPS' },
      })
    ).reduce((n, r) => n + r.units, 0),
  ).toBe(20000);
});
it('quarantines corrections with a deterministic adjustment, blocks new functional spend and never rewrites previous allocations', async () => {
  const p = await consent(2),
    samples = records(1);
  await service.ingest(p.principal, input(p.userId, samples));
  const corrected = [{ ...samples[0]!, revision: 2, steps: 20 }];
  const result = await service.ingest(p.principal, input(p.userId, corrected));
  expect(result.reviewRequired).toBe(true);
  expect(
    (
      await f.db.activityReview.findFirstOrThrow({
        where: { userId: p.userId },
      })
    ).stepAdjustment,
  ).toBe(-80);
  await expect(
    f.db.$transaction((tx) =>
      moveRestrictedCurrency(tx, {
        userId: p.userId,
        currency: 'TRAIL_CREDITS',
        purpose: 'BUY_SCREEN',
        amount: 1n,
        sourceKey: randomUUID(),
        operatorId: 'TEST_ONLY',
        proofReference: 'TEST_ONLY',
        policyVersion: 'TEST_ONLY',
      }),
    ),
  ).rejects.toMatchObject({ code: 'ACTIVITY_REVIEW_REQUIRED' });
  expect(await earned(p.userId)).toBe(1);
  await expect(
    f.db.activityAllocation.deleteMany({ where: { userId: p.userId } }),
  ).rejects.toThrow();
});
it('enforces consent/subject binding, rejects raw counts, purges precision and fences out pre-withdrawal reuploads', async () => {
  const p = f.players[3]!;
  await expect(
    service.ingest(p.principal, input(p.userId, records(1))),
  ).rejects.toMatchObject({ code: 'ACTIVITY_CONSENT_REQUIRED' });
  await consent(3);
  await expect(
    service.ingest(p.principal, input(f.players[0]!.userId, records(1))),
  ).rejects.toMatchObject({ code: 'UNVERIFIED_ACTIVITY' });
  expect(
    (
      await f.request('activity/ingest', p.bearer, {
        commandId: randomUUID(),
        steps: 1000,
      })
    ).status,
  ).toBe(400);
  const samples = records(1);
  await service.ingest(p.principal, input(p.userId, samples));
  await privacy.consent(p.principal, {
    commandId: randomUUID(),
    purpose: 'ACTIVITY_UPLOAD',
    enabled: false,
  });
  expect(
    (
      await f.db.activitySource.findFirstOrThrow({
        where: { userId: p.userId },
      })
    ).startAt,
  ).toBeNull();
  await consent(3);
  const result = await service.ingest(p.principal, input(p.userId, records(1)));
  expect(result).toMatchObject({ acceptedSteps: 0, rejected: 1 });
  await service.purge(new Date(Date.now() + 49 * 3600000));
  expect(
    await f.db.activitySource.count({ where: { startAt: { not: null } } }),
  ).toBe(0);
  await expect(
    new ActivityService(f.db).ingest(p.principal, {
      commandId: randomUUID(),
      evidence: 'unverified',
    }),
  ).rejects.toMatchObject({ code: 'ACTIVITY_VERIFIER_NOT_CONFIGURED' });
});
