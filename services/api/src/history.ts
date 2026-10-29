import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import {
  cardHistoryQuerySchema,
  cardHistoryResponseSchema,
  historyStateSchema,
} from '@deckforge/contracts';
import type { AuthService } from './auth/service';
import { ApiFailure } from './auth/errors';
@Controller('v1/cards')
export class CardHistoryController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly auth: AuthService | null,
  ) {}
  @Get(':cardId/provenance')
  async history(
    @Req() req: Request,
    @Param('cardId') cardId: string,
    @Query() query: unknown,
  ) {
    if (!this.auth) throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    const input = cardHistoryQuerySchema.safeParse(query);
    if (!z.uuid().safeParse(cardId).success || !input.success)
      throw new ApiFailure('INVALID_REQUEST', 400);
    const principal = await this.auth.authenticate(req.headers.authorization);
    const started = Date.now();
    const result = await this.auth.database.$transaction(
      async (tx) => {
        // Shared account/session locks keep revocation/deletion ordered with this private read.
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${principal.userId}::uuid FOR SHARE`;
        await tx.$queryRaw`SELECT "id" FROM "AuthSession" WHERE "id" = ${principal.sessionId}::uuid FOR SHARE`;
        const user = await tx.user.findUnique({
          where: { id: principal.userId },
        });
        const session = await tx.authSession.findUnique({
          where: { id: principal.sessionId },
        });
        if (
          !user ||
          user.status !== 'ACTIVE' ||
          !session ||
          session.revokedAt ||
          (!user.isGuest && principal.claims.is_anonymous) ||
          principal.claims.exp <= Math.floor(Date.now() / 1000)
        )
          throw new ApiFailure('UNAUTHORIZED', 401);
        await tx.$queryRaw`SELECT "id" FROM "CardInstance" WHERE "id" = ${cardId}::uuid AND "ownerId" = ${user.id}::uuid FOR SHARE`;
        const card = await tx.cardInstance.findFirst({
          where: { id: cardId, ownerId: user.id },
        });
        if (!card) throw new ApiFailure('CARD_NOT_FOUND', 404);
        const events = await tx.ownershipEvent.findMany({
          where: {
            instanceId: card.id,
            stateVersion: { gt: input.data.afterVersion },
          },
          orderBy: { stateVersion: 'asc' },
          take: input.data.limit + 1,
        });
        const page = events.slice(0, input.data.limit);
        return cardHistoryResponseSchema.parse({
          instanceId: card.id,
          faceId: card.faceId,
          seriesId: card.seriesId,
          editionSerial: card.editionSerial,
          originEventId: card.originEventId,
          currentStatus: card.status,
          currentVersion: card.stateVersion,
          events: page.map((event) => {
            const raw =
              event.snapshot &&
              typeof event.snapshot === 'object' &&
              !Array.isArray(event.snapshot)
                ? event.snapshot
                : {};
            const state = historyStateSchema.safeParse({
              status: raw.status,
              level: raw.level,
              branch: raw.branch,
              rarity: raw.rarity,
            });
            return {
              eventId: event.id,
              action: event.action,
              stateVersion: event.stateVersion,
              recordedAt: event.recordedAt.toISOString(),
              actor:
                event.actorUserId === user.id
                  ? 'SELF'
                  : event.actorUserId
                    ? 'OPERATOR'
                    : event.operatorId
                      ? 'SYSTEM'
                      : 'UNKNOWN',
              state: state.success ? state.data : null,
            };
          }),
          nextVersion:
            events.length > input.data.limit ? page.at(-1)!.stateVersion : null,
        });
      },
      { isolationLevel: 'ReadCommitted', maxWait: 15000, timeout: 15000 },
    );
    console.info(
      JSON.stringify({
        event: 'inventory.history',
        status: 'ok',
        count: result.events.length,
        durationMs: Date.now() - started,
      }),
    );
    return result;
  }
}
