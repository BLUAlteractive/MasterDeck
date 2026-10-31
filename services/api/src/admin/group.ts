import type { Prisma } from '@deckforge/database';
import { ApiFailure } from '../auth/errors';
/** Admission callers lock all users first; blocking mid-hand never invents a settlement. */
export async function eligibleGroup(
  tx: Prisma.TransactionClient,
  userIds: string[],
) {
  if (
    (await tx.user.count({
      where: { id: { in: userIds }, status: 'ACTIVE' },
    })) !== userIds.length
  )
    throw new ApiFailure('GROUP_UNAVAILABLE', 409);
  if (
    await tx.userBlock.findFirst({
      where: {
        userId: { in: userIds },
        targetUserId: { in: userIds },
        active: true,
      },
    })
  )
    throw new ApiFailure('GROUP_UNAVAILABLE', 409);
}
