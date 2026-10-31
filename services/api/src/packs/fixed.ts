import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import {
  fixedPackOfferSchema,
  fixedPackQuerySchema,
  packDefinitionSchema,
} from '@deckforge/contracts';
import type { AuthService, Principal } from '../auth/service';
import type { BillingService } from '../billing/service';
import { ApiFailure } from '../auth/errors';
import { hash, lockPrincipal } from '../rooms/shared';
import { PackCatalogService, validatePackContents } from './catalog';
/** Resolve current sale admission only; already-paid proofs always use the immutable billing SKU. */
export class FixedPackService {
  constructor(
    readonly catalog: PackCatalogService,
    readonly billing: BillingService | null,
  ) {}
  async offer(p: Principal, packId: string, query: unknown) {
    const parsed = fixedPackQuerySchema.safeParse(query);
    if (!z.uuid().safeParse(packId).success || !parsed.success)
      throw new ApiFailure('INVALID_REQUEST', 400);
    if (!this.billing) throw new ApiFailure('BILLING_NOT_CONFIGURED', 503);
    const input = parsed.data;
    if (!this.billing.config.providers[input.platform])
      throw new ApiFailure('BILLING_NOT_CONFIGURED', 503);
    return this.catalog.db.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      if (
        (await tx.user.findUniqueOrThrow({ where: { id: p.userId } })).isGuest
      )
        throw new ApiFailure('PERMANENT_ACCOUNT_REQUIRED', 403);
      if (!this.catalog.policy?.allowedPackIds.includes(packId))
        throw new ApiFailure('PACK_UNAVAILABLE', 404);
      await tx.$queryRaw`SELECT id FROM "PackDefinition" WHERE id=${packId}::uuid FOR SHARE`;
      const pack = await tx.packDefinition.findUnique({
        where: { id: packId },
      });
      if (!pack || pack.status !== 'PUBLISHED')
        throw new ApiFailure('PACK_UNAVAILABLE', 404);
      const definition = packDefinitionSchema.parse(pack.definition);
      if (hash(definition) !== pack.definitionHash)
        throw new Error('PACK_INTEGRITY');
      if (input.expectedDefinitionHash !== pack.definitionHash)
        throw new ApiFailure('PACK_OFFER_CHANGED', 409);
      if (definition.kind !== 'FIXED_COSMETIC')
        throw new ApiFailure('FIXED_PACK_REQUIRED', 422);
      if (
        !this.billing!.catalog.allowedProductIds.includes(
          definition.cosmeticProductId,
        )
      )
        throw new ApiFailure('PRODUCT_UNAVAILABLE', 404);
      if (definition.regions.length)
        throw new ApiFailure('PACK_REGION_UNVERIFIED', 403);
      const [clock] = await tx.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      if (
        clock!.now < new Date(definition.startsAt) ||
        clock!.now >= new Date(definition.endsAt) ||
        (
          await tx.productAvailability.findUnique({
            where: { productId: definition.cosmeticProductId },
          })
        )?.enabled === false
      )
        throw new ApiFailure('PACK_UNAVAILABLE', 409);
      const fixed = await validatePackContents(
        tx,
        definition,
        this.catalog.storefront,
      );
      if (!fixed) throw new Error('FIXED_PACK_INTEGRITY');
      return fixedPackOfferSchema.parse({
        packId,
        definitionHash: pack.definitionHash,
        product: input.platform === 'APPLE' ? fixed.apple : fixed.google,
        fulfillment: 'VERIFIED_PLATFORM_BILLING',
        functionalEffects: false,
      });
    });
  }
}
@Controller('v1/packs')
export class FixedPackController {
  constructor(
    @Inject('AUTH_SERVICE') readonly auth: AuthService | null,
    @Inject('FIXED_PACKS') readonly service: FixedPackService | null,
  ) {}
  @Get(':id/fixed-offer') async offer(
    @Req() req: Request,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    if (!this.auth || !this.service)
      throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    return this.service.offer(
      await this.auth.authenticate(req.headers.authorization),
      id,
      query,
    );
  }
}
