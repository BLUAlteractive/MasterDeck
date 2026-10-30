import { expect, it } from 'vitest';
import {
  gameStartSchema,
  gameFinishSchema,
  playChipBalanceSchema,
} from './chips';
const id = '55555555-5555-4555-8555-555555555555';
it('rejects client-selected amounts, winners and result evidence', () => {
  const start = { lobbyId: id, commandId: 'start_command_123' };
  expect(gameStartSchema.safeParse(start).success).toBe(true);
  for (const extra of [
    { buyIn: 1 },
    { balance: '100' },
    { playerId: id },
    { seed: 1 },
  ])
    expect(gameStartSchema.safeParse({ ...start, ...extra }).success).toBe(
      false,
    );
  for (const extra of [{ winner: id }, { amount: 100 }, { allocation: {} }])
    expect(gameFinishSchema.safeParse({ gameId: id, ...extra }).success).toBe(
      false,
    );
});
it('represents balances as exact nonnegative decimal strings only', () => {
  for (const balance of ['0', '500', '9000000000000000000'])
    expect(
      playChipBalanceSchema.safeParse({ currency: 'PLAY_CHIPS', balance })
        .success,
    ).toBe(true);
  for (const balance of [-1, 100, '-1', '01', '1.2', '1e3'])
    expect(
      playChipBalanceSchema.safeParse({ currency: 'PLAY_CHIPS', balance })
        .success,
    ).toBe(false);
  expect(
    playChipBalanceSchema.safeParse({ currency: 'STORE_GEMS', balance: '100' })
      .success,
  ).toBe(false);
});
