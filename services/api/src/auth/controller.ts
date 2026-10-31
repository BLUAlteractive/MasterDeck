import { recordCollection } from '../collector-activity';
import { lockPrincipal } from '../rooms/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  logoutResponseSchema,
  deletionResponseSchema,
  adminAccessSchema,
  emptyCommandSchema,
  guestLinkSchema,
  inventoryQuerySchema,
  profileSchema,
  privateCardsSchema,
} from '@deckforge/contracts';
import { ApiFailure } from './errors';
import { AuthService } from './service';

@Controller('v1')
export class IdentityController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly auth: AuthService | null,
  ) {}
  private service() {
    if (!this.auth) throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    return this.auth;
  }
  private validate<T>(result: { success: true; data: T } | { success: false }) {
    if (!result.success) throw new ApiFailure('INVALID_REQUEST', 400);
    return result.data;
  }
  @Post('auth/session')
  @HttpCode(200)
  async session(@Req() req: Request, @Body() body: unknown) {
    this.validate(emptyCommandSchema.safeParse(body ?? {}));
    return profileSchema.parse(
      await this.service().startSession(req.headers.authorization),
    );
  }
  @Get('me')
  async me(@Req() req: Request) {
    const service = this.service();
    return profileSchema.parse(
      service.profile(await service.authenticate(req.headers.authorization)),
    );
  }
  @Post('auth/guest-link')
  @HttpCode(200)
  async link(@Req() req: Request, @Body() body: unknown) {
    const input = this.validate(guestLinkSchema.safeParse(body));
    const service = this.service();
    return profileSchema.parse(
      await service.linkGuest(
        await service.authenticate(req.headers.authorization),
        input,
      ),
    );
  }
  @Post('auth/logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Body() body: unknown) {
    this.validate(emptyCommandSchema.safeParse(body ?? {}));
    const service = this.service();
    return logoutResponseSchema.parse(
      await service.logout(
        await service.authenticate(req.headers.authorization),
      ),
    );
  }
  @Get('cards')
  async cards(@Req() req: Request, @Query() query: unknown) {
    const input = this.validate(inventoryQuerySchema.safeParse(query));
    const service = this.service();
    const principal = await service.authenticate(req.headers.authorization);
    const rows = await service.database.$transaction(async (tx) => {
      await lockPrincipal(tx, principal);
      const rows = await tx.cardInstance.findMany({
        where: {
          ownerId: principal.userId,
          owner: { status: 'ACTIVE' },
          status: { in: ['OWNED', 'LOCKED'] },
          ...(input.cursor ? { id: { gt: input.cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: input.limit + 1,
        select: {
          id: true,
          faceId: true,
          level: true,
          branch: true,
          rarity: true,
          stateVersion: true,
          status: true,
          seriesId: true,
          template: {
            select: {
              version: true,
              series: { select: { displayName: true } },
            },
          },
          favorites: {
            where: { userId: principal.userId },
            select: { favorite: true },
          },
        },
      });
      if (rows.length) await recordCollection(tx, principal.userId);
      return rows;
    });
    const page = rows.slice(0, input.limit);
    return privateCardsSchema.parse({
      items: page.map(({ id, template, favorites, ...card }) => ({
        instanceId: id,
        ...card,
        seriesName: template.series.displayName,
        templateVersion: template.version,
        favorite: favorites[0]?.favorite ?? false,
      })),
      nextCursor: rows.length > input.limit ? page.at(-1)?.id : null,
    });
  }
  @Get('admin/access')
  async admin(@Req() req: Request) {
    const service = this.service();
    service.requireAdmin(await service.authenticate(req.headers.authorization));
    return adminAccessSchema.parse({ role: 'ADMIN', mfa: true });
  }
  @Post('me/deletion-request')
  @HttpCode(202)
  async deletion(@Req() req: Request, @Body() body: unknown) {
    this.validate(emptyCommandSchema.safeParse(body ?? {}));
    const service = this.service();
    return deletionResponseSchema.parse(
      await service.requestDeletion(
        await service.authenticate(req.headers.authorization),
      ),
    );
  }
}
