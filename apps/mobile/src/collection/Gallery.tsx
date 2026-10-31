import { useFeedback } from '../experience/Feedback';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { getFace } from '@deckforge/game-core';
import { shellTheme } from '@deckforge/ui';
import { Action } from './controls';
import { CardArt } from './CardArt';
import { CardTile } from './CardTile';
import {
  filterGallery,
  completeUniqueSelection,
  historyLabel,
  inventoryEntries,
  mergeInventory,
  previewEntries,
  stageCard,
  type GalleryEntry,
} from './model';
import {
  CollectionError,
  type CollectionClient,
  type OwnedCard,
} from './client';
type History = Awaited<ReturnType<CollectionClient['history']>>;
export function Gallery({
  client = null,
  makeId,
}: {
  client?: CollectionClient | null;
  makeId: () => string;
}) {
  const { reduceMotion } = useFeedback();
  const [reload, setReload] = useState(0);
  const [mode, setMode] = useState<'preview' | 'owned'>('preview');
  const [cards, setCards] = useState<OwnedCard[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [series, setSeries] = useState('');
  const [suit, setSuit] = useState('');
  const [sort, setSort] = useState<'suit' | 'rank-up' | 'rank-down'>('suit');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [previewFavorites, setPreviewFavorites] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [selected, setSelected] = useState<GalleryEntry | null>(null);
  const [back, setBack] = useState(false);
  const [history, setHistory] = useState<History | null>(null);
  const [saved, setSaved] =
    useState<
      Awaited<ReturnType<CollectionClient['currentLoadout']>>['loadout']
    >(null);
  const [staged, setStaged] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const pending = useRef<AbortController | null>(null);
  const selectedKey = useRef<string | null>(null);
  // A retry keeps its exact command/key after an ambiguous network outcome.
  const equipCommand = useRef<Parameters<CollectionClient['equip']>[0] | null>(
    null,
  );
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pending.current?.abort();
    };
  }, []);
  function fail(error: unknown) {
    if (!mounted.current) return;
    if (error instanceof CollectionError && error.status === 401) {
      setCards([]);
      setSelected(null);
      setSaved(null);
      setStaged({});
      equipCommand.current = null;
    }
    setNotice(
      error instanceof CollectionError
        ? error.message
        : 'Could not complete that request. Try again.',
    );
  }
  useEffect(() => {
    setCards([]);
    setCursor(null);
    setSaved(null);
    setStaged({});
    setSelected(null);
    equipCommand.current = null;
    if (mode !== 'owned' || !client) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setNotice('Loading your collection…');
    void Promise.all([
      client.list(undefined, controller.signal),
      client.currentLoadout(controller.signal),
    ])
      .then(([page, current]) => {
        if (controller.signal.aborted) return;
        setCards(page.items);
        setCursor(page.nextCursor);
        setSaved(current.loadout);
        setStaged(current.loadout?.faceToInstanceIds ?? {});
        setNotice(
          page.items.length ? 'Collection updated.' : 'No active cards yet.',
        );
      })
      .catch((error) => {
        if (!controller.signal.aborted) fail(error);
      })
      .finally(() => {
        if (pending.current === controller) pending.current = null;
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [client, mode, reload]);
  const entries = useMemo(
    () =>
      mode === 'owned'
        ? inventoryEntries(cards)
        : previewEntries.map((entry) => ({
            ...entry,
            favorite: previewFavorites.has(entry.key),
          })),
    [mode, cards, previewFavorites],
  );
  const filtered = useMemo(
    () =>
      filterGallery(entries, {
        search,
        seriesId: series,
        suit,
        favoritesOnly,
        sort,
      }),
    [entries, search, series, suit, favoritesOnly, sort],
  );
  const completeDeck = cursor === null ? completeUniqueSelection(cards) : null;
  const seriesOptions = [
    ...new Map(
      entries.map((entry) => [entry.seriesId, entry.seriesName]),
    ).entries(),
  ];
  const dimensions = useWindowDimensions();
  const available = Math.min(Math.max(dimensions.width, 320) - 40, 980);
  const columns = Math.max(2, Math.floor(available / 148));
  const cardWidth = Math.min(
    136,
    Math.floor((available - (columns - 1) * 12) / columns),
  );
  function closeDetails() {
    selectedKey.current = null;
    if (pending.current) {
      pending.current.abort();
      pending.current = null;
      setBusy(false);
    }
    setSelected(null);
  }
  function changeMode(next: 'preview' | 'owned') {
    pending.current?.abort();
    setBusy(false);
    setMode(next);
    setSeries('');
    setSearch('');
    setSuit('');
    setSelected(null);
    setNotice('');
  }
  async function more() {
    if (!client || !cursor || busy) return;
    const prior = cursor;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    try {
      const page = await client.list(cursor, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      if (page.nextCursor === prior) throw new Error('Repeated cursor');
      setCards((current) => mergeInventory(current, page.items));
      setCursor(page.nextCursor);
      setNotice('More cards loaded.');
    } catch (error) {
      if (!controller.signal.aborted) fail(error);
    } finally {
      if (pending.current === controller) pending.current = null;
      if (mounted.current && !controller.signal.aborted) setBusy(false);
    }
  }
  function open(entry: GalleryEntry) {
    selectedKey.current = entry.key;
    setSelected(entry);
    setBack(false);
    setHistory(null);
  }
  async function favorite() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      if (selected.owned && client) {
        const result = await client.favorite(
          selected.owned.instanceId,
          !selected.favorite,
        );
        if (!mounted.current) return;
        setCards((current) =>
          current.map((card) =>
            card.instanceId === result.instanceId
              ? { ...card, favorite: result.favorite }
              : card,
          ),
        );
        setSelected((current) =>
          current?.key === selected.key
            ? { ...current, favorite: result.favorite }
            : current,
        );
      } else if (!selected.owned) {
        const next = new Set(previewFavorites);
        if (next.has(selected.key)) next.delete(selected.key);
        else next.add(selected.key);
        setPreviewFavorites(next);
        setSelected({ ...selected, favorite: next.has(selected.key) });
      }
    } catch (error) {
      fail(error);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function readHistory() {
    if (!selected?.owned || !client || busy) return;
    const key = selected.key;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    try {
      const page = await client.history(
        selected.owned.instanceId,
        history?.nextVersion ?? 0,
        controller.signal,
      );
      if (!mounted.current || controller.signal.aborted) return;
      if (selectedKey.current === key)
        setHistory((previous) => ({
          ...page,
          events: previous ? [...previous.events, ...page.events] : page.events,
        }));
    } catch (error) {
      if (!controller.signal.aborted) fail(error);
    } finally {
      if (pending.current === controller) pending.current = null;
      if (mounted.current && !controller.signal.aborted) setBusy(false);
    }
  }
  async function equip() {
    if (!client || busy || Object.keys(staged).length !== 52) return;
    setBusy(true);
    try {
      equipCommand.current ??= {
        id: saved?.id ?? makeId(),
        expectedVersion: saved?.version ?? 0,
        idempotencyKey: makeId(),
        faceToInstanceIds: { ...staged },
      };
      await client.equip(equipCommand.current);
      if (!mounted.current) return;
      const current = await client.currentLoadout();
      if (!mounted.current) return;
      setSaved(current.loadout);
      setStaged(current.loadout?.faceToInstanceIds ?? {});
      equipCommand.current = null;
      setNotice(
        'Loadout saved. The server will check availability again before play.',
      );
    } catch (error) {
      if (
        error instanceof CollectionError &&
        error.status >= 400 &&
        error.status < 500
      ) {
        equipCommand.current = null;
        if (error.status === 409)
          setNotice(
            error.message + ' Reopen your collection to refresh its version.',
          );
        else fail(error);
      } else fail(error);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const header = (
    <View style={styles.header}>
      <Text style={styles.brand}>DECKFORGE / COLLECTION</Text>
      <Text accessibilityRole="header" style={styles.title}>
        A deck worth{'\n'}knowing by heart.
      </Text>
      <Text style={styles.subtitle}>
        {mode === 'preview'
          ? 'Explore 52 original faces. No account required.'
          : 'Your cards. Your history. One face at a time.'}
      </Text>
      <View style={styles.row}>
        <Action
          label="Artwork preview"
          disabled={busy}
          selected={mode === 'preview'}
          onPress={() => changeMode('preview')}
        />
        <Action
          label="Your collection"
          disabled={busy}
          selected={mode === 'owned'}
          onPress={() => changeMode('owned')}
        />
      </View>
      {mode === 'preview' ? (
        <Text style={styles.note}>
          DRAFT ARTWORK · Preview cards are not owned inventory. Preview
          favorites last for this session.
        </Text>
      ) : !client ? (
        <View style={styles.callout}>
          <Text style={styles.calloutTitle}>
            Your collection needs an account connection.
          </Text>
          <Text style={styles.note}>
            Account setup is still in progress for this development build. You
            can explore the artwork preview now.
          </Text>
          <Action
            label="Explore artwork preview"
            onPress={() => changeMode('preview')}
          />
        </View>
      ) : null}
      <TextInput
        accessibilityLabel="Search loaded cards by rank, suit or series"
        placeholder="Search rank, suit or series"
        placeholderTextColor="#a9bdc7"
        value={search}
        onChangeText={setSearch}
        style={styles.input}
      />
      <View style={styles.row}>
        {[
          ['', 'All suits'],
          ['CLUBS', 'Clubs'],
          ['DIAMONDS', 'Diamonds'],
          ['HEARTS', 'Hearts'],
          ['SPADES', 'Spades'],
        ].map(([value, label]) => (
          <Action
            key={value}
            label={label!}
            selected={suit === value}
            onPress={() => setSuit(value!)}
          />
        ))}
      </View>
      <View style={styles.row}>
        <Action
          label="All series"
          selected={!series}
          onPress={() => setSeries('')}
        />
        {seriesOptions.map(([id, name]) => (
          <Action
            key={id}
            label={name}
            selected={series === id}
            onPress={() => setSeries(id)}
          />
        ))}
      </View>
      <View style={styles.row}>
        <Action
          label="Suit & rank"
          selected={sort === 'suit'}
          onPress={() => setSort('suit')}
        />
        <Action
          label="Rank low to high"
          selected={sort === 'rank-up'}
          onPress={() => setSort('rank-up')}
        />
        <Action
          label="Rank high to low"
          selected={sort === 'rank-down'}
          onPress={() => setSort('rank-down')}
        />
        <Action
          label="Favorites only"
          selected={favoritesOnly}
          onPress={() => setFavoritesOnly(!favoritesOnly)}
        />
      </View>
      <Text accessibilityLiveRegion="polite" style={styles.note}>
        {filtered.length} shown · {entries.length} loaded
        {mode === 'owned' && cursor ? ' · More cards available' : ''}
      </Text>
      {mode === 'owned' && client ? (
        <View style={styles.callout}>
          <Action
            label="Reload saved collection"
            disabled={busy}
            onPress={() => setReload((value) => value + 1)}
          />
          <Text style={styles.calloutTitle}>Your 52-face loadout</Text>
          <Text style={styles.note}>
            {Object.keys(staged).length} of 52 faces selected ·{' '}
            {saved?.validation.valid
              ? 'Current selection available'
              : 'Availability checked by server'}
            . Open a card to choose it for its face.
          </Text>
          {completeDeck ? (
            <Action
              label="Select this complete deck"
              disabled={busy || equipCommand.current !== null}
              onPress={() => {
                setStaged(completeDeck);
                setNotice(
                  'All 52 distinct faces selected. Save the loadout to confirm.',
                );
              }}
            />
          ) : null}
          <Action
            label={
              equipCommand.current
                ? 'Retry pending loadout save'
                : 'Save 52-face loadout'
            }
            disabled={busy || Object.keys(staged).length !== 52}
            onPress={() => void equip()}
          />
          {cursor ? (
            <Text style={styles.note}>
              Search and filters apply to loaded cards. Load more below to
              include the rest of your inventory.
            </Text>
          ) : null}
        </View>
      ) : null}
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={styles.notice}>
          {notice}
        </Text>
      ) : null}
    </View>
  );
  return (
    <View style={styles.page}>
      <FlatList
        key={columns}
        data={filtered}
        keyExtractor={(entry) => entry.key}
        numColumns={columns}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        contentContainerStyle={[styles.list, { width: available + 24 }]}
        columnWrapperStyle={styles.gridRow}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {busy
              ? 'Loading…'
              : mode === 'owned' && !client
                ? 'No account collection is connected.'
                : 'No cards match these filters.'}
          </Text>
        }
        ListFooterComponent={
          mode === 'owned' && client && cursor ? (
            <View style={styles.footer}>
              <Action
                label={busy ? 'Loading…' : 'Load more owned cards'}
                disabled={busy}
                onPress={() => void more()}
              />
            </View>
          ) : (
            <View style={styles.footer}>
              <Text style={styles.note}>
                {mode === 'preview'
                  ? 'Original draft study · Front and back inspection available.'
                  : 'All loaded cards remain owned, whether displayed or equipped.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <CardTile entry={item} width={cardWidth} onPress={() => open(item)} />
        )}
      />
      <Modal
        visible={selected !== null}
        transparent
        animationType={reduceMotion ? 'none' : 'fade'}
        onRequestClose={closeDetails}
      >
        <View style={styles.modalBackdrop}>
          <View accessibilityViewIsModal style={styles.inspector}>
            <ScrollView
              contentContainerStyle={{ gap: 12 }}
              keyboardShouldPersistTaps="handled"
            >
              {selected ? (
                <>
                  <Text
                    accessibilityRole="header"
                    style={styles.inspectorTitle}
                  >
                    {getFace(selected.faceId).label}
                  </Text>
                  <Text style={styles.note}>
                    {selected.seriesName} ·{' '}
                    {selected.owned ? 'Owned card' : 'Draft artwork preview'}
                  </Text>
                  <View
                    style={styles.detailArt}
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel={
                      getFace(selected.faceId).label +
                      (back
                        ? ', ' +
                          (selected.owned?.branch ?? 'blue') +
                          ' back reference'
                        : ', front reference')
                    }
                  >
                    <CardArt entry={selected} back={back} width={156} />
                  </View>
                  {selected.owned ? (
                    <>
                      <Text style={styles.note}>
                        Level {selected.owned.level} · {selected.owned.branch} ·{' '}
                        {selected.owned.rarity} · {selected.owned.status}
                      </Text>
                      <Text selectable style={styles.id}>
                        Instance {selected.owned.instanceId}
                      </Text>
                      <Text style={styles.note}>
                        Face/back reference. Series artwork delivery is not
                        configured.
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.note}>
                      Preview only. This is not a granted card or an ownership
                      record.
                    </Text>
                  )}
                  <View style={styles.row}>
                    <Action
                      label={back ? 'Show front' : 'Show back'}
                      onPress={() => setBack(!back)}
                    />
                    <Action
                      label={
                        selected.favorite ? 'Remove favorite' : 'Add favorite'
                      }
                      disabled={busy}
                      onPress={() => void favorite()}
                    />
                  </View>
                  {selected.owned ? (
                    <>
                      <Action
                        label="Choose for this face"
                        disabled={
                          busy ||
                          selected.owned.status !== 'OWNED' ||
                          equipCommand.current !== null
                        }
                        onPress={() => {
                          if (!selected.owned) return;
                          setStaged((current) =>
                            stageCard(current, selected.owned!),
                          );
                          setNotice(
                            getFace(selected.faceId).label +
                              ' selected. Save the full loadout to confirm.',
                          );
                          setSelected(null);
                        }}
                      />
                      <Action
                        label={
                          history?.nextVersion
                            ? 'Load more history'
                            : 'View ownership history'
                        }
                        disabled={
                          busy ||
                          (history !== null && history.nextVersion === null)
                        }
                        onPress={() => void readHistory()}
                      />
                      {history ? (
                        <Text style={styles.note}>
                          {history.events
                            .map(
                              (event) =>
                                historyLabel(event.action) +
                                ' · ' +
                                new Date(
                                  event.recordedAt,
                                ).toLocaleDateString() +
                                ' · ' +
                                (event.actor === 'SELF'
                                  ? 'You'
                                  : event.actor === 'UNKNOWN'
                                    ? 'Recorded actor unknown'
                                    : 'DeckForge'),
                            )
                            .join('\n')}
                          {history.events.length === 0
                            ? 'No recorded events.'
                            : ''}
                        </Text>
                      ) : null}
                    </>
                  ) : null}
                  <Action label="Close card details" onPress={closeDetails} />
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: shellTheme.background,
    alignItems: 'center',
  },
  list: { maxWidth: 1004, padding: 12, paddingBottom: 32 },
  header: { gap: 14, paddingVertical: 24 },
  brand: {
    color: shellTheme.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
  title: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '700',
    color: shellTheme.text,
  },
  subtitle: { fontSize: 18, lineHeight: 26, color: shellTheme.muted },
  note: { color: shellTheme.muted, fontSize: 14, lineHeight: 21 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#607682',
    borderRadius: 10,
    minHeight: 48,
    padding: 12,
    color: shellTheme.text,
    fontSize: 16,
  },
  callout: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: shellTheme.surface,
    gap: 10,
  },
  calloutTitle: { color: shellTheme.text, fontSize: 18, fontWeight: '600' },
  notice: { color: shellTheme.accent, fontSize: 15, lineHeight: 23 },
  gridRow: { gap: 12, marginBottom: 20 },
  card: { gap: 6 },
  cardName: {
    fontSize: 15,
    lineHeight: 20,
    color: shellTheme.text,
    fontWeight: '600',
  },
  empty: { color: shellTheme.muted, paddingVertical: 36, fontSize: 17 },
  footer: { paddingVertical: 24 },
  modalBackdrop: {
    flex: 1,
    padding: 20,
    backgroundColor: '#000b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inspector: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '95%',
    backgroundColor: shellTheme.surface,
    padding: 20,
    borderRadius: 16,
    gap: 12,
  },
  inspectorTitle: { fontSize: 25, color: shellTheme.text, fontWeight: '700' },
  detailArt: { alignItems: 'center' },
  id: { fontSize: 12, color: shellTheme.muted },
});
