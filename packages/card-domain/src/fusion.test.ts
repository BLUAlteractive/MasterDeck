import { describe, expect, it } from 'vitest';
import { fusionRecipe, type FusionSource } from './fusion';
function sources(level = 1, branch: 'BLUE' | 'RED' = 'BLUE'): FusionSource[] {
  return Array.from({ length: 5 }, (_, i) => ({
    id: String(i),
    ownerId: 'owner',
    templateId: 'template',
    seriesId: 'series',
    faceId: 'Q-H',
    branch,
    level,
    rarity: 'COMMON',
    status: 'OWNED',
    stateVersion: 1,
    editionSerial: null,
  }));
}
describe('five-copy fusion recipe', () => {
  it.each([
    [1, 'BLUE', 3],
    [3, 'BLUE', 5],
    [2, 'RED', 4],
    [4, 'RED', 6],
  ] as const)(
    'preserves earned attributes for %s %s',
    (level, branch, target) => {
      const cards = sources(level, branch);
      const before = JSON.stringify(cards);
      expect(fusionRecipe('owner', cards, ['series'])).toEqual({
        templateId: 'template',
        seriesId: 'series',
        faceId: 'Q-H',
        branch,
        level: target,
        rarity: 'COMMON',
      });
      expect(JSON.stringify(cards)).toBe(before);
    },
  );
  it.each([
    'ownerId',
    'templateId',
    'seriesId',
    'faceId',
    'branch',
    'level',
    'rarity',
    'status',
    'editionSerial',
  ] as const)('rejects incompatible %s', (key) => {
    const cards = sources();
    const bad = {
      ...cards[4],
      [key]: key === 'level' ? 3 : key === 'editionSerial' ? 1 : 'other',
    };
    expect(() =>
      fusionRecipe('owner', [...cards.slice(0, 4), bad] as FusionSource[], [
        'series',
      ]),
    ).toThrow();
  });
  it('rejects counts, duplicates, unknown series and terminal/invalid branches', () => {
    const cards = sources();
    for (const list of [
      cards.slice(1),
      [...cards, cards[0]!],
      [...cards.slice(1), cards[1]!],
    ])
      expect(() => fusionRecipe('owner', list, ['series'])).toThrow();
    expect(() => fusionRecipe('owner', cards, [])).toThrow();
    for (const [level, branch] of [
      [5, 'BLUE'],
      [6, 'RED'],
      [2, 'BLUE'],
      [1, 'RED'],
    ] as const)
      expect(() =>
        fusionRecipe('owner', sources(level, branch), ['series']),
      ).toThrow();
  });
});
