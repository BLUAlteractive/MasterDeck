import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { identityFixture } from '../test/auth-fixture';
import { fixtureAdmin } from '../test/admin-fixture';
import { fixtureLoadout } from '../test/funded';
import { fullHouseFixture } from '../test/progress-fixture';
import { OperationsService, RequestLatency } from './admin/operations';
import { operationalSummarySchema } from '@deckforge/contracts';
let f: Awaited<ReturnType<typeof identityFixture>>,
  a: Awaited<ReturnType<typeof fixtureAdmin>>,
  service: OperationsService;
const command = () => ({
  commandId: randomUUID(),
  reason: 'Isolated operations reconciliation',
});
beforeAll(async () => {
  f = await identityFixture();
  a = await fixtureAdmin(f, ['AUDITOR']);
  const latency = new RequestLatency();
  latency.observe(12);
  service = new OperationsService(f.auth, latency);
}, 30000);
afterAll(async () => {
  await f?.close();
});
it('requires current scoped MFA and audits source-idempotent consistent aggregate reads without private data', async () => {
  await expect(
    service.read(f.players[0]!.principal, command()),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  const input = command(),
    results = await Promise.all(
      Array.from({ length: 10 }, () => service.read(a.principal, input)),
    );
  for (const r of results) expect(r).toEqual(results[0]);
  const r = operationalSummarySchema.parse(results[0]);
  expect(r.source).toBe('DATABASE_REPEATABLE_READ');
  expect(r.latency).toMatchObject({
    source: 'PROCESS_HTTP',
    requests: 1,
    p95UpperMs: 20,
  });
  const text = JSON.stringify(r);
  for (const p of f.players) expect(text).not.toContain(p.userId);
  for (const field of ['"deck"', '"evidenceBox"', '"token"'])
    expect(text).not.toContain(field);
  expect(
    await f.db.adminAction.count({
      where: { actorId: a.userId, action: 'DASHBOARD' },
    }),
  ).toBe(1);
  expect(r.funnel.newAccounts).toBe(
    await f.db.user.count({
      where: {
        createdAt: {
          gte: new Date(r.windowStart),
          lte: new Date(r.generatedAt),
        },
      },
    }),
  );
  await expect(
    service.read(a.principal, { ...input, reason: 'Changed audit reason' }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
}, 30000);
it('counts WEC only after both a settled match and a server-observed owned collection action, never arbitrary client analytics', async () => {
  const player = f.players[0]!;
  await fixtureLoadout(f.db, player.userId);
  const before = await service.read(a.principal, command());
  await fullHouseFixture(
    f.db,
    f.players.slice(0, 2).map((p) => p.userId),
  );
  const matched = await service.read(a.principal, command());
  expect(matched.wec.count).toBe(before.wec.count);
  expect((await f.request('cards?limit=1', player.bearer)).status).toBe(200);
  const engaged = await service.read(a.principal, command());
  expect(engaged.wec.count).toBe(before.wec.count + 1);
  for (let i = 0; i < 3; i++)
    expect((await f.request('cards?limit=1', player.bearer)).status).toBe(200);
  expect((await service.read(a.principal, command())).wec.count).toBe(
    engaged.wec.count,
  );
  await expect(
    f.db.collectorActivity.update({
      where: { userId: player.userId },
      data: { lastCollectionAt: new Date('2099-01-01') },
    }),
  ).rejects.toThrow();
  expect(engaged.integrity.playChipMismatches).toBe(0);
  expect(engaged.integrity.playChipTotal).toBe('0');
  expect(engaged.integrity.restrictedMismatches).toBe(0);
});
it('serves only validated audited snapshots, observes actual HTTP latency and honors revoked auditor scopes', async () => {
  expect(
    (await f.request('admin/operations/snapshot', a.bearer, command())).status,
  ).toBe(200);
  expect(
    (
      await f.request('admin/operations/snapshot', a.bearer, {
        ...command(),
        userId: f.players[0]!.userId,
      })
    ).status,
  ).toBe(400);
  await f.db.adminCapability.update({
    where: { userId_capability: { userId: a.userId, capability: 'AUDITOR' } },
    data: { revokedAt: new Date() },
  });
  expect(
    (await f.request('admin/operations/snapshot', a.bearer, command())).status,
  ).toBe(403);
});
