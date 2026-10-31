import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  screenPurchaseSchema,
  screenPurchaseReceiptSchema,
  screenPatternSchema,
  ownedScreenViewSchema,
  screenInventorySchema,
  screenInventoryQuerySchema,
} from '@deckforge/contracts';
import type { AuthService, Principal } from '../auth/service';
import { ApiFailure } from '../auth/errors';
import { hash, json, lockPrincipal } from '../rooms/shared';
import { moveRestrictedCurrency } from '../wallets';
import { ScreenCatalogService } from './catalog';
export class OwnedScreenService {
  constructor(readonly catalog: ScreenCatalogService) {}
  async buy(p: Principal, patternId: string, body: unknown) {
    const parsed = screenPurchaseSchema.safeParse(body);
    if (!z.uuid().safeParse(patternId).success || !parsed.success)
      throw new ApiFailure('INVALID_REQUEST', 400);
    const input = parsed.data,
      digest = hash({ patternId, ...input });
    const receipt = await this.catalog.db.$transaction(
      async (tx) => {
        await lockPrincipal(tx, p);
        const old = await tx.ownedScreen.findUnique({
          where: {
            userId_commandId: { userId: p.userId, commandId: input.commandId },
          },
        });
        if (old) {
          if (old.requestHash !== digest)
            throw new ApiFailure('IDEMPOTENCY_CONFLICT', 409);
          return screenPurchaseReceiptSchema.parse(old.result);
        }
        if (
          (await tx.user.findUniqueOrThrow({ where: { id: p.userId } })).isGuest
        )
          throw new ApiFailure('PERMANENT_ACCOUNT_REQUIRED', 403);
        if (!this.catalog.policy?.allowedPatternIds.includes(patternId))
          throw new ApiFailure('SCREEN_PURCHASE_NOT_CONFIGURED', 503);
        await tx.$queryRaw`SELECT id FROM "ScreenPattern" WHERE id=${patternId}::uuid FOR SHARE`;
        const pattern = await tx.screenPattern.findUnique({
          where: { id: patternId },
        });
        if (!pattern || pattern.status !== 'PUBLISHED')
          throw new ApiFailure('SCREEN_UNAVAILABLE', 404);
        const definition = screenPatternSchema.parse(pattern.definition);
        if (hash(definition) !== pattern.definitionHash)
          throw new Error('SCREEN_INTEGRITY');
        if (input.expectedDefinitionHash !== pattern.definitionHash)
          throw new ApiFailure('SCREEN_OFFER_CHANGED', 409);
        const id = randomUUID(),
          [clock] = await tx.$queryRaw<
            { now: Date }[]
          >`SELECT clock_timestamp() AS now`;
        const transfer = await moveRestrictedCurrency(tx, {
          userId: p.userId,
          currency: 'TRAIL_CREDITS',
          purpose: 'BUY_SCREEN',
          amount: BigInt(definition.creditPrice),
          sourceKey: 'screen:' + id + ':debit',
          operatorId: 'system.earned-screen',
          proofReference: pattern.definitionHash,
          policyVersion: this.catalog.policy.version,
        });
        const result = screenPurchaseReceiptSchema.parse({
          screen: {
            screenId: id,
            patternId,
            status: 'AVAILABLE',
            stateVersion: 1,
            definitionHash: pattern.definitionHash,
            definition,
            acquiredAt: clock!.now.toISOString(),
          },
          charged: String(definition.creditPrice),
          currency: 'TRAIL_CREDITS',
          transferId: transfer.transferId,
        });
        await tx.ownedScreen.create({
          data: {
            id,
            userId: p.userId,
            patternId,
            definitionHash: pattern.definitionHash,
            snapshot: json(definition),
            commandId: input.commandId,
            requestHash: digest,
            transferId: transfer.transferId,
            result: json(result),
            createdAt: clock!.now,
          },
        });
        await tx.screenEvent.create({
          data: {
            id: randomUUID(),
            screenId: id,
            userId: p.userId,
            version: 1,
            action: 'PURCHASE',
            sourceKey: 'screen:' + id + ':purchase',
            requestHash: digest,
            after: { status: 'AVAILABLE', stateVersion: 1 },
          },
        });
        return result;
      },
      { timeout: 30000 },
    );
    console.info(
      JSON.stringify({ event: 'press.screen_purchase', status: 'recorded' }),
    );
    return receipt;
  }
  async inventory(p: Principal, query: unknown) {
    const parsed = screenInventoryQuerySchema.safeParse(query);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    const input = parsed.data;
    return this.catalog.db.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      if (input.cursor) {
        const cursor = await tx.ownedScreen.findUnique({
          where: { id: input.cursor },
        });
        if (!cursor || cursor.userId !== p.userId)
          throw new ApiFailure('SCREEN_UNAVAILABLE', 404);
      }
      const rows = await tx.ownedScreen.findMany({
          where: { userId: p.userId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: input.limit + 1,
          ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        }),
        page = rows.slice(0, input.limit);
      return screenInventorySchema.parse({
        screens: page.map((r) =>
          ownedScreenViewSchema.parse({
            screenId: r.id,
            patternId: r.patternId,
            status: r.status,
            stateVersion: r.stateVersion,
            definitionHash: r.definitionHash,
            definition: screenPatternSchema.parse(r.snapshot),
            acquiredAt: r.createdAt.toISOString(),
          }),
        ),
        nextCursor: rows.length > input.limit ? page.at(-1)!.id : null,
      });
    });
  }
}
@Controller('v1/press/screens')
export class OwnedScreenController {
  constructor(
    @Inject('AUTH_SERVICE') readonly auth: AuthService | null,
    @Inject('OWNED_SCREENS') readonly service: OwnedScreenService | null,
  ) {}
  private enabled() {
    if (!this.auth || !this.service)
      throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    return { auth: this.auth, service: this.service };
  }
  @Get() async inventory(@Req() req: Request, @Query() query: unknown) {
    const s = this.enabled();
    return s.service.inventory(
      await s.auth.authenticate(req.headers.authorization),
      query,
    );
  }
  @Post(':patternId/buy') @HttpCode(200) async buy(
    @Req() req: Request,
    @Param('patternId') id: string,
    @Body() body: unknown,
  ) {
    const s = this.enabled();
    return s.service.buy(
      await s.auth.authenticate(req.headers.authorization),
      id,
      body,
    );
  }
}
