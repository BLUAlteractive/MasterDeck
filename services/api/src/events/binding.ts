import { eligibleGroup } from '../admin/group';
import type { Prisma } from '@deckforge/database';
import type { ClassicAdmissionPolicy } from '../rooms/settlement';
import { ApiFailure } from '../auth/errors';
import { hash } from '../rooms/shared';
/** Called inside admission before commit: a tournament cannot select an already-dealt hand. */
export async function bindTournamentRoom(
  tx: Prisma.TransactionClient,
  lobbyId: string,
  roomId: string,
  userIds: string[],
  policy: ClassicAdmissionPolicy,
) {
  const binding = await tx.tournamentBinding.findUnique({
    where: { lobbyId },
    include: { match: { include: { tournament: true } } },
  });
  if (!binding) return;
  await eligibleGroup(tx, userIds);
  const m = binding.match;
  await tx.$queryRaw`SELECT "id" FROM "Tournament" WHERE "id"=${m.tournamentId}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "TournamentMatch" WHERE "id"=${m.id}::uuid FOR UPDATE`;
  const entries = await tx.tournamentEntry.findMany({
    where: { id: { in: [m.leftEntryId!, m.rightEntryId!] } },
  });
  if (
    m.tournament.status !== 'RUNNING' ||
    m.status !== 'WAITING' ||
    m.attempt !== binding.attempt ||
    binding.roomId ||
    entries.length !== 2 ||
    userIds.length !== 2 ||
    !entries.every((e) => userIds.includes(e.userId)) ||
    hash(m.tournament.admissionPolicy) !== hash(policy)
  )
    throw new ApiFailure('TOURNAMENT_ADMISSION_CONFLICT', 409);
  await tx.tournamentBinding.update({ where: { lobbyId }, data: { roomId } });
  await tx.tournamentMatch.update({
    where: { id: m.id },
    data: { status: 'PLAYING' },
  });
}
