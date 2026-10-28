export const ranks = Object.freeze([
  2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
] as const);
export const suits = Object.freeze([
  'CLUBS',
  'DIAMONDS',
  'HEARTS',
  'SPADES',
] as const);
export type Rank = (typeof ranks)[number];
export type Suit = (typeof suits)[number];
export type RankLabel =
  '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
export type SuitCode = 'C' | 'D' | 'H' | 'S';
export type FaceId = `${RankLabel}-${SuitCode}`;
export type CardFace = Readonly<{
  id: FaceId;
  rank: Rank;
  suit: Suit;
  rankLabel: RankLabel;
  label: string;
}>;
const suitCodes = {
  CLUBS: 'C',
  DIAMONDS: 'D',
  HEARTS: 'H',
  SPADES: 'S',
} as const;
const suitNames = {
  CLUBS: 'Clubs',
  DIAMONDS: 'Diamonds',
  HEARTS: 'Hearts',
  SPADES: 'Spades',
} as const;
const rankNames: Record<Rank, string> = {
  2: 'Two',
  3: 'Three',
  4: 'Four',
  5: 'Five',
  6: 'Six',
  7: 'Seven',
  8: 'Eight',
  9: 'Nine',
  10: 'Ten',
  11: 'Jack',
  12: 'Queen',
  13: 'King',
  14: 'Ace',
};
export const canonicalFaces: readonly CardFace[] = Object.freeze(
  suits.flatMap((suit) =>
    ranks.map((rank) => {
      const rankLabel =
        (
          { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Partial<
            Record<Rank, RankLabel>
          >
        )[rank] ?? (String(rank) as RankLabel);
      return Object.freeze({
        id: (rankLabel + '-' + suitCodes[suit]) as FaceId,
        rank,
        suit,
        rankLabel,
        label: rankNames[rank] + ' of ' + suitNames[suit],
      });
    }),
  ),
);
export function getFace(id: string): CardFace {
  const face = canonicalFaces.find((candidate) => candidate.id === id);
  if (!face) throw new Error('Invalid canonical face identity.');
  return face;
}
