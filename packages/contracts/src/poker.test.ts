import { expect, it } from 'vitest';
import { pokerViewSchema } from './poker';
import { projectPokerHand } from '../../game-poker/src/projection';
import { simulatePokerHand } from '../../game-poker/test/simulation';
it('accepts safe terminal projections and rejects private state or extra nested fields', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const { state } = simulatePokerHand(seed),
      view = projectPokerHand(state, state.players[0]!.id);
    expect(pokerViewSchema.safeParse(view).success).toBe(true);
    expect(
      pokerViewSchema.safeParse({ ...view, deck: state.deck }).success,
    ).toBe(false);
    expect(
      pokerViewSchema.safeParse({
        ...view,
        players: view.players.map((p) => ({ ...p, seed: 'secret' })),
      }).success,
    ).toBe(false);
    expect(pokerViewSchema.safeParse(state).success).toBe(false);
  }
});
