import { retryableTransaction } from '../database-retry';
import { createHash } from 'node:crypto';
import { type PrismaClient } from '@deckforge/database';
import { ApiFailure } from './errors';
import {
  bearerToken,
  type IdentityClaims,
  type TokenVerifier,
} from './token-verifier';

export type Principal = {
  userId: string;
  identityId: string;
  sessionId: string;
  claims: IdentityClaims;
  isGuest: boolean;
  role: 'PLAYER' | 'ADMIN';
};
export class AuthService {
  constructor(
    readonly database: PrismaClient,
    private readonly verifier: TokenVerifier,
  ) {}
  async claims(header: unknown) {
    return this.verifier.verify(bearerToken(header));
  }
  async authenticate(header: unknown): Promise<Principal> {
    const claims = await this.claims(header);
    const identity = await this.database.externalIdentity.findUnique({
      where: { issuer_subject: { issuer: claims.iss, subject: claims.sub } },
      include: { user: true },
    });
    if (
      !identity ||
      identity.user.status !== 'ACTIVE' ||
      (!identity.user.isGuest && claims.is_anonymous)
    )
      throw new ApiFailure('UNAUTHORIZED', 401);
    const session = await this.database.authSession.findUnique({
      where: {
        identityId_providerSessionId: {
          identityId: identity.id,
          providerSessionId: claims.session_id,
        },
      },
    });
    if (!session || session.revokedAt)
      throw new ApiFailure('UNAUTHORIZED', 401);
    return {
      userId: identity.userId,
      identityId: identity.id,
      sessionId: session.id,
      claims,
      isGuest: identity.user.isGuest,
      role: identity.user.role,
    };
  }
  profile(principal: Pick<Principal, 'userId' | 'isGuest' | 'role'>) {
    return {
      userId: principal.userId,
      isGuest: principal.isGuest,
      role: principal.role,
    };
  }
  async startSession(header: unknown) {
    const claims = await this.claims(header);
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const profile = await this.database.$transaction(
          async (tx) => {
            let identity = await tx.externalIdentity.findUnique({
              where: {
                issuer_subject: { issuer: claims.iss, subject: claims.sub },
              },
              include: { user: true },
            });
            if (!identity) {
              identity = await tx.externalIdentity.create({
                data: {
                  issuer: claims.iss,
                  subject: claims.sub,
                  user: { create: { isGuest: claims.is_anonymous } },
                },
                include: { user: true },
              });
            }
            if (
              identity.user.status !== 'ACTIVE' ||
              (!identity.user.isGuest && claims.is_anonymous)
            )
              throw new ApiFailure('UNAUTHORIZED', 401);
            const session = await tx.authSession.upsert({
              where: {
                identityId_providerSessionId: {
                  identityId: identity.id,
                  providerSessionId: claims.session_id,
                },
              },
              create: {
                identityId: identity.id,
                providerSessionId: claims.session_id,
              },
              update: {},
            });
            if (session.revokedAt) throw new ApiFailure('UNAUTHORIZED', 401);
            return this.profile({
              userId: identity.userId,
              isGuest: identity.user.isGuest,
              role: identity.user.role,
            });
          },
          { isolationLevel: 'Serializable' },
        );
        console.info(JSON.stringify({ event: 'auth.session', status: 'ok' }));
        return profile;
      } catch (error) {
        if (retryableTransaction(error) && attempt < 5) {
          await new Promise((resolve) =>
            setTimeout(resolve, 10 * (attempt + 1)),
          );
          continue;
        }
        throw error;
      }
    }
    throw new ApiFailure('CONFLICT', 409);
  }
  async linkGuest(
    principal: Principal,
    input: { expectedUserId: string; idempotencyKey: string },
  ) {
    if (principal.claims.is_anonymous)
      throw new ApiFailure('PERMANENT_IDENTITY_REQUIRED', 403);
    if (input.expectedUserId !== principal.userId)
      throw new ApiFailure('LINK_IDENTITY_CONFLICT', 409);
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ expectedUserId: input.expectedUserId }))
      .digest('hex');
    return this.database.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${principal.userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({
        where: { id: principal.userId },
      });
      const session = await tx.authSession.findUniqueOrThrow({
        where: { id: principal.sessionId },
      });
      if (user.status !== 'ACTIVE' || session.revokedAt)
        throw new ApiFailure('UNAUTHORIZED', 401);
      const prior = await tx.operationRecord.findUnique({
        where: {
          userId_operation_key: {
            userId: user.id,
            operation: 'auth.guest-link',
            key: input.idempotencyKey,
          },
        },
      });
      if (prior) {
        if (prior.requestHash !== requestHash)
          throw new ApiFailure('IDEMPOTENCY_CONFLICT', 409);
        return prior.result;
      }
      const linked = await tx.user.update({
        where: { id: user.id },
        data: { isGuest: false },
      });
      const result = this.profile({
        userId: user.id,
        isGuest: linked.isGuest,
        role: linked.role,
      });
      await tx.operationRecord.create({
        data: {
          userId: user.id,
          operation: 'auth.guest-link',
          key: input.idempotencyKey,
          requestHash,
          result,
        },
      });
      await tx.authAudit.create({
        data: { userId: user.id, event: 'GUEST_LINKED' },
      });
      return result;
    });
  }
  async logout(principal: Principal) {
    await this.database.$transaction(async (tx) => {
      // Serialize with grants/linking/deletion before locking a session or writing audit FKs.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${principal.userId}::uuid FOR UPDATE`;
      const changed = await tx.authSession.updateMany({
        where: { id: principal.sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (changed.count)
        await tx.authAudit.create({
          data: { userId: principal.userId, event: 'SESSION_REVOKED' },
        });
    });
    return { status: 'revoked' as const };
  }
  async requestDeletion(principal: Principal) {
    return this.database.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${principal.userId}::uuid FOR UPDATE`;
      const request = await tx.deletionRequest.upsert({
        where: { userId: principal.userId },
        create: { userId: principal.userId },
        update: {},
      });
      await tx.user.update({
        where: { id: principal.userId },
        data: { status: 'SUSPENDED' },
      });
      await tx.authSession.updateMany({
        where: { identity: { userId: principal.userId }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.authAudit.create({
        data: { userId: principal.userId, event: 'DELETION_REQUESTED' },
      });
      return { requestId: request.id, status: 'pending' as const };
    });
  }
  requireAdmin(principal: Principal) {
    if (
      principal.isGuest ||
      principal.role !== 'ADMIN' ||
      principal.claims.aal !== 'aal2'
    )
      throw new ApiFailure('FORBIDDEN', 403);
  }
}
