import { useEffect, useState } from 'react';
import { ScrollView, Text, View, Platform } from 'react-native';
import type {
  CosmeticPresentation,
  StorefrontView,
} from '@deckforge/contracts';
import { shellTheme } from '@deckforge/ui';
import type { CollectionClient } from '../collection/client';
export function CosmeticSwatch({
  presentation: p,
}: {
  presentation: CosmeticPresentation;
}) {
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`Preview ${p.kind} ${p.motif}`}
      style={{
        height: p.kind === 'CARD_BACK' ? 160 : 100,
        width: p.kind === 'TABLE_THEME' ? 240 : 110,
        borderRadius: p.kind === 'AVATAR' ? 55 : 12,
        backgroundColor: p.primaryColor,
        borderColor: p.accentColor,
        borderWidth: 4,
        overflow: 'hidden',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-evenly',
      }}
    >
      {p.motif === 'STRIPES'
        ? [0, 1, 2, 3].map((n) => (
            <View
              key={n}
              style={{
                height: '100%',
                width: 12,
                backgroundColor: p.accentColor,
              }}
            />
          ))
        : p.motif === 'DOTS'
          ? [0, 1, 2].map((n) => (
              <View
                key={n}
                style={{
                  height: 16,
                  width: 16,
                  borderRadius: 8,
                  backgroundColor: p.accentColor,
                }}
              />
            ))
          : null}
    </View>
  );
}
export function StorefrontBoard({ view }: { view: StorefrontView }) {
  return (
    <View style={{ gap: 14 }}>
      <Text
        style={{ color: shellTheme.text, fontSize: 24 }}
        accessibilityRole="header"
      >
        Cosmetic store
      </Text>
      <Text style={{ color: shellTheme.text }}>
        Fixed, known contents only. Cosmetic purchases never change earned
        rarity, level, style, fusion, printing speed, route rewards or game
        strength.
      </Text>
      {!view.available ? (
        <Text style={{ color: shellTheme.text }}>
          Paid cosmetics are unavailable in this development build.
        </Text>
      ) : (
        view.products.map((p) => (
          <View key={p.id} style={{ gap: 8 }}>
            <Text
              style={{ color: shellTheme.text, fontSize: 20 }}
              accessibilityRole="header"
            >
              {p.name}
            </Text>
            <Text style={{ color: shellTheme.text }}>{p.description}</Text>
            <Text style={{ color: shellTheme.text }}>
              Reference price {p.referencePrice.currency}{' '}
              {(
                p.referencePrice.amountMinor /
                10 ** p.referencePrice.minorUnits
              ).toFixed(p.referencePrice.minorUnits)}
              . Confirm the localized platform price before any purchase.
            </Text>
            <Text style={{ color: shellTheme.text }}>Exact contents:</Text>
            {p.contents.map((item) => (
              <View key={item.id} style={{ gap: 8 }}>
                <Text style={{ color: shellTheme.text }}>
                  {item.name} — {item.presentation.kind},{' '}
                  {item.presentation.motif}
                </Text>
                <CosmeticSwatch presentation={item.presentation} />
              </View>
            ))}
            <Text style={{ color: shellTheme.text }}>
              Purchases are unavailable in this build. No payment can be
              submitted here.
            </Text>
          </View>
        ))
      )}
    </View>
  );
}
export function Storefront({ client }: { client: CollectionClient | null }) {
  const [view, setView] = useState<StorefrontView>({
      available: false,
      products: [],
      checkout: 'UNAVAILABLE_IN_THIS_BUILD',
      functionalEffects: false,
      paidRandomizedContents: false,
    }),
    [notice, setNotice] = useState('');
  useEffect(() => {
    const c = new AbortController();
    if (client)
      void client
        .storefront(Platform.OS === 'android' ? 'GOOGLE' : 'APPLE', c.signal)
        .then((v) => {
          if (!c.signal.aborted) setView(v);
        })
        .catch(() => {
          if (!c.signal.aborted) setNotice('Could not load cosmetics.');
        });
    return () => c.abort();
  }, [client]);
  return (
    <ScrollView
      contentContainerStyle={{
        padding: 20,
        gap: 14,
        backgroundColor: shellTheme.background,
        flexGrow: 1,
      }}
    >
      <StorefrontBoard view={view} />
      <Text style={{ color: shellTheme.text }} accessibilityLiveRegion="polite">
        {notice}
      </Text>
    </ScrollView>
  );
}
