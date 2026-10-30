import { describe, expect, it } from 'vitest';
import { canonicalFaces, shuffleFaces } from '@deckforge/game-core';
import {
  applySpadesMatch,
  createSpadesMatch,
  legalSpadesPlays,
  nextSpadesRound,
  scoreSpadesRound,
  spadesMatchWinner,
  validateSpadesRules,
  type SpadesMatch,
  type SpadesMatchCommand,
  type SpadesRules,
} from './index';
// Published-rule fixture, never an exported launch configuration or currency award.
const rules: SpadesRules = {
  version: 'PAGAT_TEST_ONLY_V1',
  nilEnabled: true,
  nilPoints: 100,
  contractPoints: 10,
  bagPoints: 1,
  bagThreshold: 10,
  bagPenalty: 100,
  failedNilCountsAsBags: true,
  failedNilBagPoints: 1,
  targetScore: 500,
};
const players = ['north', 'east', 'south', 'west'];
const deck = canonicalFaces.map((face) => face.id);
const zero = [
  { score: 0, bags: 0 },
  { score: 0, bags: 0 },
];
function rng(seed: number) {
  let value = seed;
  return (upper: number) => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value % upper;
  };
}
function bidAll(state: SpadesMatch, bids = [3, 3, 3, 3]): SpadesMatch {
  for (let i = 0; i < 4; i++)
    state = applySpadesMatch(state, {
      kind: 'BID',
      tricks: bids[state.toBid]!,
      playerId: state.deal.players[state.toBid]!,
      expectedVersion: state.stateVersion,
    });
  return state;
}
function finish(state: SpadesMatch): SpadesMatch {
  while (state.phase === 'PLAYING')
    state = applySpadesMatch(state, {
      kind: 'PLAY',
      face: legalSpadesPlays(state.deal)[0]!,
      playerId: state.deal.players[state.deal.toAct]!,
      expectedVersion: state.stateVersion,
    });
  return state;
}
describe('Spades explicit team scoring', () => {
  it.each([
    [7, 389, 9],
    [8, 290, 0],
    [9, 291, 1],
  ])(
    'published score 337 / seven bags, bid five and win %i',
    (taken, score, bags) => {
      const result = scoreSpadesRound(
        rules,
        [{ score: 337, bags: 7 }, zero[1]!],
        [2, 3, 3, 3],
        [2, 13 - taken, taken - 2, 0],
      );
      expect(result[0]!.score).toBe(score);
      expect(result[0]!.bags).toBe(bags);
    },
  );
  it('failed contract scores negative and preserves prior bags', () => {
    const result = scoreSpadesRound(
      rules,
      [{ score: 100, bags: 4 }, zero[1]!],
      [4, 2, 4, 2],
      [3, 4, 3, 3],
    );
    expect(result[0]).toMatchObject({
      score: 20,
      bags: 4,
      delta: -80,
      madeContract: false,
      overtricks: 0,
    });
  });
  it('nil succeeds independently of partner contract; failed nil tricks cannot satisfy it', () => {
    const success = scoreSpadesRound(rules, zero, [0, 3, 4, 3], [0, 4, 5, 4]);
    expect(success[0]).toMatchObject({
      nilScore: 100,
      contract: 4,
      contractTricks: 5,
      score: 141,
      bags: 1,
    });
    const failure = scoreSpadesRound(rules, zero, [0, 3, 4, 3], [2, 4, 3, 4]);
    expect(failure[0]).toMatchObject({
      nilScore: -100,
      contractTricks: 3,
      madeContract: false,
      bagsAdded: 2,
      score: -138,
    });
  });
  it('handles two nil partners and multiple bag penalties with integer carry', () => {
    const both = scoreSpadesRound(rules, zero, [0, 1, 0, 1], [0, 6, 0, 7]);
    expect(both[0]).toMatchObject({ nilScore: 200, score: 200, bags: 0 });
    expect(both[1]).toMatchObject({
      overtricks: 11,
      bagPenaltyCount: 1,
      score: -69,
      bags: 1,
    });
    const small = scoreSpadesRound(
      { ...rules, bagThreshold: 3 },
      [{ score: 0, bags: 2 }, zero[1]!],
      [1, 1, 1, 1],
      [6, 0, 7, 0],
    );
    expect(small[0]).toMatchObject({
      bagPenaltyCount: 4,
      bags: 1,
      score: -369,
    });
  });
  it('supports explicit nil-disabled and failed-nil bag variants without a default', () => {
    expect(() =>
      scoreSpadesRound(
        { ...rules, nilEnabled: false },
        zero,
        [0, 3, 4, 3],
        [0, 4, 5, 4],
      ),
    ).toThrow('INVALID_BIDS');
    const result = scoreSpadesRound(
      { ...rules, failedNilCountsAsBags: false, failedNilBagPoints: 0 },
      zero,
      [0, 3, 4, 3],
      [2, 4, 3, 4],
    );
    expect(result[0]).toMatchObject({ score: -140, bags: 0 });
    expect(() =>
      validateSpadesRules({ ...rules, failedNilCountsAsBags: false }),
    ).toThrow('INVALID_SPADES_RULES');
  });
  it('validates explicit rules, bids, totals, score bounds and bag carry', () => {
    expect(() => validateSpadesRules({ ...rules, targetScore: 0 })).toThrow(
      'INVALID_SPADES_RULES',
    );
    expect(() => validateSpadesRules({ ...rules, bagPoints: 0.5 })).toThrow(
      'INVALID_SPADES_RULES',
    );
    expect(() =>
      scoreSpadesRound(rules, zero, [14, 1, 1, 1], [1, 4, 4, 4]),
    ).toThrow('INVALID_BIDS');
    expect(() =>
      scoreSpadesRound(rules, zero, [1, 1, 1, 1], [1, 4, 4, 3]),
    ).toThrow('INVALID_TRICK_COUNTS');
    expect(() =>
      scoreSpadesRound(
        rules,
        [{ score: 0, bags: 10 }, zero[1]!],
        [1, 1, 1, 1],
        [1, 4, 4, 4],
      ),
    ).toThrow('INVALID_TEAM_SCORES');
    expect(() =>
      scoreSpadesRound(
        rules,
        [{ score: 1e9, bags: 0 }, zero[1]!],
        [1, 1, 1, 1],
        [1, 4, 4, 4],
      ),
    ).toThrow('SCORE_LIMIT');
  });
  it('ends only at target with a unique higher score, including simultaneous crossings', () => {
    expect(
      spadesMatchWinner(
        [
          { score: 499, bags: 0 },
          { score: -20, bags: 0 },
        ],
        500,
      ),
    ).toBe(null);
    expect(
      spadesMatchWinner(
        [
          { score: 510, bags: 0 },
          { score: 500, bags: 0 },
        ],
        500,
      ),
    ).toBe(0);
    expect(
      spadesMatchWinner(
        [
          { score: 500, bags: 0 },
          { score: 520, bags: 0 },
        ],
        500,
      ),
    ).toBe(1);
    expect(
      spadesMatchWinner(
        [
          { score: 500, bags: 0 },
          { score: 500, bags: 0 },
        ],
        500,
      ),
    ).toBe(null);
  });
});
describe('Spades bid/play match reducer', () => {
  it('bids exactly once per seat clockwise before playing; no edits, pass or invalid bid', () => {
    let state = createSpadesMatch(players, 0, deck, rules);
    expect(state.toBid).toBe(1);
    expect(() =>
      applySpadesMatch(state, {
        kind: 'PLAY',
        face: deck[0]!,
        playerId: 'east',
        expectedVersion: 0,
      }),
    ).toThrow('NOT_PLAYING');
    expect(() =>
      applySpadesMatch(state, {
        kind: 'BID',
        tricks: 1,
        playerId: 'north',
        expectedVersion: 0,
      }),
    ).toThrow('NOT_YOUR_TURN');
    for (const tricks of [-1, 14, 0.5])
      expect(() =>
        applySpadesMatch(state, {
          kind: 'BID',
          tricks,
          playerId: 'east',
          expectedVersion: 0,
        }),
      ).toThrow('INVALID_BID');
    state = bidAll(state, [0, 1, 2, 3]);
    expect(state.bids).toEqual([0, 1, 2, 3]);
    expect(state.stateVersion).toBe(4);
    expect(state.phase).toBe('PLAYING');
    expect(() =>
      applySpadesMatch(state, {
        kind: 'BID',
        tricks: 4,
        playerId: 'east',
        expectedVersion: 4,
      }),
    ).toThrow('NOT_BIDDING');
    expect(() =>
      applySpadesMatch(
        createSpadesMatch(players, 0, deck, { ...rules, nilEnabled: false }),
        { kind: 'BID', tricks: 0, playerId: 'east', expectedVersion: 0 },
      ),
    ).toThrow('INVALID_BID');
  });
  it('scores mixed partnerships once, rotates dealer and preserves prior scores and frozen policy', () => {
    const policy = { ...rules };
    let state = createSpadesMatch(players, 0, deck, policy);
    policy.nilPoints = 999;
    expect(state.rules.nilPoints).toBe(100);
    expect(Object.isFrozen(state.rules)).toBe(true);
    expect(() => nextSpadesRound(state, 0, deck)).toThrow('ROUND_NOT_COMPLETE');
    state = finish(bidAll(state, [0, 3, 4, 2]));
    expect(state.results).toHaveLength(1);
    expect(state.stateVersion).toBe(56);
    expect(state.phase).toBe('ROUND_COMPLETE');
    expect(state.teams).toEqual(
      scoreSpadesRound(rules, zero, [0, 3, 4, 2], state.deal.tricksWon),
    );
    expect(() =>
      applySpadesMatch(state, {
        kind: 'PLAY',
        face: deck[0]!,
        playerId: 'north',
        expectedVersion: 55,
      }),
    ).toThrow('STALE_VERSION');
    expect(() =>
      applySpadesMatch(state, {
        kind: 'PLAY',
        face: deck[0]!,
        playerId: 'north',
        expectedVersion: 56,
      }),
    ).toThrow('NOT_PLAYING');
    const next = nextSpadesRound(state, 56, deck);
    expect(next.deal.dealer).toBe(1);
    expect(next.toBid).toBe(2);
    expect(next.teams).toEqual(state.teams);
    expect(next.results).toEqual(state.results);
    expect(next.round).toBe(2);
    expect(state.round).toBe(1);
    expect(next.stateVersion).toBe(57);
  });
  it('prevents another round after a completed target match', () => {
    const state = finish(
      bidAll(
        createSpadesMatch(players, 0, deck, { ...rules, targetScore: 1 }),
        [1, 1, 1, 1],
      ),
    );
    expect(state.phase).toBe('MATCH_COMPLETE');
    expect(state.winner).not.toBe(null);
    expect(() => nextSpadesRound(state, state.stateVersion, deck)).toThrow(
      'ROUND_NOT_COMPLETE',
    );
  });
  it('replays 200 generated multi-round bid/play matches and each partnership breakdown', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const random = rng(seed),
        shuffled = shuffleFaces(random);
      let state = createSpadesMatch(players, 0, shuffled, {
        ...rules,
        targetScore: 1_000_000,
      });
      for (let round = 0; round < 3; round++) {
        const genesis = state,
          commands: SpadesMatchCommand[] = [];
        for (let i = 0; i < 4; i++) {
          const command: SpadesMatchCommand = {
            kind: 'BID',
            tricks: random(7),
            playerId: players[state.toBid]!,
            expectedVersion: state.stateVersion,
          };
          commands.push(command);
          state = applySpadesMatch(state, command);
        }
        for (let i = 0; i < 52; i++) {
          const legal = legalSpadesPlays(state.deal);
          const command: SpadesMatchCommand = {
            kind: 'PLAY',
            face: legal[random(legal.length)]!,
            playerId: players[state.deal.toAct]!,
            expectedVersion: state.stateVersion,
          };
          commands.push(command);
          state = applySpadesMatch(state, command);
        }
        expect(state.results).toHaveLength(round + 1);
        expect(state.teams).toEqual(
          scoreSpadesRound(
            state.rules,
            genesis.teams,
            state.bids as readonly number[],
            state.deal.tricksWon,
          ),
        );
        expect(commands.reduce(applySpadesMatch, genesis)).toEqual(state);
        expect(
          state.teams.every(
            (team) =>
              Number.isInteger(team.score) && team.bags >= 0 && team.bags < 10,
          ),
        ).toBe(true);
        if (round < 2)
          state = nextSpadesRound(
            state,
            state.stateVersion,
            shuffleFaces(random),
          );
      }
    }
  });
});
