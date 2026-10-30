import { useMemo } from 'react';
import { randomUUID } from 'expo-crypto';
import { Gallery } from './collection/Gallery';
import {
  createCollectionClient,
  type CollectionConnection,
} from './collection/client';
/** The managed-auth host supplies a refresh-aware getter and changes sessionKey on account/logout.
 * No bearer token is accepted from URLs, public env, component globals or preview fixtures.
 */
export function CollectionApp({
  collectionConnection,
}: { collectionConnection?: CollectionConnection } = {}) {
  const client = useMemo(
    () =>
      collectionConnection
        ? createCollectionClient(
            collectionConnection.apiUrl,
            collectionConnection.getAccessToken,
          )
        : null,
    [collectionConnection],
  );
  return (
    <Gallery
      key={collectionConnection?.sessionKey ?? 'preview-only'}
      client={client}
      makeId={randomUUID}
    />
  );
}
