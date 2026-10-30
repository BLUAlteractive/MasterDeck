import { evaluateSevenCardHand } from './seven';
import { CLASSIC_RULESET, MAX_TABLE_CHIPS, type PokerHand } from './hand';
export type PokerPot = Readonly<{
  cap: number;
  amount: number;
  contributors: readonly string[];
  eligible: readonly string[];
  winners: readonly string[];
  awards: readonly Readonly<{ playerId: string; amount: number }>[];
}>;
export type PokerAllocation = Readonly<{
  pots: readonly PokerPot[];
  players: readonly Readonly<{
    playerId: string;
    payout: number;
    refund: number;
    finalStack: number;
  }>[];
}>;
/** Terminal engine input only. Pure allocation is not a wallet mutation. */
export function allocatePokerPots(s: PokerHand): PokerAllocation {
  const invalid = () => {
    throw new Error('INVALID_TERMINAL_HAND');
  };
  if (
    s.rulesetVersion !== CLASSIC_RULESET ||
    s.street !== 'COMPLETE' ||
    !s.completionReason ||
    s.players.length < 2 ||
    s.players.length > 6 ||
    !Number.isInteger(s.dealer) ||
    s.dealer < 0 ||
    s.dealer >= s.players.length ||
    new Set(s.players.map((p) => p.id)).size !== s.players.length ||
    s.players.some(
      (p) =>
        ![p.stack, p.committed, p.startingStack].every(
          (n) => Number.isSafeInteger(n) && n >= 0 && n <= MAX_TABLE_CHIPS,
        ) || p.stack + p.committed !== p.startingStack,
    ) ||
    s.players.reduce((n, p) => n + p.startingStack, 0) > MAX_TABLE_CHIPS
  )
    invalid();
  const live = s.players.filter((p) => !p.folded);
  if (
    !live.length ||
    (s.completionReason === 'FOLD' ? live.length !== 1 : s.board.length !== 5)
  )
    invalid();
  const strengths = new Map(
    live.map((p) => [
      p.id,
      s.completionReason === 'SHOWDOWN'
        ? evaluateSevenCardHand([...p.hole, ...s.board]).rank.strength
        : 0,
    ]),
  );
  const players = s.players.map((p) => ({
    playerId: p.id,
    payout: 0,
    refund: 0,
    finalStack: p.stack,
  }));
  const pots: PokerPot[] = [];
  let previous = 0;
  const levels = [
    ...new Set(s.players.map((p) => p.committed).filter((n) => n > 0)),
  ].sort((a, b) => a - b);
  for (const cap of levels) {
    const contributors = s.players.filter((p) => p.committed >= cap);
    const amount = (cap - previous) * contributors.length;
    previous = cap;
    if (contributors.length === 1) {
      players[s.players.indexOf(contributors[0]!)]!.refund += amount;
      continue;
    }
    const eligible = contributors.filter((p) => !p.folded);
    if (!eligible.length) invalid();
    const best = Math.max(...eligible.map((p) => strengths.get(p.id)!));
    const winners = eligible
      .filter((p) => strengths.get(p.id) === best)
      .sort(
        (a, b) =>
          ((s.players.indexOf(a) - s.dealer - 1 + s.players.length) %
            s.players.length) -
          ((s.players.indexOf(b) - s.dealer - 1 + s.players.length) %
            s.players.length),
      );
    const awards = winners.map((p, i) =>
      Object.freeze({
        playerId: p.id,
        amount:
          Math.floor(amount / winners.length) +
          (i < amount % winners.length ? 1 : 0),
      }),
    );
    awards.forEach((a) => {
      players.find((p) => p.playerId === a.playerId)!.payout += a.amount;
    });
    pots.push(
      Object.freeze({
        cap,
        amount,
        contributors: Object.freeze(contributors.map((p) => p.id)),
        eligible: Object.freeze(eligible.map((p) => p.id)),
        winners: Object.freeze(winners.map((p) => p.id)),
        awards: Object.freeze(awards),
      }),
    );
  }
  players.forEach((p) => {
    p.finalStack += p.payout + p.refund;
    Object.freeze(p);
  });
  if (
    players.reduce((n, p) => n + p.finalStack, 0) !==
    s.players.reduce((n, p) => n + p.startingStack, 0)
  )
    invalid();
  return Object.freeze({
    pots: Object.freeze(pots),
    players: Object.freeze(players),
  });
}
