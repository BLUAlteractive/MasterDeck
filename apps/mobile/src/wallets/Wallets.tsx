import { useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { shellTheme } from '@deckforge/ui';
import type { walletViewSchema } from '@deckforge/contracts';
import type { CollectionClient } from '../collection/client';
import { Action } from '../collection/controls';
type WalletView = ReturnType<typeof walletViewSchema.parse>;
export function WalletSummary({ view }: { view: WalletView }) {
  return (
    <>
      <Text style={{ color: shellTheme.text }}>
        Play Chips: {view.playChips}. Earned play only; cannot be purchased.
      </Text>
      <Text style={{ color: shellTheme.text }}>
        Trail Credits: {view.trailCredits}. Earned through validated activity or
        equivalent nonwalking quests. Used for functional screens, earned packs
        and supplies.
      </Text>
      <Text style={{ color: shellTheme.text }}>
        Store Gems: {view.storeGems}. Paid cosmetics only; never gameplay power.
      </Text>
      <Text style={{ color: shellTheme.muted }}>
        Balances cannot be exchanged, transferred or cashed out. A displayed
        balance does not enable an unreleased store or activity provider.
      </Text>
    </>
  );
}
export function Wallets({ client }: { client: CollectionClient | null }) {
  const [view, setView] = useState<WalletView | null>(null),
    [notice, setNotice] = useState(''),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setView(null);
    if (client)
      void client
        .wallets()
        .then((v) => {
          if (active) {
            setView(v);
            setNotice('');
          }
        })
        .catch(() => {
          if (active) setNotice('Balances unavailable. Retry when connected.');
        });
    return () => {
      active = false;
    };
  }, [client, attempt]);
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
      <Text
        accessibilityRole="header"
        style={{ color: shellTheme.text, fontSize: 24 }}
      >
        Wallets
      </Text>
      {view ? (
        <WalletSummary view={view} />
      ) : (
        <Text style={{ color: shellTheme.text }}>
          {client
            ? 'Loading server balances…'
            : 'Connect your account to view its balances. Preview artwork has no wallet value.'}
        </Text>
      )}
      <Text
        accessibilityLiveRegion="polite"
        style={{ color: shellTheme.muted }}
      >
        {notice}
      </Text>
      <Action
        label="Refresh balances"
        disabled={!client}
        onPress={() => setAttempt((n) => n + 1)}
      />
    </ScrollView>
  );
}
