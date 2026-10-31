import type { Prisma } from '@deckforge/database';
/** Only a successful authenticated collection operation may call this; no client event endpoint. */
export async function recordCollection(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  await tx.$executeRaw`INSERT INTO "CollectorActivity"("userId","lastCollectionAt") VALUES(${userId}::uuid,CURRENT_TIMESTAMP) ON CONFLICT("userId") DO UPDATE SET "lastCollectionAt"=GREATEST("CollectorActivity"."lastCollectionAt",EXCLUDED."lastCollectionAt")`;
}
