import { describe, it, expect } from 'vitest';
import {
  transitionCardState,
  cardStateSchema,
  type CardState,
} from './lifecycle';
const token = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const owned: CardState = {
  status: 'OWNED',
  stateVersion: 1,
  lockToken: null,
  lockReason: null,
};
describe('pure card lifecycle', () => {
  it('locks and unlocks only with the owning reservation token and advances once', () => {
    const locked = transitionCardState(owned, {
      action: 'LOCK',
      lockToken: token,
      lockReason: 'MATCH',
    });
    expect(owned.stateVersion).toBe(1);
    expect(locked.stateVersion).toBe(2);
    expect(() =>
      transitionCardState(locked, {
        action: 'UNLOCK',
        lockToken: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      }),
    ).toThrow();
    expect(
      transitionCardState(locked, { action: 'UNLOCK', lockToken: token }),
    ).toEqual({ ...owned, stateVersion: 3 });
    expect(() =>
      transitionCardState(locked, { action: 'FUSION_CONSUME' }),
    ).toThrow();
  });
  it('never resurrects terminal cards across every action', () => {
    for (const action of ['FUSION_CONSUME', 'REVOKE'] as const) {
      const terminal = transitionCardState(owned, { action });
      for (const next of [
        { action: 'LOCK', lockToken: token, lockReason: 'MATCH' },
        { action: 'UNLOCK', lockToken: token },
        { action: 'FUSION_CONSUME' },
        { action: 'REVOKE' },
      ] as const)
        expect(() => transitionCardState(terminal, next)).toThrow();
    }
  });
  it('preserves lock/version invariants across generated command sequences', () => {
    for (let seed = 1; seed <= 100; seed++) {
      let state = owned;
      for (let step = 0; step < 20; step++) {
        const before = { ...state };
        const command =
          state.status === 'OWNED'
            ? { action: 'LOCK' as const, lockToken: token, lockReason: 'MATCH' }
            : { action: 'UNLOCK' as const, lockToken: token };
        state = transitionCardState(state, command);
        expect(cardStateSchema.safeParse(state).success).toBe(true);
        expect(state.stateVersion).toBe(before.stateVersion + 1);
        expect(before.stateVersion).toBe(1 + step);
        if ((seed * 17 + step) % 23 === 0) {
          state = transitionCardState(state, { action: 'REVOKE' });
          expect(() => transitionCardState(state, command)).toThrow();
          break;
        }
      }
    }
  });
});
