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
  it.each(['auth.pointer', 'auth.b0.0'])(
    'continues cleanup after a failed deletion of %s and supports retry',
    async (failedKey) => {
      const { data, store } = memory();
      let fail = false;
      const attempted: string[] = [];
      const storage = chunkedSecretStore({
        ...store,
        removeItem: async (key) => {
          attempted.push(key);
          if (fail && key === failedKey) throw new Error('Storage unavailable');
          await store.removeItem(key);
        },
      });
      await storage.setItem('auth', 'saved credential');
      data.set('auth.b1.31', 'leftover credential');
      attempted.length = 0;
      fail = true;
      await expect(storage.removeItem('auth')).rejects.toThrow(
        'Session cleanup incomplete',
      );
      expect(attempted).toHaveLength(65);
      expect(attempted).toContain('auth.b1.31');
      expect([...data.keys()]).toEqual([failedKey]);
      fail = false;
      await storage.removeItem('auth');
      expect(data.size).toBe(0);
      expect(await storage.getItem('auth')).toBeNull();
    },
  );
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
