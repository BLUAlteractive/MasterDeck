/** Pure earned-card recipe. Production activation requires a reviewed policy. */
export interface FusionSource {
  id: string;
  ownerId: string;
  templateId: string;
  seriesId: string;
  faceId: string;
  branch: 'BLUE' | 'RED';
  level: number;
  rarity: string;
  status: string;
  stateVersion: number;
  editionSerial: number | null;
}
export function fusionRecipe(
  ownerId: string,
  cards: readonly FusionSource[],
  allowedSeries: readonly string[],
) {
  const first = cards[0];
  if (
    cards.length !== 5 ||
    new Set(cards.map((c) => c.id)).size !== 5 ||
    !first
  )
    throw new Error('FIVE_DISTINCT_SOURCES_REQUIRED');
  if (!allowedSeries.includes(first.seriesId))
    throw new Error('SERIES_NOT_ELIGIBLE');
  const keys = [
    'templateId',
    'seriesId',
    'faceId',
    'branch',
    'level',
    'rarity',
  ] as const;
  if (
    cards.some(
      (c) =>
        c.ownerId !== ownerId ||
        c.status !== 'OWNED' ||
        c.editionSerial !== null ||
        keys.some((k) => c[k] !== first[k]),
    )
  )
    throw new Error('INELIGIBLE_FUSION_SOURCES');
  if (!(first.branch === 'BLUE' ? [1, 3] : [2, 4]).includes(first.level))
    throw new Error('TERMINAL_OR_INVALID_LEVEL');
  return {
    templateId: first.templateId,
    seriesId: first.seriesId,
    faceId: first.faceId,
    branch: first.branch,
    level: first.level + 2,
    rarity: first.rarity,
  };
}
