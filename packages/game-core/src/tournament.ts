/** Registration-order balanced seeding. Full power-of-two fields; no implicit byes. */
export function tournamentSeeds(size: number): number[] {
  if (![2, 4, 8, 16, 32].includes(size)) throw new Error('INVALID_FIELD_SIZE');
  let seeds = [1, 2];
  while (seeds.length < size) {
    const sum = seeds.length * 2 + 1;
    seeds = seeds.flatMap((s) => [s, sum - s]);
  }
  return seeds;
}
export function tournamentBracket(size: number) {
  const seeds = tournamentSeeds(size);
  return Array.from({ length: Math.log2(size) }, (_, round) =>
    Array.from({ length: size / 2 ** (round + 1) }, (_, slot) => ({
      round,
      slot,
      leftSeed: round === 0 ? seeds[slot * 2]! : null,
      rightSeed: round === 0 ? seeds[slot * 2 + 1]! : null,
    })),
  ).flat();
}
/** Only verified final stacks enter this function. Equal stacks require a fresh hand. */
export function tournamentWinner(
  players: readonly { id: string; finalStack: number }[],
) {
  if (
    players.length !== 2 ||
    players[0]!.id === players[1]!.id ||
    players.some((p) => !Number.isSafeInteger(p.finalStack) || p.finalStack < 0)
  )
    throw new Error('INVALID_TOURNAMENT_RESULT');
  const [a, b] = players as readonly [
    { id: string; finalStack: number },
    { id: string; finalStack: number },
  ];
  return a.finalStack === b.finalStack
    ? null
    : a.finalStack > b.finalStack
      ? a.id
      : b.id;
}
