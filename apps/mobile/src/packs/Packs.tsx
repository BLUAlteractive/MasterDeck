import { useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  Animated,
  Platform,
  ScrollView,
  Text as NativeText,
  View,
} from 'react-native';
import { shellTheme } from '@deckforge/ui';
import type {
  PackView,
  PackHistory,
  PackOpeningReceipt,
  PendingPack,
} from '@deckforge/contracts';
import { Action } from '../collection/controls';
import { CollectionError, type CollectionClient } from '../collection/client';
import { useFeedback } from '../experience/Feedback';
import { PurchaseHistory } from '../commerce/PurchaseHistory';
import { CosmeticSwatch } from '../commerce/Storefront';
import { attemptPack, readPendingPack, pendingPackKey } from './pending';
const textStyle = { color: shellTheme.text, fontSize: 16, lineHeight: 24 };
function Text(props: ComponentProps<typeof NativeText>) {
  return <NativeText {...props} style={[textStyle, props.style]} />;
}
export function PackReveal({ receipt }: { receipt: PackOpeningReceipt }) {
  const { reduceMotion } = useFeedback(),
    opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    opacity.setValue(1);
    if (reduceMotion) return;
    opacity.setValue(0.5);
    const animation = Animated.timing(opacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [opacity, receipt.openingId, reduceMotion]);
  return (
    <Animated.View style={{ opacity, gap: 8 }}>
      <Text accessibilityRole="header">Earned opening confirmed</Text>
      <Text>
        Charged {receipt.charged} Trail Credits · receipt {receipt.openingId}
      </Text>
      {receipt.outcomes.map((o, i) => (
        <Text key={i}>
          {o.kind === 'CARD'
            ? `${o.faceId} · ${o.branch} Level ${o.level} · ${o.rarity} · owned instance ${o.instanceId}`
            : `${o.units} bound Trail Ink`}
        </Text>
      ))}
      <Text>
        Published pool {receipt.definitionHash}. Items and balance come from the
        server.
      </Text>
    </Animated.View>
  );
}
export function PackShelf({
  packs,
  kind,
  disabled,
  onOpen,
}: {
  packs: PackView[];
  kind: 'DISCOVERY' | 'FIXED_COSMETIC';
  disabled: boolean;
  onOpen: (pack: PackView) => void;
}) {
  const matching = packs.filter((p) => p.definition.kind === kind);
  return (
    <View style={{ gap: 18 }}>
      <Text accessibilityRole="header">
        {kind === 'DISCOVERY'
          ? 'Earned discovery packs'
          : 'Fixed cosmetic packs'}
      </Text>
      <Text>
        {kind === 'DISCOVERY'
          ? 'Earn Trail Credits through accepted activity or accessible quests. Copies are allowed; there is no guaranteed rarity.'
          : 'Paid cosmetics change presentation only. They never change earned rarity, level, style, printing speed, route rewards or game strength.'}
      </Text>
      {!matching.length ? (
        <Text>No reviewed packs are available in this pathway.</Text>
      ) : null}
      {matching.map((p) => (
        <View
          key={p.id}
          style={{
            padding: 16,
            borderWidth: 1,
            borderColor: '#607682',
            borderRadius: 12,
            gap: 8,
          }}
        >
          <Text accessibilityRole="header">
            {p.definition.name} · version {p.version}
          </Text>
          <Text>
            Available until {p.definition.endsAt}.{' '}
            {p.remainingStock === null
              ? 'No finite stock limit.'
              : `${p.remainingStock} openings remaining.`}
          </Text>
          <Text>
            {p.definition.regions.length
              ? `Eligibility requires verified region: ${p.definition.regions.join(', ')}.`
              : 'Global offer.'}
          </Text>
          {p.definition.kind === 'DISCOVERY' ? (
            <>
              <Text>
                {p.definition.price} Trail Credits · {p.definition.drawCount}{' '}
                draws
              </Text>
              <Text>Exact odds per draw</Text>
              {p.odds.map((o, i) => (
                <Text key={i}>
                  {o.reward.kind === 'CARD'
                    ? `${o.reward.branch} card · template ${o.reward.templateId}`
                    : `${o.reward.units} Trail Ink`}
                  : {o.numerator}/{o.denominator}
                </Text>
              ))}
              <Action
                label={`Open ${p.definition.name} for ${p.definition.price} Trail Credits`}
                disabled={disabled || p.remainingStock === 0}
                onPress={() => onOpen(p)}
              />
            </>
          ) : p.fixedContents ? (
            <>
              <Text>Exact fixed contents · no random draws</Text>
              {p.fixedContents.contents.map((item) => (
                <View key={item.id}>
                  <Text>{item.name}</Text>
                  <CosmeticSwatch presentation={item.presentation} />
                </View>
              ))}
              <Text>
                Reference price {p.fixedContents.referencePrice.currency}{' '}
                {(
                  p.fixedContents.referencePrice.amountMinor /
                  10 ** p.fixedContents.referencePrice.minorUnits
                ).toFixed(p.fixedContents.referencePrice.minorUnits)}
                . Confirm the localized platform price in a native store build.
              </Text>
              <Text>
                Native checkout is unavailable in this build. No payment can be
                submitted here.
              </Text>
            </>
          ) : (
            <Text>Fixed contents could not be verified.</Text>
          )}
        </View>
      ))}
    </View>
  );
}
export function Packs({
  client,
  onOpened,
  makeId,
}: {
  client: CollectionClient | null;
  onOpened: () => void;
  makeId: () => string;
}) {
  const [kind, setKind] = useState<'DISCOVERY' | 'FIXED_COSMETIC'>('DISCOVERY'),
    [packs, setPacks] = useState<PackView[]>([]),
    [history, setHistory] = useState<PackHistory>({
      items: [],
      nextCursor: null,
    }),
    [receipt, setReceipt] = useState<PackOpeningReceipt | null>(null),
    [pending, setPending] = useState<PendingPack | null>(null),
    [owner, setOwner] = useState<string | null>(null),
    [isGuest, setIsGuest] = useState(true),
    [credits, setCredits] = useState(''),
    [ink, setInk] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const life = useRef<AbortController | null>(null),
    working = useRef(false),
    refreshVersion = useRef(0);
  const platform = Platform.OS === 'android' ? 'GOOGLE' : 'APPLE';
  async function refresh(c: CollectionClient, signal?: AbortSignal) {
    const version = ++refreshVersion.current;
    const [catalog, page, wallet, supplies] = await Promise.all([
      c.packs(platform, signal),
      c.packHistory(undefined, signal),
      c.wallets(),
      c.supplies(signal),
    ]);
    if (!signal?.aborted && version === refreshVersion.current) {
      setPacks(catalog.packs);
      setHistory(page);
      setCredits(wallet.trailCredits);
      setInk(supplies.trailInk);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    life.current = controller;
    if (client)
      void (async () => {
        const profile = await client.bootstrap(controller.signal),
          { credentialStorage } = await import('../session/nativeStorage'),
          saved = await readPendingPack(
            credentialStorage,
            profile.userId,
            client.apiOrigin,
          );
        if (controller.signal.aborted) return;
        setPending(saved);
        setIsGuest(profile.isGuest);
        setOwner(profile.userId);
        if (!controller.signal.aborted) {
          if (saved)
            setNotice(
              'An opening needs recovery. Retry its saved command before opening another pack.',
            );
        }
        try {
          await refresh(client, controller.signal);
        } catch {
          if (!controller.signal.aborted)
            setNotice(
              'Pack shelf could not refresh. Saved command recovery remains available.',
            );
        }
      })().catch(() => {
        if (!controller.signal.aborted)
          setNotice(
            'Could not load packs or saved retry state. Refresh or reconnect before spending.',
          );
      });
    return () => controller.abort();
    // The session host remounts on owner changes; no old-owner async update is accepted.
  }, [client]);
  async function open(pack?: PackView) {
    if (!client || !owner || working.current || isGuest) return;
    const command =
      pending ??
      (pack
        ? {
            packId: pack.id,
            command: {
              commandId: makeId(),
              expectedDefinitionHash: pack.definitionHash,
            },
          }
        : null);
    if (!command) return;
    working.current = true;
    setBusy(true);
    setPending(command);
    try {
      const { credentialStorage } = await import('../session/nativeStorage');
      const result = await attemptPack(
        credentialStorage,
        client,
        owner,
        command,
        life.current?.signal,
      );
      if (!life.current?.signal.aborted) {
        setReceipt(result.receipt);
        setPending(result.cleanupPending ? command : null);
        setNotice(
          result.cleanupPending
            ? 'Opening confirmed. Recover the saved command to clear its local retry before another opening.'
            : 'Opening confirmed. Refreshing owned inventory and balances.',
        );
        onOpened();
        try {
          await refresh(client, life.current?.signal);
        } catch {
          if (!life.current?.signal.aborted)
            setNotice(
              'Opening confirmed. Server balances/history could not refresh; retry refresh.',
            );
        }
      }
    } catch (error) {
      if (!life.current?.signal.aborted)
        setNotice(
          error instanceof CollectionError &&
            error.status >= 400 &&
            error.status < 500
            ? 'The server rejected this attempt. The saved command remains available for safe retry after resolving the issue.'
            : 'Result is unconfirmed. Retry the saved command; do not open another pack.',
        );
    } finally {
      working.current = false;
      if (!life.current?.signal.aborted) setBusy(false);
    }
  }
  async function cancel() {
    if (!client || !owner || !pending || working.current) return;
    working.current = true;
    setBusy(true);
    try {
      const result = await client.cancelPack(pending, life.current?.signal);
      const { credentialStorage } = await import('../session/nativeStorage');
      await credentialStorage.removeItem(
        pendingPackKey(owner, client.apiOrigin),
      );
      if (!life.current?.signal.aborted) {
        setPending(null);
        if (result.status === 'COMMITTED') {
          setReceipt(result.receipt);
          onOpened();
        }
        setNotice(
          result.status === 'COMMITTED'
            ? 'The opening had already committed; its original rewards are recovered.'
            : 'The saved command is cancelled on the server and cannot spend later.',
        );
        try {
          await refresh(client, life.current?.signal);
        } catch {
          /* Confirmed cancellation/receipt remains authoritative. */
        }
      }
    } catch {
      if (!life.current?.signal.aborted)
        setNotice(
          'Could not resolve the saved command. Keep it and retry recovery or cancellation.',
        );
    } finally {
      working.current = false;
      if (!life.current?.signal.aborted) setBusy(false);
    }
  }
  async function more() {
    if (!client || !history.nextCursor || working.current) return;
    working.current = true;
    setBusy(true);
    try {
      const page = await client.packHistory(
        history.nextCursor,
        life.current?.signal,
      );
      if (!life.current?.signal.aborted)
        setHistory((old) => ({
          items: [
            ...new Map(
              [...old.items, ...page.items].map((i) => [
                i.receipt.openingId,
                i,
              ]),
            ).values(),
          ],
          nextCursor: page.nextCursor,
        }));
    } catch {
      if (!life.current?.signal.aborted)
        setNotice('Could not load more opening history.');
    } finally {
      working.current = false;
      if (!life.current?.signal.aborted) setBusy(false);
    }
  }
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
      <Text accessibilityRole="header">Pack shelf</Text>
      {!client ? (
        <Text>
          Artwork preview. Connect your account to view reviewed packs, earned
          balances and opening history.
        </Text>
      ) : (
        <>
          <Text>
            Trail Credits (earned only): {credits || 'loading'} · bound Trail
            Ink: {ink || 'loading'}
          </Text>
          {isGuest ? (
            <Text>Link a permanent account before spending.</Text>
          ) : null}
          <Action
            label="Earned packs"
            selected={kind === 'DISCOVERY'}
            onPress={() => setKind('DISCOVERY')}
          />
          <Action
            label="Fixed cosmetics"
            selected={kind === 'FIXED_COSMETIC'}
            onPress={() => setKind('FIXED_COSMETIC')}
          />
          {pending ? (
            <>
              <Action
                label="Recover saved pack opening"
                disabled={busy || !owner || isGuest}
                onPress={() => void open()}
              />
              <Action
                label="Cancel saved attempt or recover its receipt"
                disabled={busy || !owner}
                onPress={() => void cancel()}
              />
            </>
          ) : null}
          <Action
            label="Refresh pack shelf and balances"
            disabled={busy}
            onPress={() => {
              void refresh(client, life.current?.signal)
                .then(() => {
                  if (!life.current?.signal.aborted)
                    setNotice('Server pack shelf and balances refreshed.');
                })
                .catch(() => {
                  if (!life.current?.signal.aborted)
                    setNotice('Could not refresh packs.');
                });
            }}
          />
          <PackShelf
            packs={packs}
            kind={kind}
            disabled={busy || !owner || isGuest || pending !== null}
            onOpen={(p) => void open(p)}
          />
          {receipt ? (
            <View accessibilityLiveRegion="polite">
              <PackReveal receipt={receipt} />
            </View>
          ) : null}
          <Text accessibilityRole="header">Earned opening history</Text>
          {!history.items.length ? (
            <Text>No confirmed earned openings loaded.</Text>
          ) : (
            history.items.map((i) => (
              <View key={i.receipt.openingId}>
                <Text>{i.openedAt}</Text>
                <PackReveal receipt={i.receipt} />
              </View>
            ))
          )}
          {history.nextCursor ? (
            <Action
              label="More earned openings"
              disabled={busy}
              onPress={() => void more()}
            />
          ) : null}
          <PurchaseHistory client={client} />
        </>
      )}
      <Text accessibilityLiveRegion="polite">{notice}</Text>
    </ScrollView>
  );
}
