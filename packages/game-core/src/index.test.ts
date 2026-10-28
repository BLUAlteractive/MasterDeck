import { describe, expect, it } from 'vitest';
import { canonicalFaces, getFace, ranks, suits } from './index';
describe('canonical face identities shared by every game', () => {
  it('contains exactly four suits by thirteen unique ranks and no jokers', () => {
    expect(canonicalFaces).toHaveLength(52);
    expect(new Set(canonicalFaces.map((face) => face.id)).size).toBe(52);
    for (const suit of suits)
      expect(
        canonicalFaces
          .filter((face) => face.suit === suit)
          .map((face) => face.rank),
      ).toEqual(ranks);
    expect(getFace('A-S')).toMatchObject({
      rank: 14,
      suit: 'SPADES',
      label: 'Ace of Spades',
    });
    expect(Object.isFrozen(canonicalFaces)).toBe(true);
    expect(canonicalFaces.every(Object.isFrozen)).toBe(true);
  });
  it.each(['1-S', '14-S', 'JOKER', 'A-X', '<script>', 'a-s'])(
    'rejects invalid face %s',
    (value) => {
      expect(() => getFace(value)).toThrow('Invalid canonical face');
    },
  );
});
