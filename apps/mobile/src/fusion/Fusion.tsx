import { useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  AccessibilityInfo,
  Animated,
  ScrollView,
  Text as NativeText,
  TextInput,
  View,
} from 'react-native';
import { shellTheme } from '@deckforge/ui';
import type {
  FusionPolicy,
  FusionPreview,
  FusionReceipt,
  OwnedCard,
} from '@deckforge/contracts';
import { CollectionError, type CollectionClient } from '../collection/client';
import { Action } from '../collection/controls';
import { acceptFusion, stageFusion, type PendingFusion } from './model';
function Text(props: ComponentProps<typeof NativeText>) {
  return (
    <NativeText
      {...props}
      style={[
        { color: shellTheme.text, fontSize: 16, lineHeight: 24 },
        props.style,
      ]}
    />
  );
}
function Reveal({ receipt }: { receipt: FusionReceipt }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let live = true;
    let animation: Animated.CompositeAnimation | undefined;
    const preference = (reduce: boolean) => {
      animation?.stop();
      opacity.setValue(1);
      if (live && !reduce) {
        opacity.setValue(0.4);
        animation = Animated.timing(opacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        });
        animation.start();
      }
    };
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (live) preference(reduce);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      preference,
    );
    return () => {
      live = false;
      animation?.stop();
      opacity.setValue(1);
      subscription.remove();
    };
  }, [opacity, receipt.jobId]);
  return (
    <Animated.View style={{ opacity }}>
      <Text accessibilityRole="header">
        New card: {receipt.child.faceId}, Level {receipt.child.level}{' '}
        {receipt.child.branch}
      </Text>
      <Text>
        {receipt.child.rarity} · New instance {receipt.child.id}
      </Text>
    </Animated.View>
  );
}
export function FusionReview({
  preview,
  receipt,
  acknowledged,
  busy,
  uncertain,
  onAcknowledge,
  onConfirm,
  onCancel,
}: {
  preview: FusionPreview;
  receipt: FusionReceipt | null;
  acknowledged: boolean;
  busy: boolean;
  uncertain: boolean;
  onAcknowledge: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const effects = preview.effects;
  return (
    <View style={{ gap: 12 }}>
      <Text accessibilityRole="header">
        {receipt ? 'Fusion confirmed' : 'Review five-card fusion'}
      </Text>
      <Text>
        {receipt
          ? 'Consumed sources remain in your archive and history.'
          : 'These five instances will be permanently consumed. Their history stays in your archive. Previewing does not consume cards.'}
      </Text>
      {preview.sources.map((s) => (
        <Text key={s.id}>
          Source {s.id} · {s.faceId} · Level {s.level} · version{' '}
          {s.stateVersion}
        </Text>
      ))}
      <Text>
        Result: {preview.child.faceId} · Level {preview.child.level} ·{' '}
        {preview.child.branch} · {preview.child.rarity}
      </Text>
      <Text>
        Original series {preview.child.seriesId}; earned template{' '}
        {preview.child.templateId} and style preserved. No paid cosmetic affects
        this recipe.
      </Text>
      <Text>New instance: {preview.child.id}</Text>
      <Text>
        {effects.loadout
          ? `Loadout version ${effects.loadout.version}: replace ${effects.loadout.sourceId} with the new card.`
          : 'No loadout replacement.'}
      </Text>
      <Text>
        {effects.manager
          ? `Manager version ${effects.manager.version}: replace slots ${effects.manager.slots.join(', ')} with the child in slot ${effects.manager.slots[0]}; clear the other listed slots.`
          : 'No manager-slot changes.'}
      </Text>
      <Text>
        {effects.favoriteSources.length
          ? 'The new card inherits a favorite. Historical source favorites remain.'
          : 'The new card is not favorited.'}
      </Text>
      {receipt ? (
        <>
          <Reveal receipt={receipt} />
          <Text>Lineage parents: {receipt.consumed.join(', ')}</Text>
          <Text>Receipt {receipt.jobId}</Text>
        </>
      ) : (
        <>
          <Text>
            Policy {preview.policy.version}. Preview expires {preview.expiresAt}
            . Changed cards or selections require a fresh preview.
          </Text>
          {uncertain ? (
            <Text accessibilityLiveRegion="assertive">
              Confirmation outcome is unknown. Retry the same confirmation to
              recover its receipt before choosing other cards.
            </Text>
          ) : (
            <Action
              label={
                acknowledged
                  ? 'Confirmed: I understand these five cards will be consumed'
                  : 'I understand these five cards will be consumed'
              }
              selected={acknowledged}
              disabled={busy}
              onPress={onAcknowledge}
            />
          )}
          <Action
            label={
              uncertain
                ? 'Retry same fusion confirmation'
                : `Consume these 5 cards and create Level ${preview.child.level} card`
            }
            disabled={busy || (!acknowledged && !uncertain)}
            onPress={onConfirm}
          />
          <Action
            label="Cancel preview — consume nothing"
            disabled={busy || uncertain}
            onPress={onCancel}
          />
        </>
      )}
    </View>
  );
}
export function Fusion({
  client,
  makeId,
}: {
  client: CollectionClient | null;
  makeId: () => string;
}) {
  const [policy, setPolicy] = useState<FusionPolicy | null>(null),
    [loaded, setLoaded] = useState(false),
    [cards, setCards] = useState<OwnedCard[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [query, setQuery] = useState(''),
    [preview, setPreview] = useState<FusionPreview | null>(null),
    [receipt, setReceipt] = useState<FusionReceipt | null>(null),
    [acknowledged, setAcknowledged] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const pending = useRef<PendingFusion | null>(null),
    working = useRef(false),
    life = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    life.current = controller;
    if (client)
      void client
        .fusionPolicy(controller.signal)
        .then(async (configured) => {
          if (controller.signal.aborted) return;
          setPolicy(configured.policy);
          if (configured.policy) {
            const page = await client.list(undefined, controller.signal);
            if (controller.signal.aborted) return;
            setCards(page.items);
            setCursor(page.nextCursor);
          }
          setLoaded(true);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setLoaded(true);
            setNotice('Could not load fusion. Use Refresh to retry.');
          }
        });
    return () => controller.abort();
  }, [client]);
  async function run(action: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setNotice('');
    try {
      await action();
    } catch (error) {
      if (!life.current?.signal.aborted)
        setNotice(
          error instanceof CollectionError
            ? error.message
            : 'Could not verify that response. Please retry.',
        );
    } finally {
      working.current = false;
      if (!life.current?.signal.aborted) setBusy(false);
    }
  }
  async function reload() {
    if (!client || pending.current) return;
    await run(async () => {
      const configured = await client.fusionPolicy(life.current?.signal);
      if (life.current?.signal.aborted) return;
      setPolicy(configured.policy);
      setLoaded(true);
      if (configured.policy) {
        const page = await client.list(undefined, life.current?.signal);
        if (life.current?.signal.aborted) return;
        setCards(page.items);
        setCursor(page.nextCursor);
      }
      setSelected([]);
      setPreview(null);
      setReceipt(null);
      setAcknowledged(false);
    });
  }
  async function requestPreview() {
    if (!client || selected.length !== 5 || pending.current) return;
    await run(async () => {
      const result = await client.previewFusion(selected, life.current?.signal);
      if (life.current?.signal.aborted) return;
      setPreview(result);
      setReceipt(null);
      setAcknowledged(false);
    });
  }
  async function confirm() {
    if (!client || !preview || (!acknowledged && !pending.current)) return;
    await run(async () => {
      pending.current ??= stageFusion(preview, makeId());
      setUncertain(true);
      try {
        const value = await client.confirmFusion(
          pending.current.command,
          life.current?.signal,
        );
        if (life.current?.signal.aborted) return;
        const result = acceptFusion(pending.current, value);
        setReceipt(result);
        setSelected([]);
        pending.current = null;
        setUncertain(false);
        setAcknowledged(false);
        setNotice('Five sources consumed once. New card and lineage recorded.');
      } catch (error) {
        if (life.current?.signal.aborted) return;
        if (
          error instanceof CollectionError &&
          [400, 403, 404, 409, 422].includes(error.status)
        ) {
          pending.current = null;
          setUncertain(false);
          setPreview(null);
          setSelected([]);
          setAcknowledged(false);
          setNotice(
            'Confirmation rejected. Refresh your collection and request a new preview.',
          );
          return;
        }
        throw error;
      }
    });
  }
  const blocked = busy || uncertain;
  return (
    <ScrollView
      contentContainerStyle={{
        padding: 20,
        gap: 14,
        backgroundColor: shellTheme.background,
        flexGrow: 1,
      }}
    >
      <Text
        accessibilityRole="header"
        style={{ fontSize: 24, fontWeight: '700' }}
      >
        Fuse five cards
      </Text>
      {!client ? (
        <Text>
          Connect your account to preview and confirm fusion. Artwork preview
          does not grant owned cards.
        </Text>
      ) : (
        <>
          <Text accessibilityLiveRegion="polite">{notice}</Text>
          <Action
            label="Refresh fusion and collection"
            disabled={blocked}
            onPress={() => void reload()}
          />
          {!loaded ? (
            <Text>Loading fusion availability…</Text>
          ) : !policy ? (
            <Text>
              Fusion is unavailable until a reviewed server recipe is
              configured. No cards can be consumed here.
            </Text>
          ) : (
            <>
              <Text>
                Five matching owned copies become one new card. Blue 1 → 3 → 5;
                Red 2 → 4 → 6. Locked cards, terminal levels and capped-edition
                cards are ineligible. The server verifies eligibility.
              </Text>
              {preview ? (
                <FusionReview
                  preview={preview}
                  receipt={receipt}
                  acknowledged={acknowledged}
                  busy={busy}
                  uncertain={uncertain}
                  onAcknowledge={() => setAcknowledged((v) => !v)}
                  onConfirm={() => void confirm()}
                  onCancel={() => {
                    if (!pending.current) {
                      setPreview(null);
                      setAcknowledged(false);
                    }
                  }}
                />
              ) : (
                <>
                  <Text>
                    Selected {selected.length} of 5. Select matching face,
                    original series, branch, level and earned rarity.
                  </Text>
                  <TextInput
                    accessibilityLabel="Filter owned fusion sources by face or series"
                    placeholder="Search face or series"
                    placeholderTextColor={shellTheme.muted}
                    value={query}
                    onChangeText={setQuery}
                    editable={!blocked}
                    style={{
                      color: shellTheme.text,
                      borderColor: shellTheme.muted,
                      borderWidth: 1,
                      padding: 12,
                    }}
                  />
                  {cards
                    .filter((c) =>
                      `${c.faceId} ${c.seriesName}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((c) => (
                      <Action
                        key={c.instanceId}
                        label={`${c.faceId} Level ${c.level} ${c.branch} ${c.rarity}, ${c.seriesName}, ${c.status}, instance ${c.instanceId}`}
                        selected={selected.includes(c.instanceId)}
                        disabled={
                          blocked ||
                          c.status !== 'OWNED' ||
                          c.level > 4 ||
                          (!selected.includes(c.instanceId) &&
                            selected.length === 5)
                        }
                        onPress={() => {
                          if (!working.current && !pending.current)
                            setSelected((ids) =>
                              ids.includes(c.instanceId)
                                ? ids.filter((id) => id !== c.instanceId)
                                : ids.length < 5
                                  ? [...ids, c.instanceId]
                                  : ids,
                            );
                        }}
                      />
                    ))}
                  {!cards.length ? (
                    <Text>
                      No owned cards loaded. Earn eligible copies before using
                      fusion.
                    </Text>
                  ) : null}
                  {cursor ? (
                    <Action
                      label="Load more owned cards"
                      disabled={blocked}
                      onPress={() => {
                        if (client)
                          void run(async () => {
                            const page = await client.list(
                              cursor ?? undefined,
                              life.current?.signal,
                            );
                            if (life.current?.signal.aborted) return;
                            setCards((old) => [
                              ...new Map(
                                [...old, ...page.items].map((c) => [
                                  c.instanceId,
                                  c,
                                ]),
                              ).values(),
                            ]);
                            setCursor(page.nextCursor);
                          });
                      }}
                    />
                  ) : null}
                  <Action
                    label="Preview five sources and result — consume nothing"
                    disabled={blocked || selected.length !== 5}
                    onPress={() => void requestPreview()}
                  />
                </>
              )}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}
