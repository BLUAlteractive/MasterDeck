import type { PrismaClient } from './generated/client';

export const sampleSeriesId = '11111111-1111-4111-8111-111111111111';

/** Non-destructive development catalog seed; never grants instances or overwrites catalog. */
export async function seedFoundation(database: PrismaClient) {
  const suits = [
    ['CLUBS', 'C'],
    ['DIAMONDS', 'D'],
    ['HEARTS', 'H'],
    ['SPADES', 'S'],
  ] as const;
  const faces = suits.flatMap(([suit, suffix]) =>
    Array.from({ length: 13 }, (_, offset) => {
      const rank = offset + 2;
      const label =
        ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[
          rank
        ] ?? String(rank);
      return { id: `${label}-${suffix}`, rank, suit };
    }),
  );
  await database.$transaction(async (tx) => {
    await tx.faceDefinition.createMany({ data: faces, skipDuplicates: true });
    await tx.cardSeries.createMany({
      data: [
        {
          id: sampleSeriesId,
          slug: 'deckforge-foundation-sample',
          displayName: 'Foundation Sample (development only)',
          rightsOwner: 'DEVELOPMENT_SAMPLE_NO_ART_ASSETS',
          status: 'DRAFT',
        },
      ],
      skipDuplicates: true,
    });
  });
}
