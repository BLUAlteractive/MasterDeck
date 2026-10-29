import { canonicalFaces, getFace } from '@deckforge/game-core';
import { developmentCatalog } from '@deckforge/card-domain';
import type { OwnedCard } from './client';
export type GalleryEntry = {
  key: string;
  faceId: string;
  seriesId: string;
  seriesName: string;
  favorite: boolean;
  owned: OwnedCard | null;
};
export const previewEntries: readonly GalleryEntry[] = canonicalFaces.map(
  (face) => ({
    key: 'preview:' + face.id,
    faceId: face.id,
    seriesId: developmentCatalog.seriesId,
    seriesName: developmentCatalog.displayName,
    favorite: false,
    owned: null,
  }),
);
export function inventoryEntries(cards: readonly OwnedCard[]): GalleryEntry[] {
  return cards.map((card) => ({
    key: card.instanceId,
    faceId: card.faceId,
    seriesId: card.seriesId,
    seriesName: card.seriesName,
    favorite: card.favorite,
    owned: card,
  }));
}
export function filterGallery(
  entries: readonly GalleryEntry[],
  options: {
    search: string;
    seriesId: string;
    suit: string;
    favoritesOnly: boolean;
    sort: 'suit' | 'rank-up' | 'rank-down';
  },
) {
  const text = options.search.trim().toLowerCase();
  return entries
    .filter((entry) => {
      const face = getFace(entry.faceId);
      return (
        (!text ||
          (face.label + ' ' + entry.faceId + ' ' + entry.seriesName)
            .toLowerCase()
            .includes(text)) &&
        (!options.seriesId || entry.seriesId === options.seriesId) &&
        (!options.suit || face.suit === options.suit) &&
        (!options.favoritesOnly || entry.favorite)
      );
    })
    .sort((a, b) => {
      const first = getFace(a.faceId),
        second = getFace(b.faceId);
      const ranks = first.rank - second.rank;
      return (
        (options.sort === 'suit'
          ? first.suit.localeCompare(second.suit) || ranks
          : options.sort === 'rank-up'
            ? ranks
            : -ranks) || a.key.localeCompare(b.key)
      );
    });
}
export function mergeInventory(
  current: readonly OwnedCard[],
  page: readonly OwnedCard[],
) {
  const rows = new Map(current.map((card) => [card.instanceId, card]));
  for (const card of page) rows.set(card.instanceId, card);
  return [...rows.values()];
}
/** Staging is explicit; no automatic best/rarity selection or hidden replacement. */
export function stageCard(
  current: Readonly<Record<string, string>>,
  card: OwnedCard,
) {
  if (card.status !== 'OWNED')
    throw new Error('Reserved cards cannot be newly equipped.');
  return { ...current, [card.faceId]: card.instanceId };
}
export function completeUniqueSelection(
  cards: readonly OwnedCard[],
): Record<string, string> | null {
  if (
    cards.length !== 52 ||
    cards.some((card) => card.status !== 'OWNED') ||
    new Set(cards.map((card) => card.faceId)).size !== 52
  )
    return null;
  return Object.fromEntries(
    cards.map((card) => [card.faceId, card.instanceId]),
  );
}
export function historyLabel(action: string) {
  return (
    (
      {
        MINT: 'Issued',
        GRANT: 'Granted',
        FUSION_CONSUME: 'Consumed in fusion',
        FUSION_CREATE: 'Created by fusion',
        PRESS_EVOLVE: 'Evolved in the press',
        LOCK: 'Reserved',
        UNLOCK: 'Reservation released',
        REVOKE: 'Revoked',
      } as Record<string, string>
    )[action] ?? 'Recorded action'
  );
}
