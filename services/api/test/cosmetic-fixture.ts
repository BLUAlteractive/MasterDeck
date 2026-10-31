import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@deckforge/database';
export async function cosmeticFixture(
  db: PrismaClient,
  publish = true,
  count = 1,
) {
  const productId = randomUUID(),
    itemId = randomUUID();
  const itemIds = [
    itemId,
    ...Array.from({ length: count - 1 }, () => randomUUID()),
  ];
  await db.$transaction(async (tx) => {
    for (const id of itemIds) {
      await tx.cosmeticItem.create({
        data: {
          id,
          name: 'Evening table',
          presentation: {
            kind: 'TABLE_THEME',
            primaryColor: '#123456',
            accentColor: '#ffffff',
            motif: 'SOLID',
          },
          rightsOwner: 'ISOLATED_ORIGINAL_FIXTURE',
          rightsBasis: 'ORIGINAL',
          approvalReference: 'FIXTURE_NOT_APPROVAL',
        },
      });
    }
    await tx.cosmeticProduct.create({
      data: {
        id: productId,
        version: 1,
        name: 'Evening table cosmetic',
        description: 'One known original table theme. No functional effects.',
        appleProductId: 'test.apple.' + productId,
        googleProductId: 'test.google.' + productId,
        priceCurrency: 'USD',
        priceMinor: 299,
        approvalReference: 'FIXTURE_NOT_APPROVAL',
      },
    });
    await tx.cosmeticProductItem.createMany({
      data: itemIds.map((itemId) => ({ productId, itemId })),
    });
    if (publish)
      await tx.cosmeticProduct.update({
        where: { id: productId },
        data: { status: 'PUBLISHED' },
      });
  });
  return {
    productId,
    itemId,
    itemIds,
    appleProductId: 'test.apple.' + productId,
    googleProductId: 'test.google.' + productId,
  };
}
