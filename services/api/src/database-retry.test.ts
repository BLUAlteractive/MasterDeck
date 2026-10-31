import { it, expect } from 'vitest';
import { retryableTransaction } from './database-retry';
it('recognizes driver-wrapped serialization/deadlock conflicts without retrying arbitrary failures', () => {
  expect(
    retryableTransaction(
      new Error('adapter', {
        cause: { kind: 'TransactionWriteConflict', originalCode: '40001' },
      }),
    ),
  ).toBe(true);
  expect(
    retryableTransaction(
      new Error('adapter', {
        cause: { kind: 'TransactionWriteConflict', originalCode: '40P01' },
      }),
    ),
  ).toBe(true);
  for (const e of [
    new Error('40001'),
    { cause: { kind: 'TransactionWriteConflict', originalCode: '40001' } },
    new Error('provider', {
      cause: { kind: 'Provider', originalCode: '40001' },
    }),
  ])
    expect(retryableTransaction(e)).toBe(false);
});
