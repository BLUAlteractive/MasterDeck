import { randomUUID } from 'node:crypto';
import type { Prisma } from '@deckforge/database';
import type { Principal } from '../auth/service';
import { ApiFailure } from '../auth/errors';
import { lockPrincipal, hash, json } from '../rooms/shared';
import { adminCapabilities } from '@deckforge/contracts';
export type Capability = (typeof adminCapabilities)[number];
/** Operator-provisioned scopes only. There is deliberately no public role/grant endpoint. */
export async function adminAccess(
  tx: Prisma.TransactionClient,
  p: Principal,
  capability: Capability,
) {
  await lockPrincipal(tx, p);
  await tx.$queryRaw`SELECT "userId" FROM "AdminCapability" WHERE "userId"=${p.userId}::uuid AND "capability"=${capability} FOR SHARE`;
  const user = await tx.user.findUniqueOrThrow({ where: { id: p.userId } }),
    grant = await tx.adminCapability.findUnique({
      where: { userId_capability: { userId: p.userId, capability } },
    });
  if (
    user.isGuest ||
    user.role !== 'ADMIN' ||
    p.claims.aal !== 'aal2' ||
    !grant ||
    grant.revokedAt
  )
    throw new ApiFailure('FORBIDDEN', 403);
}
export async function adminPrior(
  tx: Prisma.TransactionClient,
  p: Principal,
  request: unknown,
  commandId: string,
) {
  const prior = await tx.adminAction.findUnique({
    where: { actorId_commandId: { actorId: p.userId, commandId } },
  });
  if (prior && prior.requestHash !== hash(request))
    throw new ApiFailure('IDEMPOTENCY_CONFLICT', 409);
  return prior;
}
export async function adminRecord(
  tx: Prisma.TransactionClient,
  p: Principal,
  input: { commandId: string; reason: string; action: string },
  capability: Capability,
  scope: string,
  request: unknown,
  result: unknown,
) {
  await tx.adminAction.create({
    data: {
      id: randomUUID(),
      actorId: p.userId,
      commandId: input.commandId,
      reason: input.reason,
      action: input.action,
      capability,
      scope,
      requestHash: hash(request),
      result: json(result),
    },
  });
}
