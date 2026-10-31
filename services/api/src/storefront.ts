import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  storefrontQuerySchema,
  storefrontViewSchema,
  cosmeticInventorySchema,
  cosmeticInventoryQuerySchema,
  cosmeticItemViewSchema,
  cosmeticProductViewSchema,
  type StorefrontPolicy,
} from '@deckforge/contracts';
import type { Prisma, PrismaClient } from '@deckforge/database';
import type { AuthService } from './auth/service';
import { ApiFailure } from './auth/errors';
import { lockPrincipal } from './rooms/shared';
export async function approvedCosmeticProduct(
  tx: Prisma.TransactionClient,
  policy: StorefrontPolicy,
  platform: 'APPLE' | 'GOOGLE',
  sku: string,
) {
  const product = await tx.cosmeticProduct.findFirst({
    where: {
      id: { in: policy.allowedProductIds },
      status: 'PUBLISHED',
      ...(platform === 'APPLE'
        ? { appleProductId: sku }
        : { googleProductId: sku }),
    },
    include: { items: { include: { item: true }, orderBy: { itemId: 'asc' } } },
  });
  // Sale visibility is separate: a delayed legitimate platform proof must still fulfill.
  if (
    !product ||
    !product.approvalReference ||
    product.items.some((i) => !i.item.approvalReference)
  )
    throw new ApiFailure('PRODUCT_UNAVAILABLE', 404);
  return cosmeticProductViewSchema.parse({
    id: product.id,
    version: product.version,
    name: product.name,
    description: product.description,
    platformProductId: sku,
    referencePrice: {
      currency: product.priceCurrency,
      amountMinor: product.priceMinor,
      minorUnits: product.priceScale,
    },
    contents: product.items.map((i) =>
      cosmeticItemViewSchema.parse({
        id: i.item.id,
        name: i.item.name,
        presentation: i.item.presentation,
      }),
    ),
  });
}
@Controller('v1')
export class StorefrontController {
  constructor(
    @Inject('CATALOG_DATABASE') readonly db: PrismaClient | null,
    @Inject('AUTH_SERVICE') readonly auth: AuthService | null,
    @Inject('STOREFRONT_POLICY') readonly policy: StorefrontPolicy | null,
    @Inject('BILLING_ENVIRONMENT')
    readonly billingEnvironment: 'SANDBOX' | 'PRODUCTION',
  ) {}
  @Get('storefront') async catalog(@Query() query: unknown) {
    const parsed = storefrontQuerySchema.safeParse(query);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    const products = [];
    if (this.db && this.policy) {
      const rows = await this.db.cosmeticProduct.findMany({
        where: {
          id: { in: this.policy.allowedProductIds },
          status: 'PUBLISHED',
        },
        orderBy: { id: 'asc' },
        take: 100,
      });
      for (const row of rows) {
        if (
          (
            await this.db.productAvailability.findUnique({
              where: { productId: row.id },
            })
          )?.enabled === false
        )
          continue;
        products.push(
          await approvedCosmeticProduct(
            this.db,
            this.policy,
            parsed.data.platform,
            parsed.data.platform === 'APPLE'
              ? row.appleProductId
              : row.googleProductId,
          ),
        );
      }
    }
    return storefrontViewSchema.parse({
      available: this.db !== null && this.policy !== null,
      products,
      checkout: 'UNAVAILABLE_IN_THIS_BUILD',
      functionalEffects: false,
      paidRandomizedContents: false,
    });
  }
  @Get('cosmetics') async owned(@Req() req: Request, @Query() query: unknown) {
    if (!this.auth) throw new ApiFailure('AUTH_NOT_CONFIGURED', 503);
    const parsed = cosmeticInventoryQuerySchema.safeParse(query);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    const p = await this.auth.authenticate(req.headers.authorization);
    return this.auth.database.$transaction(async (tx) => {
      await lockPrincipal(tx, p);
      const rows = await tx.cosmeticItem.findMany({
        where: {
          grants: {
            some: {
              userId: p.userId,
              status: 'ACTIVE',
              purchase: { environment: this.billingEnvironment },
            },
          },
          ...(parsed.data.cursor ? { id: { gt: parsed.data.cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: parsed.data.limit + 1,
      });
      const page = rows.slice(0, parsed.data.limit);
      return cosmeticInventorySchema.parse({
        items: page.map((item) => ({
          id: item.id,
          name: item.name,
          presentation: item.presentation,
        })),
        nextCursor: rows.length > parsed.data.limit ? page.at(-1)!.id : null,
      });
    });
  }
}
