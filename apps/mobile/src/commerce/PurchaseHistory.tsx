import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { PurchaseView } from '@deckforge/contracts';
import { shellTheme } from '@deckforge/ui';
import { Action } from '../collection/controls';
import type { CollectionClient } from '../collection/client';
export function PurchaseHistoryBoard({ items }: { items: PurchaseView[] }) {
  return (
    <View style={{ gap: 12 }}>
      <Text
        style={{ color: shellTheme.text, fontSize: 22 }}
        accessibilityRole="header"
      >
        Verified cosmetic history
      </Text>
      <Text style={{ color: shellTheme.text }}>
        A revoked purchase no longer provides its cosmetics. Other verified
        purchases can still provide the same item. No earned card or wallet is
        affected. Native store restores are unavailable in this development
        build.
      </Text>
      {!items.length ? (
        <Text style={{ color: shellTheme.text }}>
          No verified purchases in this account and environment.
        </Text>
      ) : (
        items.map((p) => (
          <View key={p.id}>
            <Text style={{ color: shellTheme.text }}>
              {p.product.name} — {p.status} · {p.environment} · {p.purchasedAt}
            </Text>
            <Text style={{ color: shellTheme.text }}>
              Recorded fixed contents:{' '}
              {p.product.contents.map((i) => i.name).join(', ')}. Receipt {p.id}
              .
            </Text>
          </View>
        ))
      )}
    </View>
  );
}
export function PurchaseHistory({ client }: { client: CollectionClient }) {
  const [items, setItems] = useState<PurchaseView[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    life = useRef<AbortController | null>(null),
    working = useRef(false);
  useEffect(() => {
    const c = new AbortController();
    life.current = c;
    void client
      .purchaseHistory(undefined, c.signal)
      .then((v) => {
        if (!c.signal.aborted) {
          setItems(v.items);
          setCursor(v.nextCursor);
        }
      })
      .catch(() => {
        if (!c.signal.aborted) setNotice('Could not load verified history.');
      });
    return () => c.abort();
  }, [client]);
  async function load(more: boolean) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      const page = await client.purchaseHistory(
        more ? (cursor ?? undefined) : undefined,
        life.current?.signal,
      );
      if (!life.current?.signal.aborted) {
        setItems((old) =>
          more
            ? [
                ...new Map(
                  [...old, ...page.items].map((p) => [p.id, p]),
                ).values(),
              ]
            : page.items,
        );
        setCursor(page.nextCursor);
        setNotice('History refreshed from the server.');
      }
    } catch {
      if (!life.current?.signal.aborted)
        setNotice('Could not refresh verified history.');
    } finally {
      working.current = false;
      if (!life.current?.signal.aborted) setBusy(false);
    }
  }
  return (
    <View style={{ gap: 12 }}>
      <PurchaseHistoryBoard items={items} />
      <Action
        label="Refresh verified purchase history"
        disabled={busy}
        onPress={() => void load(false)}
      />
      {cursor ? (
        <Action
          label="More verified purchases"
          disabled={busy}
          onPress={() => void load(true)}
        />
      ) : null}
      <Text style={{ color: shellTheme.text }} accessibilityLiveRegion="polite">
        {notice}
      </Text>
    </View>
  );
}
