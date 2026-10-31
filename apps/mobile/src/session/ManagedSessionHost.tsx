import { pendingPackKey } from '../packs/pending';
import 'react-native-url-polyfill/auto';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, Text, View } from 'react-native';
import { createClient, type Session } from '@supabase/supabase-js';
import { createCollectionClient } from '../collection/client';
import { shellTheme } from '@deckforge/ui';
import { Action } from '../collection/controls';
import { CollectionApp } from '../CollectionApp';
import { authStorageKey, credentialStorage } from './nativeStorage';
import type { sessionConfiguration } from './storage';
import { disconnectMessage, disconnectSession } from './disconnect';
import { restoreAccount } from './restoration';
type Configuration = NonNullable<ReturnType<typeof sessionConfiguration>>;
export function ManagedSessionHost({
  config,
  apiUrl,
}: {
  config: Configuration;
  apiUrl: string;
}) {
  const storageKey = authStorageKey(config.url);
  const provider = useMemo(
    () =>
      createClient(config.url, config.key, {
        auth: {
          storage: credentialStorage,
          storageKey,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      }),
    [config.url, config.key, storageKey],
  );
  const disconnected = useRef(false);
  const [session, setSession] = useState<Session | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [ready, setReady] = useState<{
    userId: string;
    providerUserId: string;
    epoch: number;
  } | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('Restoring account…');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [needsCleanup, setNeedsCleanup] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [restoreState, setRestoreState] = useState<
    'pending' | 'ready' | 'failed'
  >('pending');
  useEffect(() => {
    let alive = true;
    setRestoreState('pending');
    const { data } = provider.auth.onAuthStateChange((event, next) => {
      if (!alive || disconnected.current) return;
      setSession(next);
      if (
        event === 'INITIAL_SESSION' ||
        event === 'SIGNED_IN' ||
        event === 'SIGNED_OUT'
      ) {
        setEpoch((value) => value + 1);
        setReady(null);
      }
      if (!next) {
        setBusy(false);
        setMessage('Explore first, or start a guest collection.');
      }
    });
    void restoreAccount(() => provider.auth.getSession()).then((result) => {
      if (!alive || disconnected.current) return;
      setRestoreState(result.status);
      if (result.status === 'failed') {
        setReady(null);
        setBusy(false);
        setMessage(
          'Could not restore your saved account. Guest creation is paused to protect saved access. Retry your saved account.',
        );
        return;
      }
      setSession(result.session);
      if (!result.session) {
        setBusy(false);
        setMessage('Explore first, or start a guest collection.');
      }
    });
    const appState =
      Platform.OS === 'web'
        ? null
        : AppState.addEventListener('change', (state) => {
            if (state === 'active' && !disconnected.current)
              provider.auth.startAutoRefresh();
            else provider.auth.stopAutoRefresh();
          });
    if (Platform.OS !== 'web') {
      if (AppState.currentState === 'active') provider.auth.startAutoRefresh();
      else provider.auth.stopAutoRefresh();
    }
    return () => {
      alive = false;
      data.subscription.unsubscribe();
      appState?.remove();
      provider.auth.stopAutoRefresh();
    };
  }, [provider, restoreAttempt]);
  useEffect(() => {
    if (!session || disconnected.current || restoreState !== 'ready') {
      setReady(null);
      return;
    }
    const controller = new AbortController();
    setBusy(true);
    setMessage('Connecting your collection…');
    void (async () => {
      const { data, error } = await provider.auth.getSession();
      if (error || !data.session || data.session.user.id !== session.user.id)
        throw new Error('Session unavailable');
      const profile = await createCollectionClient(
        apiUrl,
        async () => data.session!.access_token,
      ).bootstrap(controller.signal);
      if (!controller.signal.aborted) {
        setReady({
          userId: profile.userId,
          providerUserId: data.session.user.id,
          epoch,
        });
        setBusy(false);
        setMessage(
          profile.isGuest
            ? 'Guest collection connected.'
            : 'Collection connected.',
        );
      }
    })().catch(() => {
      if (!controller.signal.aborted) {
        setReady(null);
        setBusy(false);
        setMessage(
          'Could not connect your account to the API. Check development setup and retry.',
        );
      }
    });
    return () => controller.abort();
    // Token refresh keeps the same provider session; API requests obtain its fresh token below.
  }, [provider, session?.user.id, epoch, apiUrl, restoreState]);
  const connection = useMemo(
    () =>
      ready
        ? {
            apiUrl,
            sessionKey: ready.userId + ':' + ready.epoch,
            onDeletionAccepted: async (requestId: string) => {
              disconnected.current = true;
              provider.auth.stopAutoRefresh();
              setReady(null);
              const result = await disconnectSession({
                revokeServer: async () => {}, // The accepted deletion already revoked every local API session.
                signOutProvider: async () => {
                  const { error } = await provider.auth.signOut({
                    scope: 'local',
                  });
                  if (error) throw error;
                },
                clearCredentials: async () => {
                  const results = await Promise.allSettled([
                    credentialStorage.removeItem(storageKey),
                    credentialStorage.removeItem(
                      pendingPackKey(ready.userId, new URL(apiUrl).origin),
                    ),
                  ]);
                  if (results.some((r) => r.status === 'rejected'))
                    throw new Error('Local deletion cleanup incomplete');
                },
              });
              setSession(null);
              setNeedsCleanup(
                !result.providerSignedOut || !result.credentialsCleared,
              );
              setBusy(false);
              setMessage(
                'Deletion requested: ' +
                  requestId +
                  '. Provider removal remains pending. ' +
                  disconnectMessage(result),
              );
            },
            getAccessToken: async () => {
              const { data, error } = await provider.auth.getSession();
              if (
                disconnected.current ||
                error ||
                !data.session ||
                data.session.user.id !== ready.providerUserId
              )
                throw new Error('Session expired');
              return data.session.access_token;
            },
          }
        : undefined,
    [ready, provider, apiUrl],
  );
  async function guest() {
    if (restoreState !== 'ready' || needsCleanup || busy) return;
    disconnected.current = false;
    setBusy(true);
    try {
      const { error } = await provider.auth.signInAnonymously();
      if (error) throw error;
    } catch {
      setBusy(false);
      setMessage(
        'Guest sign-in is unavailable. Check anonymous sign-in, network and provider abuse settings.',
      );
    }
  }
  async function disconnect() {
    disconnected.current = true;
    setReady(null);
    setBusy(true);
    setConfirmDisconnect(false);
    provider.auth.stopAutoRefresh();
    const result = await disconnectSession({
      revokeServer: async () => {
        const { data, error } = await provider.auth.getSession();
        if (error || !data.session) throw new Error('Session unavailable');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        try {
          const response = await fetch(
            apiUrl.replace(/\/$/, '') + '/v1/auth/logout',
            {
              method: 'POST',
              headers: {
                Authorization: 'Bearer ' + data.session.access_token,
                'Content-Type': 'application/json',
              },
              body: '{}',
              signal: controller.signal,
            },
          );
          if (!response.ok) throw new Error('Revocation unconfirmed');
        } finally {
          clearTimeout(timer);
        }
      },
      signOutProvider: async () => {
        const { error } = await provider.auth.signOut({ scope: 'local' });
        if (error) throw error;
      },
      clearCredentials: () => credentialStorage.removeItem(storageKey),
    });
    setSession(null);
    setReady(null);
    setBusy(false);
    setNeedsCleanup(!result.providerSignedOut || !result.credentialsCleared);
    if (result.providerSignedOut && result.credentialsCleared)
      setRestoreState('ready');
    setMessage(disconnectMessage(result));
  }

  return (
    <View style={styles.page}>
      <View style={styles.account}>
        <Text accessibilityLiveRegion="polite" style={styles.text}>
          {message}
        </Text>
        {restoreState === 'failed' && !needsCleanup ? (
          <Action
            label="Retry saved account"
            disabled={busy}
            onPress={() => {
              setRestoreState('pending');
              setBusy(true);
              setMessage('Restoring saved account…');
              setRestoreAttempt((value) => value + 1);
            }}
          />
        ) : null}
        {needsCleanup ? (
          <Action
            label="Retry account cleanup"
            disabled={busy}
            onPress={() => void disconnect()}
          />
        ) : null}
        {!session ? (
          <>
            <Text style={styles.note}>
              {Platform.OS === 'web'
                ? 'Web guest access is saved in this tab and is lost when the tab is closed.'
                : 'Guest access is saved securely on this device.'}{' '}
              Account linking is not available in this build; do not disconnect
              a guest you need to keep.
            </Text>
            <Action
              label={busy ? 'Connecting…' : 'Start guest collection'}
              disabled={busy || needsCleanup || restoreState !== 'ready'}
              onPress={() => void guest()}
            />
          </>
        ) : (
          <>
            {confirmDisconnect ? (
              <>
                <Text style={styles.note}>
                  Disconnecting a guest can make its collection inaccessible
                  because linking is not available yet.
                </Text>
                <Action
                  label="Keep this session"
                  disabled={busy}
                  onPress={() => setConfirmDisconnect(false)}
                />
                <Action
                  label="Disconnect this session"
                  disabled={busy}
                  onPress={() => void disconnect()}
                />
              </>
            ) : (
              <Action
                label="Disconnect account"
                disabled={busy}
                onPress={() => setConfirmDisconnect(true)}
              />
            )}
            {!ready ? (
              <Action
                label="Retry account connection"
                disabled={busy}
                onPress={() => setEpoch((value) => value + 1)}
              />
            ) : null}
          </>
        )}
      </View>
      <CollectionApp
        {...(connection ? { collectionConnection: connection } : {})}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: shellTheme.background },
  account: {
    padding: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#607682',
  },
  text: { color: shellTheme.accent, fontSize: 15 },
  note: { color: shellTheme.muted, fontSize: 13, lineHeight: 19 },
});
