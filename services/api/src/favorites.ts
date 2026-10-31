import { recordCollection } from './collector-activity';
import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Param,
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import {
  favoriteCommandSchema,
  favoriteResponseSchema,
} from '@deckforge/contracts';
import type { AuthService } from './auth/service';
import { ApiFailure } from './auth/errors';
@Controller('v1/cards')
export class FavoriteController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly auth: AuthService | null,
  ) {}
  @Put(':cardId/favorite')
  @HttpCode(200)
  async save(
    @Req() req: Request,
    @Param('cardId') cardId: string,
    @Body() body: unknown,
  ) {
    if (!this.auth) throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    const input = favoriteCommandSchema.safeParse(body);
    if (!z.uuid().safeParse(cardId).success || !input.success)
      throw new ApiFailure('INVALID_REQUEST', 400);
    cardId = cardId.toLowerCase();
    const principal = await this.auth.authenticate(req.headers.authorization);
    const result = await this.auth.database.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${principal.userId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "AuthSession" WHERE "id"=${principal.sessionId}::uuid FOR SHARE`;
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
        session.identityId !== principal.identityId ||
        (!user.isGuest && principal.claims.is_anonymous) ||
        principal.claims.exp <= Math.floor(Date.now() / 1000)
      )
        throw new ApiFailure('UNAUTHORIZED', 401);
      await tx.$queryRaw`SELECT "id" FROM "CardInstance" WHERE "id"=${cardId}::uuid AND "ownerId"=${user.id}::uuid FOR SHARE`;
      const card = await tx.cardInstance.findFirst({
        where: { id: cardId, ownerId: user.id },
      });
      if (!card) throw new ApiFailure('CARD_NOT_FOUND', 404);
      await tx.cardFavorite.upsert({
        where: { userId_instanceId: { userId: user.id, instanceId: card.id } },
        create: {
          userId: user.id,
          instanceId: card.id,
          favorite: input.data.favorite,
        },
        update: { favorite: input.data.favorite },
      });
      await recordCollection(tx, user.id);
      return { instanceId: card.id, favorite: input.data.favorite };
    });
    console.info(
      JSON.stringify({ event: 'collection.favorite', status: 'ok' }),
    );
    return favoriteResponseSchema.parse(result);
  }
}
