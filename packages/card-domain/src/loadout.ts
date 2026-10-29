import { canonicalFaces } from '@deckforge/game-core';
export const MANAGER_SLOT_LIMIT = 100;
export type LoadoutCardView = {
  id: string;
  ownerId: string;
  faceId: string;
  status: string;
};
export type LoadoutIssue = {
  code:
    'FACE_SET' | 'DUPLICATE_INSTANCE' | 'CARD_UNAVAILABLE' | 'FACE_MISMATCH';
  faceId?: string;
};
/** Validates new selection, never deals cards or assigns face probabilities. */
export function validateLoadout(
  ownerId: string,
  faceToInstanceIds: Readonly<Record<string, string>>,
  cards: readonly LoadoutCardView[],
) {
  const issues: LoadoutIssue[] = [];
  const entries = Object.entries(faceToInstanceIds);
  const expected = new Set<string>(canonicalFaces.map((face) => face.id));
  if (entries.length !== 52 || entries.some(([face]) => !expected.has(face)))
    issues.push({ code: 'FACE_SET' });
  if (new Set(entries.map(([, id]) => id)).size !== entries.length)
    issues.push({ code: 'DUPLICATE_INSTANCE' });
  const byId = new Map(cards.map((card) => [card.id, card]));
  for (const [faceId, id] of entries) {
    const card = byId.get(id);
    if (!card || card.ownerId !== ownerId || card.status !== 'OWNED')
      issues.push({ code: 'CARD_UNAVAILABLE', faceId });
    else if (card.faceId !== faceId)
      issues.push({ code: 'FACE_MISMATCH', faceId });
  }
  return { valid: issues.length === 0, issues };
}
export function validateManagerSelection(
  ownerId: string,
  slots: readonly { slot: number; instanceId: string }[],
  cards: readonly LoadoutCardView[],
) {
  const byId = new Map(cards.map((card) => [card.id, card]));
  return (
    slots.length <= MANAGER_SLOT_LIMIT &&
    new Set(slots.map((slot) => slot.slot)).size === slots.length &&
    new Set(slots.map((slot) => slot.instanceId)).size === slots.length &&
    slots.every((slot) => {
      const card = byId.get(slot.instanceId);
      return (
        Number.isInteger(slot.slot) &&
        slot.slot >= 1 &&
        slot.slot <= MANAGER_SLOT_LIMIT &&
        card?.ownerId === ownerId &&
        ['OWNED', 'LOCKED'].includes(card.status)
      );
    })
  );
}
