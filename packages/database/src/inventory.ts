import { randomUUID } from 'node:crypto';
import {
  transitionCardState,
  type CardTransition,
} from '@deckforge/card-domain';
import type { Prisma } from './generated/client';
export class InventoryConflict extends Error {
  constructor(
    readonly code: 'CARD_NOT_FOUND' | 'STALE_CARD' | 'INVALID_CARD_TRANSITION',
  ) {
    super(code);
  }
}
/** Server-only mint primitive. The caller's transaction must establish reward/feature eligibility. */
export async function createCardWithOrigin(
  tx: Prisma.TransactionClient,
  data: Omit<
    Prisma.CardInstanceUncheckedCreateInput,
    | 'originEventId'
    | 'events'
    | 'stateVersion'
    | 'status'
    | 'lockToken'
    | 'lockReason'
  >,
  audit: {
    actorUserId?: string;
    operatorId: string;
    sourceKey: string;
    reason: string;
    action?: 'MINT' | 'GRANT' | 'FUSION_CREATE';
  },
) {
  const originEventId = randomUUID();
  const card = await tx.cardInstance.create({
    data: {
      ...data,
      id: data.id ?? randomUUID(),
      originEventId,
      status: 'OWNED',
      stateVersion: 1,
    },
  });
  await tx.ownershipEvent.create({
    data: {
      id: originEventId,
      instanceId: card.id,
      actorUserId: audit.actorUserId ?? null,
      operatorId: audit.operatorId,
      action: audit.action ?? 'GRANT',
      sourceKey: audit.sourceKey,
      reason: audit.reason,
      stateVersion: 1,
      snapshot: cardSnapshot(card),
    },
  });
  return card;
}
export function cardSnapshot(card: {
  id: string;
  ownerId: string;
  status: string;
  stateVersion: number;
  level: number;
  branch: string;
  rarity: string;
  lockToken: string | null;
  lockReason: string | null;
}) {
  return {
    instanceId: card.id,
    ownerId: card.ownerId,
    status: card.status,
    stateVersion: card.stateVersion,
    level: card.level,
    branch: card.branch,
    rarity: card.rarity,
    lockToken: card.lockToken,
    lockReason: card.lockReason,
  };
}
/** Internal primitive, never an API command. Owner/feature eligibility belongs to the calling service.
 * Acquire user/session locks first and card locks in stable UUID order for multi-card operations.
 * Fusion must validate/consume five and create one in the SAME enclosing transaction (B032).
 */
export async function writeCardTransition(
  tx: Prisma.TransactionClient,
  input: {
    instanceId: string;
    ownerId: string;
    expectedVersion: number;
    command: CardTransition;
    actorUserId?: string;
    operatorId: string;
    sourceKey: string;
    reason: string;
  },
) {
  await tx.$queryRaw`SELECT "id" FROM "CardInstance" WHERE "id" = ${input.instanceId}::uuid FOR UPDATE`;
  const card = await tx.cardInstance.findUnique({
    where: { id: input.instanceId },
  });
  if (!card || card.ownerId !== input.ownerId)
    throw new InventoryConflict('CARD_NOT_FOUND');
  if (card.stateVersion !== input.expectedVersion)
    throw new InventoryConflict('STALE_CARD');
  let next;
  try {
    next = transitionCardState(
      {
        status: card.status,
        stateVersion: card.stateVersion,
        lockToken: card.lockToken,
        lockReason: card.lockReason,
      },
      input.command,
    );
  } catch {
    throw new InventoryConflict('INVALID_CARD_TRANSITION');
  }
  const updated = await tx.cardInstance.update({
    where: { id: card.id },
    data: next,
  });
  const event = await tx.ownershipEvent.create({
    data: {
      instanceId: card.id,
      actorUserId: input.actorUserId ?? null,
      operatorId: input.operatorId,
      action: input.command.action,
      sourceKey: input.sourceKey,
      reason: input.reason,
      stateVersion: updated.stateVersion,
      snapshot: cardSnapshot(updated),
    },
  });
  return { card: updated, event };
}
