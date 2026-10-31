import { it, expect, vi } from 'vitest';
import type { PendingPack, PackOpeningReceipt } from '@deckforge/contracts';
import { attemptPack, pendingPackKey, readPendingPack } from './pending';
import type { SecretStore } from '../session/storage';
const origin = 'https://api.example.invalid';
const owner = '00000000-0000-4000-8000-000000000001',
  other = '00000000-0000-4000-8000-000000000002';
const pending: PendingPack = {
  packId: owner,
  command: { commandId: other, expectedDefinitionHash: 'a'.repeat(64) },
};
const receipt: PackOpeningReceipt = {
  openingId: other,
  packId: owner,
  definitionHash: 'a'.repeat(64),
  currency: 'TRAIL_CREDITS',
  charged: '100',
  rngVersion: 'HMAC_SHA256_V1',
  seedCommitment: 'b'.repeat(64),
  outcomes: [{ kind: 'TRAIL_INK', units: 1 }],
};
function storage() {
  const items = new Map<string, string>();
  const store: SecretStore = {
    getItem: async (key) => items.get(key) ?? null,
    setItem: async (key, value) => {
      items.set(key, value);
    },
    removeItem: async (key) => {
      items.delete(key);
    },
  };
  return { store, items };
}
it('persists before sending, recovers the exact command after a lost reply and isolates another owner', async () => {
  const { store, items } = storage();
  let calls = 0;
  const openPack = vi.fn(async (_packId, command) => {
    expect(items.get(pendingPackKey(owner, origin))).toContain(
      command.commandId,
    );
    if (++calls === 1) throw new TypeError('Lost reply');
    return receipt;
  });
  await expect(
    attemptPack(store, { openPack, apiOrigin: origin }, owner, pending),
  ).rejects.toThrow('Lost reply');
  expect(await readPendingPack(store, other, origin)).toBeNull();
  expect(
    await readPendingPack(store, owner, 'https://other.example.invalid'),
  ).toBeNull();
  const recovered = await readPendingPack(store, owner, origin);
  expect(recovered).toEqual(pending);
  expect(
    (
      await attemptPack(
        store,
        { openPack, apiOrigin: origin },
        owner,
        recovered!,
      )
    ).receipt,
  ).toEqual(receipt);
  expect(openPack.mock.calls[0]![1]).toEqual(openPack.mock.calls[1]![1]);
  expect(await readPendingPack(store, owner, origin)).toBeNull();
});
it('fails closed on storage failure or replacement of an unresolved command', async () => {
  const { store } = storage(),
    openPack = vi.fn(async () => receipt);
  await store.setItem(pendingPackKey(owner, origin), JSON.stringify(pending));
  await expect(
    attemptPack(store, { openPack, apiOrigin: origin }, owner, {
      ...pending,
      command: { ...pending.command, commandId: owner },
    }),
  ).rejects.toThrow('Resolve');
  expect(openPack).not.toHaveBeenCalled();
  await expect(
    attemptPack(
      {
        ...store,
        setItem: async () => {
          throw new Error('Storage unavailable');
        },
      },
      { openPack, apiOrigin: origin },
      owner,
      pending,
    ),
  ).rejects.toThrow('Storage unavailable');
  expect(openPack).not.toHaveBeenCalled();
});
it('retains the committed receipt if local cleanup fails and leaves the original retry recoverable', async () => {
  const { store } = storage(),
    failing = {
      ...store,
      removeItem: async () => {
        throw new Error('Cleanup unavailable');
      },
    };
  expect(
    await attemptPack(
      failing,
      { openPack: async () => receipt, apiOrigin: origin },
      owner,
      pending,
    ),
  ).toEqual({ receipt, cleanupPending: true });
  expect(await readPendingPack(store, owner, origin)).toEqual(pending);
});
