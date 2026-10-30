import { z } from 'zod';
import { writeCardTransition, type Prisma } from '@deckforge/database';
const itemsSchema = z
  .array(
    z
      .object({
        instanceId: z.uuid(),
        stateVersion: z.number().int().positive(),
      })
      .strict(),
  )
  .length(52);
/** Room completion and inventory release share the final command transaction. */
export async function releaseSpadesReservations(
  tx: Prisma.TransactionClient,
  roomId: string,
) {
  const admission = await tx.spadesAdmission.findUnique({ where: { roomId } });
  if (!admission) return;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(42819)::text`;
  const reservations = await tx.spadesReservation.findMany({
    where: { roomId },
  });
  const items = reservations
    .flatMap((reservation) =>
      itemsSchema
        .parse(reservation.items)
        .map((item) => ({ ...item, userId: reservation.userId })),
    )
    .sort((a, b) => a.instanceId.localeCompare(b.instanceId));
  for (const item of items)
    await writeCardTransition(tx, {
      instanceId: item.instanceId,
      ownerId: item.userId,
      expectedVersion: item.stateVersion,
      command: { action: 'UNLOCK', lockToken: roomId },
      operatorId: 'spades.complete',
      sourceKey: `spades:${roomId}:unlock:${item.instanceId}`,
      reason: 'SPADES_MATCH_COMPLETE',
    });
  await tx.lobby.update({
    where: { id: admission.lobbyId },
    data: { status: 'OPEN', version: { increment: 1 } },
  });
  await tx.lobbySeat.updateMany({
    where: { lobbyId: admission.lobbyId },
    data: { ready: false },
  });
}
