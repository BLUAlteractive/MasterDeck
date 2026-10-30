import { createHash } from 'node:crypto';
import type { Prisma } from '@deckforge/database';
import type { Principal } from '../auth/service';
import { ApiFailure } from '../auth/errors';
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export function hash(value: unknown) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}
export function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
export async function lockPrincipal(
  tx: Prisma.TransactionClient,
  p: Principal,
) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${p.userId}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "AuthSession" WHERE "id"=${p.sessionId}::uuid FOR SHARE`;
  const user = await tx.user.findUnique({ where: { id: p.userId } }),
    session = await tx.authSession.findUnique({ where: { id: p.sessionId } });
  if (
    !user ||
    user.status !== 'ACTIVE' ||
    !session ||
    session.revokedAt ||
    session.identityId !== p.identityId ||
    (!user.isGuest && p.claims.is_anonymous) ||
    p.claims.exp <= Math.floor(Date.now() / 1000)
  )
    throw new ApiFailure('UNAUTHORIZED', 401);
}

export class RoomVersionConflict extends ApiFailure {
  constructor(readonly resync: unknown) {
    super('STALE_VERSION', 409);
  }
}
