import { describe, expect, it } from 'vitest';
import {
  canonicalFaces,
  shuffleFaces,
  validateDeck,
} from '@deckforge/game-core';
import {
  createPokerHand,
  legalPokerActions,
  reducePokerHand,
  replayPokerHand,
  type PokerAction,
  type PokerHand,
  type PokerCommand,
} from './hand';
const deck = canonicalFaces.map((f) => f.id);
const config = (stacks = [100, 100, 100]) => ({
  players: stacks.map((stack, i) => ({ id: String(i), stack })),
  dealer: 0,
  smallBlind: 1,
  bigBlind: 2,
});
function act(s: PokerHand, action: PokerAction, target?: number) {
  return reducePokerHand(s, {
    playerId: s.players[s.toAct!]!.id,
    expectedVersion: s.stateVersion,
    action,
    ...(target === undefined ? {} : { target }),
  });
}
describe('private Classic hand reducer', () => {
  it('shuffles exactly one deck using 51 bounded draws and validates every draw', () => {
    const bounds: number[] = [];
    expect(
      new Set(
        shuffleFaces((upper) => {
          bounds.push(upper);
          return upper - 1;
        }),
      ).size,
    ).toBe(52);
    expect(bounds).toEqual(Array.from({ length: 51 }, (_, i) => 52 - i));
    for (const n of [-1, 52, 0.5, NaN, Infinity])
      expect(() => shuffleFaces(() => n)).toThrow('INVALID_RANDOM_DRAW');
    expect(() => validateDeck([...deck.slice(1), deck[1]!])).toThrow(
      'INVALID_DECK',
    );
    expect(() => validateDeck(new Array(52))).toThrow('INVALID_DECK');
  });
  it('posts multiway blinds, deals clockwise and retains the big blind option', () => {
    let s = createPokerHand(config(), deck);
    expect(s.players.map((p) => p.streetBet)).toEqual([0, 1, 2]);
    expect(s.toAct).toBe(0);
    expect(s.players[1]!.hole).toEqual([deck[0], deck[3]]);
    s = act(s, 'CALL');
    s = act(s, 'CALL');
    expect(s.toAct).toBe(2);
    expect(s.street).toBe('PREFLOP');
    s = act(s, 'CHECK');
    expect(s.street).toBe('FLOP');
    expect(s.toAct).toBe(1);
    expect(s.burned).toEqual([deck[6]]);
    expect(s.board).toEqual(deck.slice(7, 10));
  });
  it('uses heads-up button small blind first preflop and last postflop', () => {
    let s = createPokerHand(config([100, 100]), deck);
    expect(s.toAct).toBe(0);
    expect(s.players[0]!.hole[0]).toBe(deck[1]);
    s = act(act(s, 'CALL'), 'CHECK');
    expect(s.toAct).toBe(1);
  });
  it('rejects stale, out of turn, malformed, under-raise and over-stack commands without mutation', () => {
    const s = createPokerHand(config(), deck),
      before = JSON.stringify(s);
    const base: PokerCommand = {
      playerId: '0',
      expectedVersion: 0,
      action: 'CHECK',
    };
    for (const command of [
      base,
      { ...base, expectedVersion: 1 },
      { ...base, playerId: '1', action: 'CALL' as const },
      { ...base, action: 'BET_TO' as const, target: 3 },
      { ...base, action: 'BET_TO' as const, target: 101 },
      { ...base, action: 'BET_TO' as const, target: 4.5 },
      { ...base, target: 4 },
      { ...base, unexpected: true },
    ])
      expect(() => reducePokerHand(s, command)).toThrow();
    expect(JSON.stringify(s)).toBe(before);
    expect(Object.isFrozen(s.players[0]!.hole)).toBe(true);
  });
  it('advances all streets with burns and deterministic replay', () => {
    const c = config();
    let s = createPokerHand(c, deck);
    const commands: PokerCommand[] = [];
    while (s.toAct !== null) {
      const p = s.players[s.toAct]!;
      const legal = legalPokerActions(s, p.id)!;
      const command: PokerCommand = {
        playerId: p.id,
        expectedVersion: s.stateVersion,
        action: legal.canCheck ? 'CHECK' : 'CALL',
      };
      commands.push(command);
      s = reducePokerHand(s, command);
    }
    expect(s.completionReason).toBe('SHOWDOWN');
    expect(s.board).toHaveLength(5);
    expect(s.burned).toHaveLength(3);
    expect(
      new Set([...s.players.flatMap((p) => p.hole), ...s.board, ...s.burned])
        .size,
    ).toBe(14);
    expect(replayPokerHand(c, deck, commands)).toEqual(s);
    expect(s.players.reduce((n, p) => n + p.stack + p.committed, 0)).toBe(300);
    expect(() => act(s, 'CHECK')).toThrow();
  });
  it('folds terminate without revealing or dealing the unused board', () => {
    const s = act(act(createPokerHand(config(), deck), 'FOLD'), 'FOLD');
    expect(s.completionReason).toBe('FOLD');
    expect(s.board).toEqual([]);
    expect(s.cursor).toBe(6);
  });
  it('runs out all-ins and never asks a lone player to wager into a dry side pot', () => {
    let s = createPokerHand(config([1, 100]), deck);
    expect(s.completionReason).toBe('SHOWDOWN');
    expect(s.players[1]!.committed).toBe(2);
    s = createPokerHand(config([100, 1]), deck);
    expect(s.completionReason).toBe('SHOWDOWN');
    expect(s.players[0]!.committed).toBe(1);
    s = createPokerHand(config([100, 100]), deck);
    s = act(s, 'ALL_IN');
    s = act(s, 'CALL');
    expect(s.completionReason).toBe('SHOWDOWN');
    expect(s.board).toHaveLength(5);
  });
  it('short all-ins do not reopen a previous caller, cumulative full raises do', () => {
    let s = createPokerHand(config([100, 3, 4, 100]), deck); // first seat 3
    s = act(s, 'CALL');
    s = act(s, 'CALL');
    s = act(s, 'ALL_IN');
    expect(legalPokerActions(s, '2')!.canRaise).toBe(true);
    s = act(s, 'ALL_IN');
    expect(s.toAct).toBe(3);
    expect(legalPokerActions(s, '3')!.canRaise).toBe(true);
    expect(legalPokerActions(s, '3')!.minRaiseTo).toBe(6);
    let t = createPokerHand(config([100, 3, 100]), deck);
    t = act(t, 'CALL');
    t = act(t, 'ALL_IN');
    t = act(t, 'CALL');
    expect(legalPokerActions(t, '0')!.canRaise).toBe(false);
    expect(() => act(t, 'ALL_IN')).toThrow();
    expect(() => act(t, 'BET_TO', 5)).toThrow();
    t = act(t, 'CALL');
    expect(t.street).toBe('FLOP');
  });
  it('an incomplete opening all-in does not reopen an earlier check', () => {
    let s = createPokerHand(config([100, 100, 3]), deck);
    s = act(act(act(s, 'CALL'), 'CALL'), 'CHECK'); // flop first seat 1
    s = act(s, 'CHECK');
    s = act(s, 'ALL_IN');
    s = act(s, 'CALL');
    expect(s.toAct).toBe(1);
    expect(legalPokerActions(s, '1')!.canRaise).toBe(false);
  });
  it('rejects invalid seating and chip bounds', () => {
    for (const c of [
      config([1]),
      config([0, 1]),
      config([1.5, 10]),
      config([1e9, 1]),
      { ...config(), dealer: 3 },
      {
        ...config(),
        players: [
          { id: 'same', stack: 10 },
          { id: 'same', stack: 10 },
        ],
      },
    ])
      expect(() => createPokerHand(c, deck)).toThrow();
  });
});
