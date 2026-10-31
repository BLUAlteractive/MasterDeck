import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { identityFixture } from '../test/auth-fixture';
import { fixtureScreen } from '../test/screen-fixture';
import { earnedFixture } from '../test/earned-fixture';
import { OwnedScreenService } from './press/screens';
import { ScreenCatalogService } from './press/catalog';
import { hash } from './rooms/shared';
let f: Awaited<ReturnType<typeof identityFixture>>,
  screen: Awaited<ReturnType<typeof fixtureScreen>>,
  service: OwnedScreenService;
beforeAll(async () => {
  f = await identityFixture();
  screen = await fixtureScreen(f);
  service = new OwnedScreenService(screen.catalog);
}, 30000);
afterAll(async () => {
  await f?.close();
});
const command = () => ({
  commandId: randomUUID(),
  expectedDefinitionHash: hash(screen.definition),
});
it('commits one earned debit and one screen/event under ten concurrent retries, preserving the receipt with admission disabled', async () => {
  const p = await f.actor(false);
  await earnedFixture(f, p, 120);
  const input = command(),
    results = await Promise.all(
      Array.from({ length: 10 }, () =>
        service.buy(p.principal, screen.patternId, input),
      ),
    );
  for (const r of results) expect(r).toEqual(results[0]);
  const receipt = results[0]!;
  expect(receipt.charged).toBe('60');
  expect(receipt.screen.definition).toEqual(screen.definition);
  expect(await f.db.ownedScreen.count({ where: { userId: p.userId } })).toBe(1);
  expect(await f.db.screenEvent.count({ where: { userId: p.userId } })).toBe(1);
  expect(
    (
      await f.db.restrictedAccount.findUniqueOrThrow({
        where: {
          userId_currency: { userId: p.userId, currency: 'TRAIL_CREDITS' },
        },
      })
    ).balance,
  ).toBe(60n);
  expect(
    await new OwnedScreenService(new ScreenCatalogService(f.db)).buy(
      p.principal,
      screen.patternId,
      input,
    ),
  ).toEqual(receipt);
  expect((await service.inventory(p.principal, {})).screens[0]!.screenId).toBe(
    receipt.screen.screenId,
  );
  await expect(
    service.inventory(f.players[0]!.principal, {
      cursor: receipt.screen.screenId,
    }),
  ).rejects.toMatchObject({ code: 'SCREEN_UNAVAILABLE' });
  await expect(
    service.buy(p.principal, screen.patternId, {
      ...input,
      expectedDefinitionHash: 'a'.repeat(64),
    }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
});
it('serializes distinct purchases without overdraft and rejects guests, paid currency, stale price and absent funds without entitlements', async () => {
  const p = await f.actor(false);
  await earnedFixture(f, p, 60);
  const replies = await Promise.allSettled(
    Array.from({ length: 10 }, () =>
      service.buy(p.principal, screen.patternId, command()),
    ),
  );
  expect(replies.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(
    replies
      .filter((r) => r.status === 'rejected')
      .every((r) => r.reason.code === 'INSUFFICIENT_FUNDS'),
  ).toBe(true);
  expect(
    (
      await f.db.restrictedAccount.findUniqueOrThrow({
        where: {
          userId_currency: { userId: p.userId, currency: 'TRAIL_CREDITS' },
        },
      })
    ).balance,
  ).toBe(0n);
  await expect(
    service.buy(f.players[0]!.principal, screen.patternId, command()),
  ).rejects.toMatchObject({ code: 'PERMANENT_ACCOUNT_REQUIRED' });
  await expect(
    service.buy(p.principal, screen.patternId, {
      ...command(),
      currency: 'STORE_GEMS',
    }),
  ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  await expect(
    service.buy(p.principal, screen.patternId, {
      ...command(),
      expectedDefinitionHash: 'a'.repeat(64),
    }),
  ).rejects.toMatchObject({ code: 'SCREEN_OFFER_CHANGED' });
  expect(await f.db.ownedScreen.count({ where: { userId: p.userId } })).toBe(1);
  expect(await f.db.cardInstance.count({ where: { ownerId: p.userId } })).toBe(
    0,
  );
});
it('retains original recipe/receipt through retirement and denies direct entitlement changes or event deletion', async () => {
  const p = await f.actor(false);
  await earnedFixture(f, p, 120);
  const input = command(),
    receipt = await service.buy(p.principal, screen.patternId, input);
  await expect(
    f.db.ownedScreen.update({
      where: { id: receipt.screen.screenId },
      data: { status: 'CONSUMED', stateVersion: 2 },
    }),
  ).rejects.toThrow();
  await expect(
    f.db.ownedScreen.update({
      where: { id: receipt.screen.screenId },
      data: { snapshot: { ...screen.definition, requiredSteps: 1 } },
    }),
  ).rejects.toThrow();
  await expect(
    f.db.screenEvent.deleteMany({
      where: { screenId: receipt.screen.screenId },
    }),
  ).rejects.toThrow();
  await screen.catalog.command(screen.publisher.principal, {
    commandId: randomUUID(),
    reason: 'TEST_ONLY_RETIRE',
    action: 'RETIRE',
    patternId: screen.patternId,
    expectedVersion: 2,
  });
  await expect(
    service.buy(p.principal, screen.patternId, command()),
  ).rejects.toMatchObject({ code: 'SCREEN_UNAVAILABLE' });
  expect(await service.buy(p.principal, screen.patternId, input)).toEqual(
    receipt,
  );
  expect(
    (await service.inventory(p.principal, {})).screens[0]!.definition,
  ).toEqual(screen.definition);
});
it('rolls back an already-posted debit when the entitlement origin event is missing at deferred commit', async () => {
  const { moveRestrictedCurrency } = await import('./wallets');
  const fresh = await fixtureScreen(f),
    p = await f.actor(false);
  await earnedFixture(f, p, 120);
  const screenId = randomUUID(),
    commandId = randomUUID(),
    sourceKey = 'screen:' + screenId + ':debit';
  await expect(
    f.db.$transaction(async (tx) => {
      const transfer = await moveRestrictedCurrency(tx, {
        userId: p.userId,
        currency: 'TRAIL_CREDITS',
        purpose: 'BUY_SCREEN',
        amount: 60n,
        sourceKey,
        operatorId: 'TEST_ONLY',
        proofReference: hash(fresh.definition),
        policyVersion: fresh.policy.version,
      });
      const createdAt = new Date(),
        result = {
          screen: {
            screenId,
            patternId: fresh.patternId,
            status: 'AVAILABLE',
            stateVersion: 1,
            definitionHash: hash(fresh.definition),
            definition: fresh.definition,
            acquiredAt: createdAt.toISOString(),
          },
          charged: '60',
          currency: 'TRAIL_CREDITS',
          transferId: transfer.transferId,
        };
      await tx.ownedScreen.create({
        data: {
          id: screenId,
          userId: p.userId,
          patternId: fresh.patternId,
          definitionHash: hash(fresh.definition),
          snapshot: fresh.definition,
          commandId,
          requestHash: hash({ commandId }),
          transferId: transfer.transferId,
          result,
          createdAt,
        },
      });
      // Deliberately omit ScreenEvent in this owned fault-injection test.
    }),
  ).rejects.toThrow();
  expect(await f.db.ownedScreen.count({ where: { id: screenId } })).toBe(0);
  expect(
    (
      await f.db.restrictedAccount.findUniqueOrThrow({
        where: {
          userId_currency: { userId: p.userId, currency: 'TRAIL_CREDITS' },
        },
      })
    ).balance,
  ).toBe(120n);
  expect(await f.db.restrictedTransfer.count({ where: { sourceKey } })).toBe(0);
}, 30000);
