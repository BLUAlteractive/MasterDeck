import { describe, it, expect } from 'vitest';
import {
  previewEntries,
  completeUniqueSelection,
  filterGallery,
  mergeInventory,
  stageCard,
} from './model';
import type { OwnedCard } from './client';
const card: OwnedCard = {
  instanceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  faceId: 'A-S',
  level: 1,
  branch: 'BLUE',
  rarity: 'COMMON',
  stateVersion: 1,
  status: 'OWNED',
  seriesId: '11111111-1111-4111-8111-111111111111',
  seriesName: 'Test original',
  templateVersion: 1,
  favorite: false,
};
const options = {
  search: '',
  seriesId: '',
  suit: '',
  favoritesOnly: false,
  sort: 'suit' as const,
};
describe('gallery presentation model', () => {
  it('contains 52 separately labeled previews without invented ownership', () => {
    expect(previewEntries).toHaveLength(52);
    expect(new Set(previewEntries.map((entry) => entry.faceId)).size).toBe(52);
    expect(
      previewEntries.every(
        (entry) => entry.owned === null && entry.key.startsWith('preview:'),
      ),
    ).toBe(true);
  });
  it('filters faces/series/favorites and sorts rank without changing source rows', () => {
    expect(
      filterGallery(previewEntries, { ...options, suit: 'HEARTS' }),
    ).toHaveLength(13);
    expect(
      filterGallery(previewEntries, {
        ...options,
        search: 'queen of hearts',
      }).map((entry) => entry.faceId),
    ).toEqual(['Q-H']);
    expect(
      filterGallery(previewEntries, { ...options, seriesId: 'unknown' }),
    ).toHaveLength(0);
    expect(
      filterGallery(
        previewEntries.map((entry, index) => ({
          ...entry,
          favorite: index === 0,
        })),
        { ...options, favoritesOnly: true },
      ),
    ).toHaveLength(1);
    expect(
      filterGallery(previewEntries, {
        ...options,
        sort: 'rank-down',
      })[0]?.faceId.startsWith('A-'),
    ).toBe(true);
    expect(previewEntries[0]?.favorite).toBe(false);
  });
  it('retains more than 100 owned instances while deduplicating pages and refreshing preferences', () => {
    const cards = Array.from({ length: 125 }, (_, i) => ({
      ...card,
      instanceId: 'instance-' + i,
    }));
    const merged = mergeInventory(cards.slice(0, 100), cards.slice(100));
    expect(merged).toHaveLength(125);
    expect(
      mergeInventory(merged, [{ ...cards[0]!, favorite: true }]),
    ).toHaveLength(125);
    expect(
      mergeInventory(merged, [{ ...cards[0]!, favorite: true }])[0]?.favorite,
    ).toBe(true);
  });
  it('offers bulk selection only for a complete unambiguous available deck', () => {
    const cards = previewEntries.map((entry, index) => ({
      ...card,
      faceId: entry.faceId,
      instanceId: 'instance-' + index,
    }));
    expect(Object.keys(completeUniqueSelection(cards)!)).toHaveLength(52);
    expect(completeUniqueSelection([...cards, cards[0]!])).toBeNull();
    expect(
      completeUniqueSelection(
        cards.map((item, index) =>
          index === 0 ? { ...item, status: 'LOCKED' } : item,
        ),
      ),
    ).toBeNull();
  });
  it('stages only an explicitly chosen face, without auto-equipping duplicates or reserved cards', () => {
    const before = { '2-H': 'old' };
    expect(stageCard(before, card)).toEqual({
      ...before,
      'A-S': card.instanceId,
    });
    expect(before).toEqual({ '2-H': 'old' });
    expect(() => stageCard(before, { ...card, status: 'LOCKED' })).toThrow();
  });
});
