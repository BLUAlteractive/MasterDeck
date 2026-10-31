import { randomUUID } from 'node:crypto';
import type { Prisma } from '@deckforge/database';
import { ApiFailure } from '../auth/errors';
import { hash } from '../rooms/shared';
/** Trusted earned supply primitive only. Ink is bound inventory, never a fourth exchange currency. */
export async function changeTrailInk(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    delta: number;
    sourceKey: string;
    reason: 'PACK_OPEN' | 'TRAIL_REWARD' | 'ACCESSIBLE_QUEST' | 'PRESS_CLAIM';
  },
) {
  if (
    !Number.isSafeInteger(input.delta) ||
    input.delta === 0 ||
    Math.abs(input.delta) > 1000000 ||
    input.delta < 0 !== (input.reason === 'PRESS_CLAIM')
  )
    throw new Error('INVALID_SUPPLY_CHANGE');
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${input.userId}::uuid FOR UPDATE`;
  if (
    (await tx.user.findUniqueOrThrow({ where: { id: input.userId } }))
      .status !== 'ACTIVE'
  )
    throw new ApiFailure('USER_INACTIVE', 403);
  const prior = await tx.supplyEvent.findUnique({
      where: { sourceKey: input.sourceKey },
    }),
    requestHash = hash(input);
  if (prior) {
    if (prior.requestHash !== requestHash)
      throw new ApiFailure('IDEMPOTENCY_CONFLICT', 409);
    return prior;
  }
  const row = await tx.supplyBalance.upsert({
    where: { userId_kind: { userId: input.userId, kind: 'TRAIL_INK' } },
    create: { userId: input.userId, kind: 'TRAIL_INK' },
    update: {},
  });
  if (row.units + input.delta < 0)
    throw new ApiFailure('INSUFFICIENT_TRAIL_INK', 422);
  const event = await tx.supplyEvent.create({
    data: {
      id: randomUUID(),
      ...input,
      kind: 'TRAIL_INK',
      version: row.version + 1,
      requestHash,
    },
  });
  await tx.supplyBalance.update({
    where: { userId_kind: { userId: input.userId, kind: 'TRAIL_INK' } },
    data: { units: { increment: input.delta }, version: { increment: 1 } },
  });
  return event;
}
