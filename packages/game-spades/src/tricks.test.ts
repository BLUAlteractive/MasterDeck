import { describe, expect, it } from 'vitest';
import {
  canonicalFaces,
  getFace,
  shuffleFaces,
  type FaceId,
} from '@deckforge/game-core';
import {
  createSpadesDeal,
  legalSpadesPlays,
  nextSeat,
  playSpades,
  startSpadesDeal,
  teamOf,
  winningSeat,
  type Play,
  type Seat,
} from './index';
const players = ['north', 'east', 'south', 'west'];
const deck = canonicalFaces.map((face) => face.id);
function rng(seed: number) {
  let value = seed;
  return (upper: number) => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value % upper;
  };
}
function arranged(hand: readonly FaceId[], seat: Seat = 0): readonly FaceId[] {
  const rest = deck.filter((face) => !hand.includes(face));
  return Array.from({ length: 52 }, (_, index) =>
    index % 4 === seat ? hand[Math.floor(index / 4)]! : rest.shift()!,
  );
}
describe('Classic Spades deal and trick engine', () => {
  it('deals clockwise from dealer left, each face once and fixed opposite teams', () => {
    for (const dealer of [0, 1, 2, 3] as const) {
      const state = createSpadesDeal(players, dealer, deck);
      expect(state.hands.map((hand) => hand.length)).toEqual([13, 13, 13, 13]);
      expect(state.hands[nextSeat(dealer)]![0]).toBe(deck[0]);
      expect(new Set(state.hands.flat()).size).toBe(52);
      expect(state.toAct).toBe(nextSeat(dealer));
    }
    expect([0, 1, 2, 3].map((seat) => teamOf(seat as Seat))).toEqual([
      0, 1, 0, 1,
    ]);
  });
  it('rejects invalid players, dealer, duplicate and foreign faces and bad random draws', () => {
    expect(() => createSpadesDeal(['x', 'x', 'y', 'z'], 0, deck)).toThrow(
      'INVALID_PLAYERS',
    );
    expect(() => createSpadesDeal(players, 4 as Seat, deck)).toThrow(
      'INVALID_SEAT',
    );
    expect(() =>
      createSpadesDeal(players, 0, [...deck.slice(1), deck[1]!]),
    ).toThrow('INVALID_DECK');
    expect(() =>
      createSpadesDeal(players, 0, ['JOKER' as FaceId, ...deck.slice(1)]),
    ).toThrow('INVALID_DECK');
    expect(() => startSpadesDeal(players, 0, (upper) => upper)).toThrow(
      'INVALID_RANDOM_DRAW',
    );
  });
  it('enforces unbroken lead, follows suit and rejects wrong-turn, foreign or stale play', () => {
    const state = createSpadesDeal(players, 3, deck);
    const allowed = legalSpadesPlays(state);
    expect(allowed.every((face) => getFace(face).suit !== 'SPADES')).toBe(true);
    expect(() =>
      playSpades(state, {
        playerId: 'east',
        expectedVersion: 0,
        face: allowed[0]!,
      }),
    ).toThrow('NOT_YOUR_TURN');
    expect(() =>
      playSpades(state, {
        playerId: 'north',
        expectedVersion: 1,
        face: allowed[0]!,
      }),
    ).toThrow('STALE_VERSION');
    expect(() =>
      playSpades(state, {
        playerId: 'north',
        expectedVersion: 0,
        face: state.hands[0]!.find((face) => getFace(face).suit === 'SPADES')!,
      }),
    ).toThrow('ILLEGAL_CARD');
    const next = playSpades(state, {
      playerId: 'north',
      expectedVersion: 0,
      face: allowed[0]!,
    });
    expect(
      legalSpadesPlays(next).every((face) => getFace(face).suit === 'CLUBS'),
    ).toBe(true);
    const offSuit = next.hands[1]!.find(
      (face) => getFace(face).suit !== 'CLUBS',
    )!;
    expect(() =>
      playSpades(next, { playerId: 'east', expectedVersion: 1, face: offSuit }),
    ).toThrow('ILLEGAL_CARD');
    expect(state.hands[0]).toHaveLength(13);
    expect(next.hands[0]).toHaveLength(12);
    expect(Object.isFrozen(next.hands[0])).toBe(true);
  });
  it('permits all-spade opening and breaks spades, with winner leading next', () => {
    let state = createSpadesDeal(
      players,
      3,
      arranged(deck.filter((face) => getFace(face).suit === 'SPADES')),
    );
    expect(legalSpadesPlays(state)).toHaveLength(13);
    state = playSpades(state, {
      playerId: 'north',
      expectedVersion: 0,
      face: '2-S',
    });
    expect(state.spadesBroken).toBe(true);
    while (state.currentTrick.length)
      state = playSpades(state, {
        playerId: state.players[state.toAct]!,
        expectedVersion: state.stateVersion,
        face: legalSpadesPlays(state)[0]!,
      });
    expect(state.toAct).toBe(0);
    expect(state.tricksWon).toEqual([1, 0, 0, 0]);
  });
  it.each([
    [['2-C', 'A-H', 'K-C', 'Q-D'], 2],
    [['A-C', '2-S', 'K-S', 'A-D'], 2],
    [['A-S', '2-S', 'K-S', 'Q-S'], 0],
    [['A-H', 'K-H', 'Q-H', '2-H'], 0],
  ] as const)('uses only led suit and spade rank: %j', (faces, winner) => {
    const plays = faces.map((face, seat) => ({
      face,
      seat: seat as Seat,
    })) as Play[];
    expect(winningSeat(plays)).toBe(winner);
  });
  it('rejects malformed trick results', () => {
    expect(() => winningSeat([])).toThrow('INVALID_TRICK');
  });
  it('completes and replays 1,000 seeded deals, conserves 52 faces and checks every trick independently', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const random = rng(seed),
        shuffled = shuffleFaces(random),
        dealer = (seed % 4) as Seat;
      let state = createSpadesDeal(players, dealer, shuffled);
      const commands = [];
      for (let action = 0; action < 52; action++) {
        const legal = legalSpadesPlays(state),
          face = legal[random(legal.length)]!;
        const led = state.currentTrick[0];
        if (led && getFace(face).suit !== getFace(led.face).suit)
          expect(
            state.hands[state.toAct]!.some(
              (card) => getFace(card).suit === getFace(led.face).suit,
            ),
          ).toBe(false);
        const command = {
          playerId: players[state.toAct]!,
          expectedVersion: state.stateVersion,
          face,
        };
        commands.push(command);
        state = playSpades(state, command);
        expect(
          new Set([
            ...state.hands.flat(),
            ...state.currentTrick.map((play) => play.face),
            ...state.tricks.flatMap((trick) =>
              trick.plays.map((play) => play.face),
            ),
          ]).size,
        ).toBe(52);
      }
      expect(state.finished).toBe(true);
      expect(state.tricks).toHaveLength(13);
      expect(state.hands.flat()).toHaveLength(0);
      expect(state.tricksWon.reduce((a, b) => a + b, 0)).toBe(13);
      for (const trick of state.tricks) {
        const led = getFace(trick.plays[0]!.face).suit;
        const eligible = trick.plays.filter(
          (play) => getFace(play.face).suit === 'SPADES',
        );
        const ranked = (
          eligible.length
            ? eligible
            : trick.plays.filter((play) => getFace(play.face).suit === led)
        ).sort((a, b) => getFace(b.face).rank - getFace(a.face).rank);
        expect(trick.winner).toBe(ranked[0]!.seat);
      }
      expect(
        commands.reduce(
          playSpades,
          createSpadesDeal(players, dealer, shuffled),
        ),
      ).toEqual(state);
      expect(legalSpadesPlays(state)).toEqual([]);
      expect(() =>
        playSpades(state, {
          playerId: players[state.toAct]!,
          expectedVersion: 52,
          face: deck[0]!,
        }),
      ).toThrow('DEAL_COMPLETE');
    }
  });
});
