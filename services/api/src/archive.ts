import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Prisma } from '@deckforge/database';
import {
  archiveQuerySchema,
  archiveResponseSchema,
  catalogQuerySchema,
  albumResponseSchema,
} from '@deckforge/contracts';
import type { AuthService } from './auth/service';
import { ApiFailure } from './auth/errors';

@Controller('v1/collection')
export class ArchiveController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly auth: AuthService | null,
  ) {}

  private async read<T>(
    authorization: string | undefined,
    event: string,
    query: (tx: Prisma.TransactionClient, userId: string) => Promise<T>,
  ) {
    if (!this.auth) throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    const principal = await this.auth.authenticate(authorization);
    const started = Date.now();
    const result = await this.auth.database.$transaction(
      async (tx) => {
        // Same account/session order as logout/history; a private read cannot race past revocation.
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
        return query(tx, user.id);
      },
      { isolationLevel: 'ReadCommitted', maxWait: 15000, timeout: 15000 },
    );
    console.info(
      JSON.stringify({ event, status: 'ok', durationMs: Date.now() - started }),
    );
    return result;
  }

  @Get('archive')
  async archive(@Req() req: Request, @Query() query: unknown) {
    const input = archiveQuerySchema.safeParse(query);
    if (!input.success) throw new ApiFailure('INVALID_REQUEST', 400);
    const { limit, cursor, view, seriesId } = input.data;
    return this.read(
      req.headers.authorization,
      'collection.archive',
      async (tx, userId) => {
        const rows = await tx.cardInstance.findMany({
          where: {
            ownerId: userId,
            ...(cursor ? { id: { gt: cursor } } : {}),
            ...(seriesId ? { seriesId } : {}),
            ...(view === 'all'
              ? {}
              : {
                  status: {
                    in:
                      view === 'current'
                        ? ['OWNED', 'LOCKED']
                        : ['CONSUMED', 'REVOKED'],
                  },
                }),
          },
          orderBy: { id: 'asc' },
          take: limit + 1,
          select: {
            id: true,
            faceId: true,
            level: true,
            branch: true,
            rarity: true,
            stateVersion: true,
            status: true,
            seriesId: true,
            editionSerial: true,
            createdAt: true,
            template: {
              select: {
                version: true,
                series: { select: { displayName: true } },
              },
            },
            originEvent: {
              select: { id: true, action: true, recordedAt: true },
            },
          },
        });
        const page = rows.slice(0, limit);
        return archiveResponseSchema.parse({
          items: page.map(
            ({ id, template, originEvent, createdAt, ...card }) => ({
              ...card,
              instanceId: id,
              seriesName: template.series.displayName,
              templateVersion: template.version,
              holding:
                card.status === 'OWNED' || card.status === 'LOCKED'
                  ? 'OWNED_NOW'
                  : 'PREVIOUSLY_OWNED',
              createdAt: createdAt.toISOString(),
              origin: originEvent
                ? {
                    eventId: originEvent.id,
                    action: originEvent.action,
                    recordedAt: originEvent.recordedAt.toISOString(),
                  }
                : null,
            }),
          ),
          nextCursor: rows.length > limit ? page.at(-1)!.id : null,
        });
      },
    );
  }

  @Get('album')
  async album(@Req() req: Request, @Query() query: unknown) {
    const input = catalogQuerySchema.safeParse(query);
    if (!input.success) throw new ApiFailure('INVALID_REQUEST', 400);
    const { limit, cursor } = input.data;
    return this.read(
      req.headers.authorization,
      'collection.album',
      async (tx, userId) => {
        // Aggregate the whole owner archive in SQL, never a truncated client inventory page.
        const rows = await tx.$queryRaw<
          {
            seriesId: string;
            seriesName: string;
            recordedInstances: number;
            currentInstances: number;
            recordedFaces: number;
            currentFaces: number;
          }[]
        >(Prisma.sql`
        SELECT c."seriesId", s."displayName" AS "seriesName",
          count(*)::int AS "recordedInstances",
          count(*) FILTER (WHERE c."status" IN ('OWNED', 'LOCKED'))::int AS "currentInstances",
          count(DISTINCT c."faceId")::int AS "recordedFaces",
          count(DISTINCT c."faceId") FILTER (WHERE c."status" IN ('OWNED', 'LOCKED'))::int AS "currentFaces"
        FROM "CardInstance" c JOIN "CardSeries" s ON s."id" = c."seriesId"
        WHERE c."ownerId" = ${userId}::uuid
          ${cursor ? Prisma.sql`AND c."seriesId" > ${cursor}::uuid` : Prisma.empty}
        GROUP BY c."seriesId", s."displayName"
        ORDER BY c."seriesId" ASC LIMIT ${limit + 1}
      `);
        const page = rows.slice(0, limit);
        return albumResponseSchema.parse({
          items: page.map((series) => ({
            ...series,
            completeNow: series.currentFaces === 52,
            completeRecorded: series.recordedFaces === 52,
          })),
          nextCursor: rows.length > limit ? page.at(-1)!.seriesId : null,
        });
      },
    );
  }
}
