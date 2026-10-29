export type SecretStore = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};
/** Fixed two-bank storage: encrypted native entries stay small; a failed write leaves the old pointer.
 * Operations are serialized, at most 64 chunks/key exist, and logout removes both banks.
 */
export function chunkedSecretStore(store: SecretStore) {
  let queue: Promise<unknown> = Promise.resolve();
  function run<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  }
  function parse(raw: string | null): { bank: 0 | 1; count: number } | null {
    if (raw === null) return null;
    const value = JSON.parse(raw) as { bank: number; count: number };
    if (
      (value.bank !== 0 && value.bank !== 1) ||
      !Number.isInteger(value.count) ||
      value.count < 1 ||
      value.count > 32
    )
      throw new Error('Invalid stored session');
    return { bank: value.bank, count: value.count };
  }
  return {
    getItem: (key: string) =>
      run(async () => {
        const pointer = parse(await store.getItem(key + '.pointer'));
        if (!pointer) return null;
        const parts = [];
        for (let i = 0; i < pointer.count; i++) {
          const part = await store.getItem(key + '.b' + pointer.bank + '.' + i);
          if (part === null) throw new Error('Incomplete stored session');
          parts.push(part);
        }
        return parts.join('');
      }),
    setItem: (key: string, value: string) =>
      run(async () => {
        const characters = Array.from(value);
        if (characters.length > 12800)
          throw new Error('Session exceeds secure storage limit');
        const old = parse(await store.getItem(key + '.pointer'));
        const bank = old?.bank === 0 ? 1 : 0;
        const count = Math.max(1, Math.ceil(characters.length / 400));
        for (let i = 0; i < count; i++)
          await store.setItem(
            key + '.b' + bank + '.' + i,
            characters.slice(i * 400, (i + 1) * 400).join(''),
          );
        await store.setItem(key + '.pointer', JSON.stringify({ bank, count }));
        // Cleanup is best-effort after the pointer commits. Fixed banks bound crash leftovers.
        for (let i = 0; i < 32; i++)
          if (i >= count)
            await store.removeItem(key + '.b' + bank + '.' + i).catch(() => {});
        if (old)
          for (let i = 0; i < 32; i++)
            await store
              .removeItem(key + '.b' + old.bank + '.' + i)
              .catch(() => {});
      }),
    removeItem: (key: string) =>
      run(async () => {
        await store.removeItem(key + '.pointer');
        for (const bank of [0, 1])
          for (let i = 0; i < 32; i++)
            await store.removeItem(key + '.b' + bank + '.' + i);
      }),
  };
}
export function sessionConfiguration(
  url: string | undefined,
  key: string | undefined,
) {
  if (!url && !key) return null;
  if (!url || !key) throw new Error('Incomplete account configuration');
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== '/' ||
    !/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(key)
  )
    throw new Error('Invalid public account configuration');
  return { url: parsed.origin, key };
}

export function authStorageKey(providerOrigin: string) {
  return (
    'deckforge.auth.' +
    new URL(providerOrigin).host.replace(/[^A-Za-z0-9.-]/g, '_')
  );
}
