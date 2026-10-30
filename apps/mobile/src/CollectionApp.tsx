import { Fusion } from './fusion/Fusion';
import { SpadesLobby } from './play/SpadesLobby';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Action } from './collection/controls';
import { Archive } from './collection/Archive';
import type { CollectionClient } from './collection/client';
import { randomUUID } from 'expo-crypto';
import { PlayLobby } from './play/PlayLobby';
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
    <CollectionWorkspace
      key={collectionConnection?.sessionKey ?? 'preview-only'}
      client={client}
    />
  );
}
function CollectionWorkspace({ client }: { client: CollectionClient | null }) {
  const [view, setView] = useState<
    'gallery' | 'archive' | 'play' | 'spades' | 'fusion'
  >('gallery');
  return (
    <View style={{ flex: 1 }}>
      <View
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 }}
      >
        <Action
          label="Card gallery"
          selected={view === 'gallery'}
          onPress={() => setView('gallery')}
        />
        <Action
          label="Play"
          selected={view === 'play'}
          onPress={() => setView('play')}
        />
        <Action
          label="Spades"
          selected={view === 'spades'}
          onPress={() => setView('spades')}
        />
        <Action
          label="Fusion"
          selected={view === 'fusion'}
          onPress={() => setView('fusion')}
        />
        <Action
          label="Album & archive"
          selected={view === 'archive'}
          onPress={() => setView('archive')}
        />
      </View>
      <View
        style={{ flex: 1, display: view === 'gallery' ? 'flex' : 'none' }}
        accessibilityElementsHidden={view !== 'gallery'}
        importantForAccessibility={
          view === 'gallery' ? 'auto' : 'no-hide-descendants'
        }
      >
        <Gallery client={client} makeId={randomUUID} />
      </View>
      <View
        style={{ flex: 1, display: view === 'fusion' ? 'flex' : 'none' }}
        accessibilityElementsHidden={view !== 'fusion'}
        importantForAccessibility={
          view === 'fusion' ? 'auto' : 'no-hide-descendants'
        }
      >
        <Fusion client={client} makeId={randomUUID} />
      </View>
      {view === 'archive' ? <Archive client={client} /> : null}
      {view === 'spades' ? (
        <SpadesLobby client={client} makeId={randomUUID} />
      ) : null}
      {view === 'play' ? (
        <PlayLobby client={client} makeId={randomUUID} />
      ) : null}
    </View>
  );
}
