import { describe, it, expect } from 'vitest';
import {
  chunkedSecretStore,
  authStorageKey,
  sessionConfiguration,
  type SecretStore,
} from './storage';
function memory() {
  const data = new Map<string, string>();
  const store: SecretStore = {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
  };
  return { data, store };
}
describe('bounded secure session persistence', () => {
  it('round trips Unicode sessions in small native entries without plaintext outside the supplied secret store', async () => {
    const { data, store } = memory();
    const storage = chunkedSecretStore(store);
    const value = '😀東京'.repeat(2000);
    await storage.setItem('auth', value);
    expect(await storage.getItem('auth')).toBe(value);
    expect(
      [...data.values()].every(
        (part) => new TextEncoder().encode(part).length <= 1600,
      ),
    ).toBe(true);
    await storage.removeItem('auth');
    expect(data.size).toBe(0);
  });
  it('preserves the last complete session if a replacement write fails', async () => {
    const { store } = memory();
    let fail = false;
    const faulty = {
      ...store,
      setItem: async (key: string, value: string) => {
        if (fail && key.endsWith('.1')) throw new Error('Native write failed');
        await store.setItem(key, value);
      },
    };
    const storage = chunkedSecretStore(faulty);
    await storage.setItem('auth', 'old');
    fail = true;
    await expect(storage.setItem('auth', 'new'.repeat(500))).rejects.toThrow();
    expect(await storage.getItem('auth')).toBe('old');
  });
  it('serializes concurrent writes, bounds payloads and rejects incomplete/corrupt saved sessions', async () => {
    const { data, store } = memory();
    const storage = chunkedSecretStore(store);
    await Promise.all([
      storage.setItem('auth', 'one'),
      storage.setItem('auth', 'two'),
    ]);
    expect(await storage.getItem('auth')).toBe('two');
    await expect(storage.setItem('auth', 'x'.repeat(12801))).rejects.toThrow();
    expect(await storage.getItem('auth')).toBe('two');
    data.set('auth.pointer', '{"bank":0,"count":33}');
    await expect(storage.getItem('auth')).rejects.toThrow();
  });
});
describe('public provider configuration', () => {
  it('isolates credentials by provider origin without using secret material in keys', () => {
    expect(authStorageKey('https://one.supabase.co')).not.toBe(
      authStorageKey('https://two.supabase.co'),
    );
    expect(authStorageKey('https://one.supabase.co')).toMatch(
      /^[A-Za-z0-9._-]+$/,
    );
  });
  it('allows preview-only absence and only public-key HTTPS provider origins', () => {
    expect(sessionConfiguration(undefined, undefined)).toBeNull();
    expect(
      sessionConfiguration(
        'https://dev.supabase.co',
        'sb_publishable_abcdefghijklmnop',
      ),
    ).toMatchObject({ url: 'https://dev.supabase.co' });
    for (const [url, key] of [
      ['http://dev.supabase.co', 'sb_publishable_abcdefghijklmnop'],
      ['https://dev.supabase.co', 'sb_secret_administrative'],
      ['https://u:p@dev.supabase.co', 'sb_publishable_abcdefghijklmnop'],
    ])
      expect(() => sessionConfiguration(url, key)).toThrow();
  });
});
