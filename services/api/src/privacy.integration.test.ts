import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { identityFixture } from '../test/auth-fixture';
import { fixtureAdmin } from '../test/admin-fixture';
import { fixtureLoadout } from '../test/funded';
import { PrivacyService, type PrivacyConfig } from './privacy/service';
import { writeCardTransition } from '@deckforge/database';
import { AuthService } from './auth/service';
import { hash } from './rooms/shared';
let f: Awaited<ReturnType<typeof identityFixture>>;
let service: PrivacyService;
let calls = 0,
  fail = false;
const config: PrivacyConfig = {
  policyVersion: 'TEST_ONLY_V1',
  policyUrl: 'https://example.invalid/privacy',
  approvalReference: 'TEST_ONLY_APPROVAL',
  retentionApprovalReference: 'TEST_ONLY_RETENTION',
  analyticsRetentionDays: 30,
  identityHashKey: randomBytes(32),
  provider: {
    async deleteIdentity(issuer, subject, requestId) {
      calls++;
      if (fail) throw new Error('TEST_ONLY_PROVIDER_OUTAGE');
      return {
        confirmed: true,
        referenceHash: hash({ issuer, subject, requestId }),
      };
    },
  },
};
beforeAll(async () => {
  f = await identityFixture(null, null, null, { privacy: config });
  service = new PrivacyService(f.auth, config);
}, 30000);
afterAll(async () => {
  await f?.close();
});
it('defaults consent off, rejects unknown policies, deduplicates concurrent consent and purges withdrawn collection telemetry', async () => {
  const p = f.players[0]!;
  expect((await service.state(p.principal)).choices).toEqual({
    analytics: false,
    activityUpload: false,
    foregroundLocation: false,
  });
  await expect(
    service.consent(p.principal, {
      commandId: randomUUID(),
      purpose: 'ANALYTICS',
      enabled: true,
      policyVersion: 'unknown',
    }),
  ).rejects.toMatchObject({ code: 'PRIVACY_POLICY_NOT_CONFIGURED' });
  await fixtureLoadout(f.db, p.userId);
  expect((await f.request('cards?limit=1', p.bearer)).status).toBe(200);
  expect(
    await f.db.collectorActivity.findUnique({ where: { userId: p.userId } }),
  ).toBeNull();
  const command = {
    commandId: randomUUID(),
    purpose: 'ANALYTICS',
    enabled: true,
    policyVersion: config.policyVersion,
  };
  await Promise.all(
    Array.from({ length: 10 }, () => service.consent(p.principal, command)),
  );
  expect(await f.db.privacyConsent.count({ where: { userId: p.userId } })).toBe(
    1,
  );
  expect((await f.request('cards?limit=1', p.bearer)).status).toBe(200);
  expect(
    await f.db.collectorActivity.findUnique({ where: { userId: p.userId } }),
  ).not.toBeNull();
  await service.consent(p.principal, {
    commandId: randomUUID(),
    purpose: 'ANALYTICS',
    enabled: false,
  });
  expect(
    await f.db.collectorActivity.findUnique({ where: { userId: p.userId } }),
  ).toBeNull();
  await expect(
    f.db.privacyConsent.deleteMany({ where: { userId: p.userId } }),
  ).rejects.toThrow();
  await expect(
    f.db.privacyChoice.update({
      where: { userId: p.userId },
      data: { analytics: true, version: { increment: 1 } },
    }),
  ).rejects.toThrow();
});
it('exports only bounded owner projections with opaque pagination and immutable access audit', async () => {
  const p = f.players[0]!,
    first = await service.export(p.principal, { resource: 'CARDS', limit: 1 });
  expect(first.items).toHaveLength(1);
  expect(first.nextCursor).not.toBeNull();
  const next = await service.export(p.principal, {
    resource: 'CARDS',
    limit: 1,
    cursor: first.nextCursor,
  });
  expect(next.items[0]!.id).not.toBe(first.items[0]!.id);
  for (const resource of [
    'ACCOUNT',
    'OWNERSHIP',
    'PURCHASES',
    'CONSENTS',
    'PLAY_CHIPS',
    'TRAIL_CREDITS',
    'STORE_GEMS',
    'PROGRESSION',
    'SAFETY',
  ]) {
    const output = await service.export(p.principal, { resource });
    const text = JSON.stringify(output);
    expect(text).not.toContain(f.players[1]!.userId);
    expect(text).not.toContain('evidenceBox');
    expect(text).not.toContain('access_token');
    expect(text).not.toContain('deck');
  }
  expect(
    (
      await f.request(
        'privacy/export?resource=ACCOUNT&userId=' + f.players[1]!.userId,
        p.bearer,
      )
    ).status,
  ).toBe(400);
  await expect(
    f.db.privacyAccessEvent.deleteMany({ where: { userId: p.userId } }),
  ).rejects.toThrow();
});
it('revokes immediately, waits for reviewed provider configuration, and cannot complete without proofs', async () => {
  const p = f.players[1]!,
    receipt = await service.request(p.principal, {
      commandId: randomUUID(),
      confirm: 'DELETE_ACCOUNT',
    });
  expect((await f.request('privacy', p.bearer)).status).toBe(401);
  await new PrivacyService(f.auth).process(receipt.requestId);
  expect(
    (
      await f.db.privacyDeletionJob.findUniqueOrThrow({
        where: { id: receipt.requestId },
      })
    ).status,
  ).toBe('WAITING_CONFIG');
  await expect(
    f.db.privacyDeletionJob.update({
      where: { id: receipt.requestId },
      data: {
        status: 'COMPLETED_WITH_RETAINED_RECORDS',
        completedAt: new Date(),
        version: { increment: 1 },
      },
    }),
  ).rejects.toThrow();
});
it('retries provider failure, completes concurrently once, retains provenance and prevents re-creation from an old valid identity token', async () => {
  const p = f.players[0]!,
    receipt = await service.request(p.principal, {
      commandId: randomUUID(),
      confirm: 'DELETE_ACCOUNT',
    });
  fail = true;
  await service.process(receipt.requestId);
  expect(
    (
      await f.db.privacyDeletionJob.findUniqueOrThrow({
        where: { id: receipt.requestId },
      })
    ).status,
  ).toBe('RETRY');
  fail = false;
  const before = calls;
  await Promise.all(
    Array.from({ length: 10 }, () => service.process(receipt.requestId)),
  );
  expect(calls - before).toBe(1);
  const job = await f.db.privacyDeletionJob.findUniqueOrThrow({
    where: { id: receipt.requestId },
  });
  expect(job.status).toBe('COMPLETED_WITH_RETAINED_RECORDS');
  expect(
    (await f.db.user.findUniqueOrThrow({ where: { id: p.userId } })).status,
  ).toBe('DELETED');
  expect(
    (
      await f.db.externalIdentity.findFirstOrThrow({
        where: { userId: p.userId },
      })
    ).subject,
  ).toMatch(/^erased:[a-f0-9]{64}$/);
  expect(await f.db.cardInstance.count({ where: { ownerId: p.userId } })).toBe(
    52,
  );
  expect(
    await f.db.ownershipEvent.count({
      where: { instance: { ownerId: p.userId } },
    }),
  ).toBeGreaterThanOrEqual(52);
  expect(await f.db.loadout.count({ where: { userId: p.userId } })).toBe(0);
  await expect(f.auth.startSession('Bearer ' + p.bearer)).rejects.toMatchObject(
    { status: 401 },
  );
  // A bootstrap missing the protected HMAC key must fail closed for this issuer.
  const unconfigured = new AuthService(f.db, {
    verify: (token: string) => f.auth.claims('Bearer ' + token),
  });
  await expect(
    unconfigured.startSession('Bearer ' + p.bearer),
  ).rejects.toMatchObject({ status: 503 });
});

it('holds deletion before provider calls while an owned game card is locked', async () => {
  const p = f.players[2]!,
    cards = await fixtureLoadout(f.db, p.userId),
    card = cards[0]!,
    gameId = randomUUID();
  const locked = await f.db.$transaction((tx) =>
    writeCardTransition(tx, {
      instanceId: card.id,
      ownerId: p.userId,
      expectedVersion: card.stateVersion,
      command: { action: 'LOCK', lockToken: gameId, lockReason: 'POKER_HAND' },
      operatorId: 'test.privacy',
      sourceKey: randomUUID(),
      reason: 'ISOLATED_TEST_ONLY',
    }),
  );
  const receipt = await service.request(p.principal, {
      commandId: randomUUID(),
      confirm: 'DELETE_ACCOUNT',
    }),
    before = calls;
  await service.process(receipt.requestId);
  expect(calls).toBe(before);
  expect(
    (
      await f.db.privacyDeletionJob.findUniqueOrThrow({
        where: { id: receipt.requestId },
      })
    ).status,
  ).toBe('WAITING_GAME');
  await f.db.$transaction((tx) =>
    writeCardTransition(tx, {
      instanceId: card.id,
      ownerId: p.userId,
      expectedVersion: locked.card.stateVersion,
      command: { action: 'UNLOCK', lockToken: gameId },
      operatorId: 'test.privacy',
      sourceKey: randomUUID(),
      reason: 'ISOLATED_TEST_ONLY',
    }),
  );
  await service.process(receipt.requestId);
  expect(
    (
      await f.db.privacyDeletionJob.findUniqueOrThrow({
        where: { id: receipt.requestId },
      })
    ).status,
  ).toBe('COMPLETED_WITH_RETAINED_RECORDS');
});

it('requires fresh scoped MFA for audited operator processing and reuses its audit key', async () => {
  const p = f.players[3]!,
    receipt = await service.request(p.principal, {
      commandId: randomUUID(),
      confirm: 'DELETE_ACCOUNT',
    });
  const input = {
    commandId: randomUUID(),
    reason: 'Isolated privacy operator retry',
    jobId: receipt.requestId,
  };
  const ordinary = await f.actor(false);
  expect(
    (await f.request('privacy/process', ordinary.bearer, input)).status,
  ).toBe(403);
  const admin = await fixtureAdmin(f, ['PRIVACY_OPERATOR']);
  expect((await f.request('privacy/process', admin.bearer, input)).status).toBe(
    200,
  );
  expect((await f.request('privacy/process', admin.bearer, input)).status).toBe(
    200,
  );
  expect(
    await f.db.adminAction.count({
      where: { actorId: admin.userId, commandId: input.commandId },
    }),
  ).toBe(1);
});
