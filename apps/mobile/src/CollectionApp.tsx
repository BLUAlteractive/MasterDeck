import { PrivacyPanel } from './privacy/PrivacyPanel';
import { FeedbackProvider } from './experience/Feedback';
import { GettingStarted } from './experience/GettingStarted';
import { Tournaments } from './tournaments/Tournaments';
import { Storefront } from './commerce/Storefront';
import { Activity } from './activity/Activity';
import { Fusion } from './fusion/Fusion';
import { SpadesLobby } from './play/SpadesLobby';
import { useMemo, useState } from 'react';
import { View, ScrollView } from 'react-native';
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
    <FeedbackProvider key={collectionConnection?.sessionKey ?? 'preview-only'}>
      <CollectionWorkspace
        client={client}
        onDeletionAccepted={collectionConnection?.onDeletionAccepted}
      />
    </FeedbackProvider>
  );
}
function CollectionWorkspace({
  client,
  onDeletionAccepted,
}: {
  client: CollectionClient | null;
  onDeletionAccepted: ((requestId: string) => Promise<void>) | undefined;
}) {
  const [view, setView] = useState<
    | 'privacy'
    | 'gallery'
    | 'archive'
    | 'play'
    | 'spades'
    | 'fusion'
    | 'activity'
    | 'storefront'
    | 'tournaments'
  >('gallery');
  return (
    <View style={{ flex: 1 }}>
      <GettingStarted connected={client !== null} />
      <ScrollView
        horizontal
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ flexDirection: 'row', gap: 8, padding: 12 }}
        accessibilityLabel="Main navigation"
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
          label="Tournaments"
          selected={view === 'tournaments'}
          onPress={() => setView('tournaments')}
        />
        <Action
          label="Cosmetic store"
          selected={view === 'storefront'}
          onPress={() => setView('storefront')}
        />
        <Action
          label="Activity"
          selected={view === 'activity'}
          onPress={() => setView('activity')}
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
        <Action
          label="Privacy & account"
          selected={view === 'privacy'}
          onPress={() => setView('privacy')}
        />
      </ScrollView>
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
      {view === 'privacy' ? (
        <PrivacyPanel client={client} onDeletionAccepted={onDeletionAccepted} />
      ) : null}
      {view === 'activity' ? (
        <Activity client={client} makeId={randomUUID} />
      ) : null}
      {view === 'tournaments' ? (
        <Tournaments client={client} makeId={randomUUID} />
      ) : null}
      {view === 'storefront' ? <Storefront client={client} /> : null}
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
