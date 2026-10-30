import { canonicalFaces, type FaceId } from './index';

/** Private server input. Exactly one canonical deck, never a collection deck. */
export function validateDeck(input: readonly FaceId[]): readonly FaceId[] {
  if (
    input.length !== 52 ||
    new Set(input).size !== 52 ||
    Array.from(input).some(
      (id) => !canonicalFaces.some((face) => face.id === id),
    )
  )
    throw new Error('INVALID_DECK');
  return Object.freeze([...input]);
}

/** The server supplies a CSPRNG bounded integer source; fixtures may inject one. */
export function shuffleFaces(
  nextInt: (exclusiveUpper: number) => number,
): readonly FaceId[] {
  const deck = canonicalFaces.map((face) => face.id);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = nextInt(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i)
      throw new Error('INVALID_RANDOM_DRAW');
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return Object.freeze(deck);
}
