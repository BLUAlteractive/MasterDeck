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

it('strictly validates declarative command identity, versions and wager payloads', async () => {
  const { pokerCommandSchema } = await import('./poker');
  const valid = {
    gameId: '55555555-5555-4555-8555-555555555555',
    commandId: 'command_12345',
    stateVersion: 0,
    payload: { action: 'CALL' },
  };
  expect(pokerCommandSchema.safeParse(valid).success).toBe(true);
  for (const body of [
    { ...valid, playerId: 'spoofed' },
    { ...valid, stateVersion: -1 },
    { ...valid, stateVersion: 0.5 },
    { ...valid, commandId: 'short' },
    { ...valid, payload: { action: 'CALL', target: 1 } },
    { ...valid, payload: { action: 'BET_TO', target: 0 } },
    { ...valid, payload: { action: 'BET_TO', target: Infinity } },
    { ...valid, payload: { action: 'WIN' } },
  ])
    expect(pokerCommandSchema.safeParse(body).success).toBe(false);
});
