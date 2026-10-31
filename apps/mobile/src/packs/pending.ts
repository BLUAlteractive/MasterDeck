import {
  pendingPackSchema,
  profileSchema,
  type PendingPack,
} from '@deckforge/contracts';
import type { SecretStore } from '../session/storage';
import type { CollectionClient } from '../collection/client';
export const pendingPackKey = (ownerId: string, origin: string) =>
  'deckforge.pack.pending.' +
  Array.from(origin)
    .map((c) => c.codePointAt(0)!.toString(16).padStart(6, '0'))
    .join('') +
  '.' +
  profileSchema.shape.userId.parse(ownerId);
export async function readPendingPack(
  store: SecretStore,
  ownerId: string,
  origin: string,
) {
  const raw = await store.getItem(pendingPackKey(ownerId, origin));
  return raw === null ? null : pendingPackSchema.parse(JSON.parse(raw));
}
/** Persist before sending; another command cannot replace an unresolved owner's opening. */
export async function attemptPack(
  store: SecretStore,
  client: Pick<CollectionClient, 'openPack' | 'apiOrigin'>,
  ownerId: string,
  pending: PendingPack,
  signal?: AbortSignal,
) {
  const origin = client.apiOrigin;
  const input = pendingPackSchema.parse(pending),
    prior = await readPendingPack(store, ownerId, origin);
  if (
    prior &&
    (prior.packId !== input.packId ||
      prior.command.commandId !== input.command.commandId ||
      prior.command.expectedDefinitionHash !==
        input.command.expectedDefinitionHash)
  )
    throw new Error('Resolve the saved opening first.');
  await store.setItem(pendingPackKey(ownerId, origin), JSON.stringify(input));
  const receipt = await client.openPack(input.packId, input.command, signal);
  let cleanupPending = false;
  try {
    await store.removeItem(pendingPackKey(ownerId, origin));
  } catch {
    cleanupPending = true;
  }
  return { receipt, cleanupPending };
}
