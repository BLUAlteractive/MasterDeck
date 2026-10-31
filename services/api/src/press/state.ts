import { randomUUID } from 'node:crypto';
import type { Prisma } from '@deckforge/database';
import { reservedPressStatuses } from '@deckforge/card-domain';
import { hash, json } from '../rooms/shared';
export function pressFrame(j: {
  status: string;
  stateVersion: number;
  acceptedSteps: number;
  accessibleUnits: number;
  activeSince: Date | null;
}) {
  return {
    status: j.status,
    stateVersion: j.stateVersion,
    acceptedSteps: j.acceptedSteps,
    accessibleUnits: j.accessibleUnits,
    activeSince: j.activeSince?.toISOString() ?? null,
  };
}
export function screenFrame(s: {
  status: string;
  stateVersion: number;
  jobId: string | null;
}) {
  return {
    status: s.status,
    stateVersion: s.stateVersion,
    ...(s.jobId ? { jobId: s.jobId } : {}),
  };
}
export async function screenReservation(
  tx: Prisma.TransactionClient,
  screenId: string,
  status: 'ASSIGNED' | 'AVAILABLE' | 'REVOKED',
  jobId: string | null,
  sourceKey: string,
  requestHash: string,
) {
  const before = await tx.ownedScreen.findUniqueOrThrow({
    where: { id: screenId },
  });
  const after = await tx.ownedScreen.update({
    where: { id: screenId },
    data: { status, jobId, stateVersion: { increment: 1 } },
  });
  await tx.screenEvent.create({
    data: {
      id: randomUUID(),
      screenId,
      userId: after.userId,
      version: after.stateVersion,
      action:
        status === 'ASSIGNED'
          ? 'ASSIGN'
          : status === 'AVAILABLE'
            ? 'RELEASE'
            : 'REVOKE',
      sourceKey,
      requestHash,
      before: screenFrame(before),
      after: screenFrame(after),
    },
  });
  return after;
}
/** Caller holds the owner lock; deletion revokes reservation without evolving or consuming a screen. */
export async function revokeUserPress(
  tx: Prisma.TransactionClient,
  userId: string,
  requestId: string,
) {
  const jobs = await tx.pressJob.findMany({
    where: { userId, status: { in: [...reservedPressStatuses] } },
    orderBy: { id: 'asc' },
  });
  for (const before of jobs) {
    const sourceKey = 'press:' + before.id + ':delete:' + requestId,
      requestHash = hash({ sourceKey });
    const after = await tx.pressJob.update({
      where: { id: before.id },
      data: {
        status: 'REVOKED',
        activeSince: null,
        stateVersion: { increment: 1 },
      },
    });
    await screenReservation(
      tx,
      before.screenId,
      'REVOKED',
      before.id,
      sourceKey + ':screen',
      requestHash,
    );
    await tx.pressJobEvent.create({
      data: {
        id: randomUUID(),
        jobId: before.id,
        userId,
        version: after.stateVersion,
        action: 'REVOKE',
        sourceKey,
        requestHash,
        before: json(pressFrame(before)),
        after: json(pressFrame(after)),
      },
    });
  }
}
