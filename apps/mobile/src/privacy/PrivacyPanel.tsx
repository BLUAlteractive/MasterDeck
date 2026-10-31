import { useEffect, useState } from 'react';
import { ScrollView, Text, Share, Linking } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { shellTheme } from '@deckforge/ui';
import {
  privacyExportQuerySchema,
  type PrivacyExport,
} from '@deckforge/contracts';
import type { CollectionClient } from '../collection/client';
import { Action } from '../collection/controls';
export function PrivacyPanel({
  client,
  onDeletionAccepted,
}: {
  client: CollectionClient | null;
  onDeletionAccepted: ((requestId: string) => Promise<void>) | undefined;
}) {
  const [state, setState] = useState<Awaited<
      ReturnType<CollectionClient['privacyState']>
    > | null>(null),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [page, setPage] = useState<PrivacyExport | null>(null);
  useEffect(() => {
    let active = true;
    if (client)
      void client
        .privacyState()
        .then((s) => {
          if (active) setState(s);
        })
        .catch(() => {
          if (active)
            setNotice(
              'Privacy settings unavailable. Retry by reopening this screen.',
            );
        });
    return () => {
      active = false;
    };
  }, [client]);
  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } catch {
      setNotice(
        'Request unconfirmed. Refresh before retrying; never assume deletion completed.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (!client)
    return (
      <Text style={{ color: shellTheme.text, padding: 16 }}>
        Connect your account to manage privacy, export records or request
        deletion.
      </Text>
    );
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ color: shellTheme.text, fontSize: 22 }}>
        Privacy & account
      </Text>
      <Text style={{ color: shellTheme.text }}>
        Analytics, activity upload and foreground location are separate choices,
        off by default. Enabling a choice does not grant OS permission or enable
        an unreleased activity provider.
      </Text>
      {state?.policy ? (
        <Action
          label="Read privacy policy"
          onPress={() => void Linking.openURL(state.policy!.url)}
        />
      ) : (
        <Text style={{ color: shellTheme.muted }}>
          A reviewed regional policy is not configured. New opt-ins are
          unavailable.
        </Text>
      )}
      {(['ANALYTICS', 'ACTIVITY_UPLOAD', 'FOREGROUND_LOCATION'] as const).map(
        (purpose) => {
          const field =
            purpose === 'ANALYTICS'
              ? 'analytics'
              : purpose === 'ACTIVITY_UPLOAD'
                ? 'activityUpload'
                : 'foregroundLocation';
          const enabled = state?.choices[field] ?? false;
          return (
            <Action
              key={purpose}
              label={
                purpose +
                ': ' +
                (enabled ? 'enabled — withdraw' : 'disabled — enable')
              }
              disabled={busy || !state || (!enabled && !state.policy)}
              onPress={() =>
                void run(async () => {
                  await client.privacyConsent({
                    commandId: randomUUID(),
                    purpose,
                    enabled: !enabled,
                    ...(state?.policy
                      ? { policyVersion: state.policy.version }
                      : {}),
                  });
                  setState(await client.privacyState());
                  setNotice('Choice recorded by the server.');
                })
              }
            />
          );
        },
      )}
      <Text style={{ color: shellTheme.text }}>
        Export one bounded JSON page at a time. Share only to a destination you
        trust. Financial, game and provenance records may be retained under a
        reviewed policy; provider deletion is a separate verified process.
      </Text>
      {privacyExportQuerySchema.shape.resource.options.map((resource) => (
        <Action
          key={resource}
          label={'Export ' + resource}
          disabled={busy}
          onPress={() =>
            void run(async () => {
              setPage(await client.privacyExport({ resource }));
            })
          }
        />
      ))}
      {page ? (
        <>
          <Text selectable style={{ color: shellTheme.text }}>
            {JSON.stringify(page, null, 2)}
          </Text>
          <Action
            label="Share this export page"
            disabled={busy}
            onPress={() =>
              void Share.share({ message: JSON.stringify(page, null, 2) })
            }
          />
          {page.nextCursor ? (
            <Action
              label="Next export page"
              disabled={busy}
              onPress={() =>
                void run(async () =>
                  setPage(
                    await client.privacyExport({
                      resource: page.resource,
                      cursor: page.nextCursor!,
                    }),
                  ),
                )
              }
            />
          ) : null}
        </>
      ) : null}
      <Action
        label={confirm ? 'Keep my account' : 'Request account deletion'}
        disabled={busy}
        onPress={() => setConfirm(!confirm)}
      />
      {confirm ? (
        <>
          <Text style={{ color: shellTheme.text }}>
            This immediately revokes account access. Pending games must settle
            before verified provider removal and local pseudonymization.
            Immutable financial and ownership history remains. Export first.
            This cannot be undone here.
          </Text>
          <Action
            label="Confirm account deletion"
            disabled={busy}
            onPress={() =>
              void run(async () => {
                const receipt = await client.privacyDelete({
                  commandId: randomUUID(),
                  confirm: 'DELETE_ACCOUNT',
                });
                setNotice(
                  'Deletion requested: ' +
                    receipt.requestId +
                    '. Provider removal is pending. Disconnect to clear local credentials.',
                );
                setConfirm(false);
                await onDeletionAccepted?.(receipt.requestId);
              })
            }
          />
        </>
      ) : null}
      <Text
        accessibilityLiveRegion="polite"
        style={{ color: shellTheme.accent }}
      >
        {notice}
      </Text>
    </ScrollView>
  );
}
