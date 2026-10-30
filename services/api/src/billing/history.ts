import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import {
  purchaseHistorySchema,
  purchaseQuerySchema,
  purchaseViewSchema,
  cosmeticProductViewSchema,
} from '@deckforge/contracts';
import type { AuthService } from '../auth/service';
import { ApiFailure } from '../auth/errors';
import { lockPrincipal } from '../rooms/shared';
@Controller('v1/billing/purchases')
export class PurchaseHistoryController {
  constructor(
    @Inject('AUTH_SERVICE') readonly auth: AuthService | null,
    @Inject('BILLING_ENVIRONMENT')
    readonly environment: 'SANDBOX' | 'PRODUCTION',
  ) {}
  @Get() async history(@Req() req: Request, @Query() query: unknown) {
    if (!this.auth) throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    const input = purchaseQuerySchema.safeParse(query);
    if (!input.success) throw new ApiFailure('INVALID_REQUEST', 400);
    const p = await this.auth.authenticate(req.headers.authorization);
    return this.auth.database.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      if (input.data.cursor) {
        const cursor = await tx.verifiedPurchase.findUnique({
          where: { id: input.data.cursor },
        });
        if (
          !cursor ||
          cursor.userId !== p.userId ||
          cursor.environment !== this.environment
        )
          throw new ApiFailure('PURCHASE_NOT_FOUND', 404);
      }
      const rows = await tx.verifiedPurchase.findMany({
          where: { userId: p.userId, environment: this.environment },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          ...(input.data.cursor
            ? { cursor: { id: input.data.cursor }, skip: 1 }
            : {}),
          take: input.data.limit + 1,
        }),
        page = rows.slice(0, input.data.limit);
      return purchaseHistorySchema.parse({
        items: page.map((row) => ({
          id: row.id,
          status: row.status,
          version: row.version,
          environment: row.environment,
          purchasedAt: row.createdAt.toISOString(),
          product: cosmeticProductViewSchema.parse(row.snapshot),
        })),
        nextCursor: rows.length > input.data.limit ? page.at(-1)!.id : null,
      });
    });
  }
  @Get(':id') async item(@Req() req: Request, @Param('id') id: string) {
    if (!this.auth) throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    if (!z.uuid().safeParse(id).success)
      throw new ApiFailure('INVALID_REQUEST', 400);
    const p = await this.auth.authenticate(req.headers.authorization);
    return this.auth.database.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      const row = await tx.verifiedPurchase.findUnique({ where: { id } });
      if (
        !row ||
        row.userId !== p.userId ||
        row.environment !== this.environment
      )
        throw new ApiFailure('PURCHASE_NOT_FOUND', 404);
      return purchaseViewSchema.parse({
        id: row.id,
        status: row.status,
        version: row.version,
        environment: row.environment,
        purchasedAt: row.createdAt.toISOString(),
        product: cosmeticProductViewSchema.parse(row.snapshot),
      });
    });
  }
}
