import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { walletViewSchema } from '@deckforge/contracts';
import { identityFixture } from '../test/auth-fixture';
import { moveRestrictedCurrency } from './wallets';
let f: Awaited<ReturnType<typeof identityFixture>>;
beforeAll(async () => {
  f = await identityFixture();
});
afterAll(async () => {
  await f?.close();
});
const decision = (userId: string) => ({
  userId,
  currency: 'TRAIL_CREDITS' as const,
  purpose: 'EARN_ACTIVITY' as const,
  amount: 100n,
  sourceKey: randomUUID(),
  operatorId: 'ISOLATED_PRIMITIVE_FIXTURE',
  proofReference: 'NOT_A_REAL_ACTIVITY_PROOF',
  policyVersion: 'FIXTURE_ONLY',
});
it('replays concurrent verified-decision primitives once and exposes three owner-only restricted balances', async () => {
  const a = await f.actor(),
    b = await f.actor(),
    input = decision(a.userId);
  const receipts = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      (i % 2 ? f.db : f.secondDb).$transaction((tx) =>
        moveRestrictedCurrency(tx, input),
      ),
    ),
  );
  expect(new Set(receipts.map((r) => r.transferId)).size).toBe(1);
  const r = await f.request('wallets', a.bearer);
  expect(r.status).toBe(200);
  const view = walletViewSchema.parse(await r.json());
  expect(view.trailCredits).toBe('100');
  expect(view.storeGems).toBe('0');
  expect(view.playChips).toBe('0');
  expect(view.restrictions.exchange).toBe(false);
  expect(
    walletViewSchema.parse(await (await f.request('wallets', b.bearer)).json())
      .trailCredits,
  ).toBe('0');
  expect((await f.request('wallets')).status).toBe(401);
  await expect(
    f.db.$transaction((tx) =>
      moveRestrictedCurrency(tx, { ...input, amount: 101n }),
    ),
  ).rejects.toMatchObject({ code: 'LEDGER_SOURCE_CONFLICT' });
});
it('serializes competing debits, never goes negative and reconciles every journal account', async () => {
  const a = await f.actor(),
    grant = decision(a.userId);
  await f.db.$transaction((tx) => moveRestrictedCurrency(tx, grant));
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, (_, i) =>
      (i % 2 ? f.db : f.secondDb).$transaction((tx) =>
        moveRestrictedCurrency(tx, {
          ...grant,
          purpose: 'BUY_SCREEN',
          sourceKey: randomUUID(),
          amount: 30n,
        }),
      ),
    ),
  );
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
  expect(
    (
      await f.db.restrictedAccount.findUniqueOrThrow({
        where: {
          userId_currency: { userId: a.userId, currency: 'TRAIL_CREDITS' },
        },
      })
    ).balance,
  ).toBe(10n);
  const bad = await f.db.$queryRaw<
    { n: number }[]
  >`SELECT count(*)::int AS n FROM "RestrictedAccount" a WHERE a."balance" IS DISTINCT FROM (SELECT COALESCE(sum(e."amount"),0) FROM "RestrictedEntry" e WHERE e."accountId"=a."id")`;
  expect(bad[0]?.n).toBe(0);
});
it('rejects cross-currency functionality, direct balance edits and public grant/exchange/cashout commands', async () => {
  const a = await f.actor(),
    input = decision(a.userId);
  await f.db.$transaction((tx) => moveRestrictedCurrency(tx, input));
  await expect(
    f.db.$transaction((tx) =>
      moveRestrictedCurrency(tx, {
        ...input,
        sourceKey: randomUUID(),
        currency: 'STORE_GEMS',
        purpose: 'BUY_SCREEN',
      }),
    ),
  ).rejects.toMatchObject({ code: 'FORBIDDEN_CURRENCY_USE' });
  const account = await f.db.restrictedAccount.findUniqueOrThrow({
    where: { userId_currency: { userId: a.userId, currency: 'TRAIL_CREDITS' } },
  });
  await expect(
    f.db.restrictedAccount.update({
      where: { id: account.id },
      data: { balance: { increment: 1 } },
    }),
  ).rejects.toThrow();
  await expect(
    f.db.restrictedAccount.update({
      where: { id: account.id },
      data: { currency: 'STORE_GEMS' },
    }),
  ).rejects.toThrow();
  const transfer = await f.db.restrictedTransfer.findUniqueOrThrow({
    where: { sourceKey: input.sourceKey },
  });
  await expect(
    f.db.restrictedTransfer.delete({ where: { id: transfer.id } }),
  ).rejects.toThrow();
  for (const path of [
    'wallets',
    'wallets/exchange',
    'wallets/cashout',
    'wallets/grant',
    'play-chips/purchase',
  ])
    expect(
      (
        await f.request(path, a.bearer, {
          amount: 1000,
          currency: 'PLAY_CHIPS',
        })
      ).status,
    ).toBe(404);
});

it('cannot use an earned balance to fund a paid-currency debit and rolls the whole attempted transaction back', async () => {
  const a = await f.actor(),
    input = decision(a.userId);
  await expect(
    f.db.$transaction(async (tx) => {
      await moveRestrictedCurrency(tx, input);
      await moveRestrictedCurrency(tx, {
        ...input,
        currency: 'STORE_GEMS',
        purpose: 'BUY_COSMETIC',
        amount: 1n,
        sourceKey: randomUUID(),
      });
    }),
  ).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
  expect(
    await f.db.restrictedTransfer.count({
      where: { sourceKey: input.sourceKey },
    }),
  ).toBe(0);
  const view = walletViewSchema.parse(
    await (await f.request('wallets', a.bearer)).json(),
  );
  expect([view.playChips, view.trailCredits, view.storeGems]).toEqual([
    '0',
    '0',
    '0',
  ]);
});
