import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { identityFixture } from '../test/auth-fixture';
import { fixturePack } from '../test/pack-fixture';
import { PackOpeningService } from './packs/opening';
import { PackCatalogService } from './packs/catalog';
import { AccessibleQuestService } from './accessibility';
import { ProgressionService } from './progression';
import { fullHouseFixture } from '../test/progress-fixture';
import type { Principal } from './auth/service';
import type { AccessiblePolicy } from '@deckforge/contracts';
import { hash, json } from './rooms/shared';
import { packOpeningSchema } from '@deckforge/contracts';
let f: Awaited<ReturnType<typeof identityFixture>>,
  pack: Awaited<ReturnType<typeof fixturePack>>,
  service: PackOpeningService;
const config = {
  approvalReference: 'TEST_ONLY_NOT_APPROVAL',
  encryptionKey: randomBytes(32),
  keyVersion: 'TEST_PACK_KEY_V1',
};
async function fund(a: { userId: string; principal: Principal }) {
  const goalId = 'PACK_FUNDING_TEST:' + randomUUID(),
    eligibility = {
      requirePermanent: false,
      minimumOpponents: 1,
      minimumPlayerCommands: 1,
    },
    policy: AccessiblePolicy = {
      ...eligibility,
      version: 'TEST_ONLY_PACK_QUEST',
      approvalReference: 'TEST_ONLY_NOT_APPROVAL',
      maxTrailPerDay: 1000,
      goals: [
        {
          goalId,
          equivalencePlanId: 'TEST_ONLY',
          trailCredits: 1000,
          pressRecipeId: 'TEST_ONLY',
        },
      ],
    },
    goal = {
      id: 'PACK_QUEST',
      kind: 'POKER_COMPLETED',
      target: 1,
      badge: 'Test quest',
      window: 'WEEKLY',
      startsAt: '2020-01-01T00:00:00.000Z',
      endsAt: '2040-01-01T00:00:00.000Z',
    };
  await f.db.progressGoal.create({
    data: { id: goalId, definition: json(goal), policyHash: hash(policy) },
  });
  const service = new AccessibleQuestService(f.db, policy),
    { enrollmentId } = await service.start(a.principal, {
      goalId,
      commandId: randomUUID(),
    }),
    opponent = f.players.find((p) => p.userId !== a.userId)!;
  await new ProgressionService(f.db, {
    ...eligibility,
    version: 'TEST_ONLY_PACK_FACTS',
    approvalReference: 'TEST_ONLY',
    goals: [],
  }).ingest('POKER', await fullHouseFixture(f.db, [a.userId, opponent.userId]));
  await service.claim(a.principal, { enrollmentId, commandId: randomUUID() });
}
beforeAll(async () => {
  f = await identityFixture();
  pack = await fixturePack(f, { cardOnly: true });
  service = new PackOpeningService(pack.catalog, config);
}, 30000);
afterAll(async () => {
  await f?.db.cardSeries.updateMany({
    where: { id: pack?.seriesId },
    data: { status: 'RETIRED' },
  });
  await f?.close();
});
it('opens once under ten concurrent retries with one debit, original item IDs and replayable server-only RNG', async () => {
  const p = f.players[0]!;
  await fund(p);
  const command = {
    commandId: randomUUID(),
    expectedDefinitionHash: hash(pack.definition),
  };
  const receipts = await Promise.all(
    Array.from({ length: 10 }, () =>
      service.open(p.principal, pack.packId, command),
    ),
  );
  for (const r of receipts) expect(r).toEqual(receipts[0]);
  const result = packOpeningSchema.parse(receipts[0]);
  expect(result.outcomes).toHaveLength(3);
  expect(await f.db.packOpening.count({ where: { userId: p.userId } })).toBe(1);
  expect(
    (
      await f.db.restrictedAccount.findUniqueOrThrow({
        where: {
          userId_currency: { userId: p.userId, currency: 'TRAIL_CREDITS' },
        },
      })
    ).balance,
  ).toBe(900n);
  const stored = await f.db.packOpening.findUniqueOrThrow({
    where: { id: result.openingId },
  });
  expect(JSON.stringify(result)).not.toMatch(
    /rngBox|draws|encryptionKey|"seed"/,
  );
  expect(
    await new PackOpeningService(pack.catalog, config).audit(result.openingId),
  ).toEqual({ valid: true, drawCount: 3 });
  expect(
    await new PackOpeningService(new PackCatalogService(f.db)).open(
      p.principal,
      pack.packId,
      command,
    ),
  ).toEqual(result);
  expect(await service.receipt(p.principal, result.openingId)).toEqual(result);
  await expect(
    service.receipt(f.players[1]!.principal, result.openingId),
  ).rejects.toMatchObject({ code: 'OPENING_UNAVAILABLE' });
  const cards = result.outcomes.filter((o) => o.kind === 'CARD');
  expect(cards).toHaveLength(3);
  expect(await f.db.cardInstance.count({ where: { ownerId: p.userId } })).toBe(
    cards.length,
  );
  expect(
    (await f.db.supplyEvent.findMany({ where: { userId: p.userId } })).reduce(
      (n, e) => n + e.delta,
      0,
    ),
  ).toBe(
    result.outcomes.reduce(
      (n, o) => n + (o.kind === 'TRAIL_INK' ? o.units : 0),
      0,
    ),
  );
  await expect(
    f.db.packOpening.update({
      where: { id: stored.id },
      data: { rngBox: 'tampered' },
    }),
  ).rejects.toThrow();
});
it('serializes finite stock across distinct owners, including ink-only outcomes, with no partial debit on failure', async () => {
  const limited = await fixturePack(f, { stockLimit: 1, inkOnly: true }),
    opening = new PackOpeningService(limited.catalog, config),
    players = await Promise.all([f.actor(), f.actor()]);
  try {
    for (const p of players) await fund(p);
    const results = await Promise.allSettled(
      players.map((p) =>
        opening.open(p.principal, limited.packId, {
          commandId: randomUUID(),
          expectedDefinitionHash: hash(limited.definition),
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (
        await f.db.packStock.findUniqueOrThrow({
          where: { packId: limited.packId },
        })
      ).issued,
    ).toBe(1);
    const balances = await f.db.restrictedAccount.findMany({
      where: {
        userId: { in: players.map((p) => p.userId) },
        currency: 'TRAIL_CREDITS',
      },
    });
    expect(balances.map((b) => b.balance).sort()).toEqual([900n, 1000n].sort());
    expect((await limited.catalog.list()).packs[0]!.remainingStock).toBe(0);
    const winner = results.find((r) => r.status === 'fulfilled');
    expect(
      winner?.status === 'fulfilled' &&
        winner.value.outcomes.every((o) => o.kind === 'TRAIL_INK'),
    ).toBe(true);
    const supply = await f.db.supplyBalance.findFirstOrThrow({
      where: { userId: { in: players.map((p) => p.userId) } },
    });
    expect(supply.units).toBe(6);
    await expect(
      f.db.supplyBalance.update({
        where: { userId_kind: { userId: supply.userId, kind: 'TRAIL_INK' } },
        data: { units: { increment: 1 }, version: { increment: 1 } },
      }),
    ).rejects.toThrow();
  } finally {
    await f.db.cardSeries.update({
      where: { id: limited.seriesId },
      data: { status: 'RETIRED' },
    });
  }
}, 30000);
it('rejects insufficient funds, stale odds and unverified region without minting or spending; supplies cannot be edited', async () => {
  const p = f.players[1]!,
    before = await f.db.cardInstance.count();
  await expect(
    service.open(p.principal, pack.packId, {
      commandId: randomUUID(),
      expectedDefinitionHash: hash(pack.definition),
    }),
  ).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
  await expect(
    service.open(p.principal, pack.packId, {
      commandId: randomUUID(),
      expectedDefinitionHash: 'a'.repeat(64),
    }),
  ).rejects.toMatchObject({ code: 'PACK_OFFER_CHANGED' });
  const regional = await fixturePack(f, { regions: ['ZZ'] });
  try {
    await expect(
      new PackOpeningService(regional.catalog, config).open(
        p.principal,
        regional.packId,
        {
          commandId: randomUUID(),
          expectedDefinitionHash: hash(regional.definition),
        },
      ),
    ).rejects.toMatchObject({ code: 'PACK_REGION_UNVERIFIED' });
  } finally {
    await f.db.cardSeries.update({
      where: { id: regional.seriesId },
      data: { status: 'RETIRED' },
    });
  }
  expect(await f.db.cardInstance.count()).toBe(before);
  expect(await f.db.packOpening.count({ where: { userId: p.userId } })).toBe(0);
  const owner = f.players[0]!,
    balance = await f.db.supplyBalance.findUnique({
      where: { userId_kind: { userId: owner.userId, kind: 'TRAIL_INK' } },
    });
  if (balance)
    await expect(
      f.db.supplyBalance.update({
        where: { userId_kind: { userId: owner.userId, kind: 'TRAIL_INK' } },
        data: { units: { increment: 1 }, version: { increment: 1 } },
      }),
    ).rejects.toThrow();
}, 30000);
