import { randomUUID } from 'node:crypto';
import type { Prisma } from '@deckforge/database';
import { ApiFailure } from '../auth/errors';
import { hash } from './shared';
const issuerId = '00000000-0000-4000-8000-000000000022';
export async function playerAccount(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  return tx.playChipAccount.upsert({
    where: { userId },
    create: { id: randomUUID(), kind: 'PLAYER', userId },
    update: {},
  });
}
/** Internal balanced ledger primitive. Feature callers establish eligibility and account locks. */
export async function transferChips(
  tx: Prisma.TransactionClient,
  input: {
    sourceKey: string;
    kind: 'EARNED_GRANT' | 'RESERVE' | 'SETTLE';
    operatorId: string;
    entries: { accountId: string; amount: bigint }[];
  },
) {
  const entries = input.entries
    .filter((e) => e.amount !== 0n)
    .sort((a, b) => (a.accountId < b.accountId ? -1 : 1));
  if (
    entries.length < 2 ||
    new Set(entries.map((e) => e.accountId)).size !== entries.length ||
    entries.reduce((s, e) => s + e.amount, 0n) !== 0n
  )
    throw new Error('INVALID_TRANSFER');
  const digest = hash({
    kind: input.kind,
    operatorId: input.operatorId,
    entries: entries.map((e) => ({
      accountId: e.accountId,
      amount: e.amount.toString(),
    })),
  });
  for (const e of entries)
    await tx.$queryRaw`SELECT "id" FROM "PlayChipAccount" WHERE "id"=${e.accountId}::uuid FOR UPDATE`;
  const prior = await tx.playChipTransfer.findUnique({
    where: { sourceKey: input.sourceKey },
  });
  if (prior) {
    if (prior.requestHash !== digest)
      throw new ApiFailure('LEDGER_SOURCE_CONFLICT', 409);
    return prior;
  }
  for (const e of entries) {
    const account = await tx.playChipAccount.findUniqueOrThrow({
      where: { id: e.accountId },
    });
    if (account.kind !== 'ISSUANCE' && account.balance + e.amount < 0n)
      throw new ApiFailure('INSUFFICIENT_PLAY_CHIPS', 422);
  }
  const transfer = await tx.playChipTransfer.create({
    data: {
      id: randomUUID(),
      sourceKey: input.sourceKey,
      requestHash: digest,
      kind: input.kind,
      operatorId: input.operatorId,
    },
  });
  await tx.playChipEntry.createMany({
    data: entries.map((e) => ({ ...e, transferId: transfer.id })),
  });
  for (const e of entries)
    await tx.playChipAccount.update({
      where: { id: e.accountId },
      data: { balance: { increment: e.amount } },
    });
  return transfer;
}
/** Server-only accounting primitive, NOT an eligibility verifier or public grant endpoint.
 * Caller must verify an approved earned reward and hold the owner's account lock.
 * No runtime reward source/replenishment amount is configured by B022; tests use labeled fixtures.
 */
export async function issueEarnedChips(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    amount: bigint;
    sourceKey: string;
    operatorId: string;
  },
) {
  if (input.amount <= 0n || input.amount > 1_000_000_000n)
    throw new Error('INVALID_EARNED_AMOUNT');
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${input.userId}::uuid FOR UPDATE`;
  const issuer = await tx.playChipAccount.upsert({
      where: { id: issuerId },
      create: { id: issuerId, kind: 'ISSUANCE' },
      update: {},
    }),
    player = await playerAccount(tx, input.userId);
  return transferChips(tx, {
    sourceKey: input.sourceKey,
    operatorId: input.operatorId,
    kind: 'EARNED_GRANT',
    entries: [
      { accountId: issuer.id, amount: -input.amount },
      { accountId: player.id, amount: input.amount },
    ],
  });
}
