import { describe, expect, it } from 'vitest';
import { restoreAccount } from './restoration';

describe('saved-account restoration boundary', () => {
  it('distinguishes a verified empty store from a failed SDK read with stale data', async () => {
    expect(
      await restoreAccount(async () => ({
        data: { session: null },
        error: null,
      })),
    ).toEqual({ status: 'ready', session: null });
    expect(
      await restoreAccount(async () => ({
        data: { session: { access_token: 'stale-private-token' } },
        error: new Error('Provider failed'),
      })),
    ).toEqual({ status: 'failed' });
  });
  it('preserves an inaccessible credential store and allows a subsequent successful retry', async () => {
    const saved = {
      access_token: 'saved-private-token',
      user: { id: 'same-user' },
    };
    let unavailable = true;
    let reads = 0;
    const read = async () => {
      reads++;
      if (unavailable) throw new Error('Private native diagnostics');
      return { data: { session: saved }, error: null };
    };
    const failure = await restoreAccount(read);
    expect(failure).toEqual({ status: 'failed' });
    expect(JSON.stringify(failure)).not.toContain('Private');
    unavailable = false;
    const retry = await restoreAccount(read);
    expect(retry).toEqual({ status: 'ready', session: saved });
    expect(reads).toBe(2);
  });
});
