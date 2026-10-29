import { describe, it, expect } from 'vitest';
import { canonicalFaces } from '@deckforge/game-core';
import { validateLoadout, validateManagerSelection } from './loadout';
const ownerId = 'owner';
const cards = canonicalFaces.map((face, index) => ({
  id: 'instance-' + index,
  ownerId,
  faceId: face.id,
  status: 'OWNED',
}));
const selection = Object.fromEntries(
  cards.map((card) => [card.faceId, card.id]),
);
describe('pure 52-face loadout validation', () => {
  it('accepts exact face coverage independently of order and extra owned inventory', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const ordered = [...cards];
      let state = seed;
      for (let i = ordered.length - 1; i > 0; i--) {
        state = (state * 1664525 + 1013904223) >>> 0;
        const j = state % (i + 1);
        [ordered[i], ordered[j]] = [ordered[j]!, ordered[i]!];
      }
      const mapping = Object.fromEntries(
        ordered.map((card) => [card.faceId, card.id]),
      );
      expect(
        validateLoadout(ownerId, mapping, [
          ...ordered,
          ...cards.map((card) => ({ ...card, id: card.id + '-extra' })),
        ]).valid,
      ).toBe(true);
    }
    expect(cards).toHaveLength(52);
  });
  it('rejects missing/unknown faces, repeated IDs, swapped faces and unavailable ownership', () => {
    const missing = { ...selection };
    delete missing[cards[0]!.faceId];
    expect(validateLoadout(ownerId, missing, cards).valid).toBe(false);
    expect(
      validateLoadout(ownerId, { ...missing, JOKER: cards[0]!.id }, cards)
        .valid,
    ).toBe(false);
    expect(
      validateLoadout(
        ownerId,
        { ...selection, [cards[0]!.faceId]: cards[1]!.id },
        cards,
      ).valid,
    ).toBe(false);
    const swapped = {
      ...selection,
      [cards[0]!.faceId]: cards[1]!.id,
      [cards[1]!.faceId]: cards[0]!.id,
    };
    expect(
      validateLoadout(ownerId, swapped, cards).issues.some(
        (issue) => issue.code === 'FACE_MISMATCH',
      ),
    ).toBe(true);
    for (const status of ['LOCKED', 'CONSUMED', 'REVOKED'])
      expect(
        validateLoadout(
          ownerId,
          selection,
          cards.map((card, index) =>
            index === 0 ? { ...card, status } : card,
          ),
        ).valid,
      ).toBe(false);
    expect(validateLoadout('other', selection, cards).valid).toBe(false);
  });
  it('validates every face as mandatory without mutating the supplied inventory', () => {
    const before = JSON.stringify(cards);
    for (const card of cards) {
      const copy = { ...selection };
      delete copy[card.faceId];
      expect(validateLoadout(ownerId, copy, cards).valid).toBe(false);
    }
    expect(JSON.stringify(cards)).toBe(before);
  });
});
describe('100 display slots preserve uncapped ownership', () => {
  it('accepts empty/100 references and rejects overflow, duplicates and foreign/inactive cards', () => {
    const inventory = Array.from({ length: 125 }, (_, index) => ({
      ...cards[index % 52]!,
      id: 'owned-' + index,
    }));
    const slots = inventory
      .slice(0, 100)
      .map((card, index) => ({ slot: index + 1, instanceId: card.id }));
    expect(validateManagerSelection(ownerId, [], inventory)).toBe(true);
    expect(validateManagerSelection(ownerId, slots, inventory)).toBe(true);
    expect(
      validateManagerSelection(
        ownerId,
        [...slots, { slot: 101, instanceId: inventory[100]!.id }],
        inventory,
      ),
    ).toBe(false);
    expect(
      validateManagerSelection(ownerId, [slots[0]!, slots[0]!], inventory),
    ).toBe(false);
    expect(validateManagerSelection('other', slots, inventory)).toBe(false);
    expect(
      validateManagerSelection(
        ownerId,
        slots,
        inventory.map((card, index) =>
          index === 0 ? { ...card, status: 'CONSUMED' } : card,
        ),
      ),
    ).toBe(false);
    expect(inventory).toHaveLength(125);
  });
});
