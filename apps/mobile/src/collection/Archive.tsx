import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getFace } from '@deckforge/game-core';
import { shellTheme } from '@deckforge/ui';
import type { ArchiveCard } from '@deckforge/contracts';
import { Action } from './controls';
import { CollectionError, type CollectionClient } from './client';
import { historyLabel } from './model';
type Album = Awaited<ReturnType<CollectionClient['album']>>;
type History = Awaited<ReturnType<CollectionClient['history']>>;
export function Archive({ client }: { client: CollectionClient | null }) {
  const [filter, setFilter] = useState<'all' | 'current' | 'former'>('all');
  const [reload, setReload] = useState(0);
  const [cards, setCards] = useState<ArchiveCard[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [album, setAlbum] = useState<Album>({ items: [], nextCursor: null });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<ArchiveCard | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const pending = useRef<AbortController | null>(null);
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
      setAlbum({ items: [], nextCursor: null });
      setSelected(null);
      setHistory(null);
      setCursor(null);
    }
    setNotice(
      error instanceof CollectionError
        ? error.message
        : 'Could not load your archive. Try again.',
    );
  }
  useEffect(() => {
    pending.current?.abort();
    setCards([]);
    setCursor(null);
    setAlbum({ items: [], nextCursor: null });
    setSelected(null);
    setHistory(null);
    if (!client) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setNotice('Loading recorded ownership…');
    void Promise.all([
      client.archive(filter, undefined, controller.signal),
      client.album(undefined, controller.signal),
    ])
      .then(([page, series]) => {
        if (controller.signal.aborted) return;
        setCards(page.items);
        setCursor(page.nextCursor);
        setAlbum(series);
        setNotice(
          'Archive updated. Album counts include all recorded instances, beyond these loaded pages.',
        );
      })
      .catch((error) => {
        if (!controller.signal.aborted) fail(error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => {
      controller.abort();
      pending.current?.abort();
    };
  }, [client, filter, reload]);
  async function more(kind: 'cards' | 'series') {
    if (!client || busy) return;
    const prior = kind === 'cards' ? cursor : album.nextCursor;
    if (!prior) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    try {
      if (kind === 'cards') {
        const page = await client.archive(filter, prior, controller.signal);
        if (controller.signal.aborted || !mounted.current) return;
        if (page.nextCursor === prior) throw new Error('Repeated cursor');
        setCards((old) => [
          ...new Map(
            [...old, ...page.items].map((card) => [card.instanceId, card]),
          ).values(),
        ]);
        setCursor(page.nextCursor);
      } else {
        const page = await client.album(prior, controller.signal);
        if (controller.signal.aborted || !mounted.current) return;
        if (page.nextCursor === prior) throw new Error('Repeated cursor');
        setAlbum((old) => ({
          items: [
            ...new Map(
              [...old.items, ...page.items].map((series) => [
                series.seriesId,
                series,
              ]),
            ).values(),
          ],
          nextCursor: page.nextCursor,
        }));
      }
    } catch (error) {
      if (!controller.signal.aborted) fail(error);
    } finally {
      if (!controller.signal.aborted && mounted.current) setBusy(false);
    }
  }
  async function readHistory() {
    if (!client || !selected || busy) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    try {
      const page = await client.history(
        selected.instanceId,
        history?.nextVersion ?? 0,
        controller.signal,
      );
      if (controller.signal.aborted || !mounted.current) return;
      setHistory((old) => ({
        ...page,
        events: old ? [...old.events, ...page.events] : page.events,
      }));
    } catch (error) {
      if (!controller.signal.aborted) fail(error);
    } finally {
      if (!controller.signal.aborted && mounted.current) setBusy(false);
    }
  }
  function close() {
    pending.current?.abort();
    setBusy(false);
    setSelected(null);
    setHistory(null);
  }
  const header = (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.title}>
        Your album & archive
      </Text>
      <Text style={styles.text}>
        Current holdings and cards you previously held stay distinct. Consumed
        or revoked instances remain in your record.
      </Text>
      {!client ? (
        <Text style={styles.text}>
          Connect your account to view its private archive. Artwork previews do
          not create ownership or discovery records.
        </Text>
      ) : (
        <>
          <Action
            label="Refresh archive"
            disabled={busy}
            onPress={() => setReload((value) => value + 1)}
          />
          <Text accessibilityRole="header" style={styles.heading}>
            Series progress
          </Text>
          <Text style={styles.text}>
            Distinct faces count once per series. Recorded faces include former
            holdings; these counts are not achievement or reward grants.
          </Text>
          {album.items.map((series) => (
            <View key={series.seriesId} style={styles.panel}>
              <Text style={styles.heading}>{series.seriesName}</Text>
              <Text style={styles.text}>
                {series.currentFaces} of 52 faces owned now ·{' '}
                {series.currentInstances} current instances
              </Text>
              <Text style={styles.text}>
                {series.recordedFaces} of 52 faces recorded ·{' '}
                {series.recordedInstances} recorded instances
              </Text>
              {series.completeNow ? (
                <Text style={styles.accent}>Complete series owned now</Text>
              ) : null}
              {series.completeRecorded ? (
                <Text style={styles.accent}>
                  All 52 faces recorded in your archive
                </Text>
              ) : null}
            </View>
          ))}
          {!busy && album.items.length === 0 ? (
            <Text style={styles.text}>No series recorded yet.</Text>
          ) : null}
          {album.nextCursor ? (
            <Action
              label="Load more series"
              disabled={busy}
              onPress={() => void more('series')}
            />
          ) : null}
          <Text accessibilityRole="header" style={styles.heading}>
            Personal achievements
          </Text>
          <Text style={styles.text}>
            Verified achievement progress and rewards are not connected yet. No
            achievements are inferred from preview art or archive counts.
          </Text>
          <Text accessibilityRole="header" style={styles.heading}>
            Recorded card instances
          </Text>
          <View style={styles.row}>
            {(['all', 'current', 'former'] as const).map((value) => (
              <Action
                key={value}
                label={
                  value === 'all'
                    ? 'All records'
                    : value === 'current'
                      ? 'Owned now'
                      : 'Previously owned'
                }
                selected={filter === value}
                disabled={busy}
                onPress={() => setFilter(value)}
              />
            ))}
          </View>
          <Text style={styles.text}>
            {cards.length} loaded{cursor ? ' · More records available' : ''}
          </Text>
        </>
      )}
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={styles.accent}>
          {notice}
        </Text>
      ) : null}
    </View>
  );
  return (
    <View style={styles.page}>
      <FlatList
        data={cards}
        keyExtractor={(card) => card.instanceId}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        contentContainerStyle={styles.list}
        ListHeaderComponent={header}
        ListEmptyComponent={
          client ? (
            <Text style={styles.text}>
              {busy ? 'Loading…' : 'No recorded cards in this view.'}
            </Text>
          ) : (
            <View />
          )
        }
        ListFooterComponent={
          cursor ? (
            <Action
              label="Load more archive records"
              disabled={busy}
              onPress={() => void more('cards')}
            />
          ) : (
            <View />
          )
        }
        renderItem={({ item }) => (
          <View style={styles.panel}>
            <Action
              label={
                getFace(item.faceId).label +
                ' · ' +
                (item.holding === 'OWNED_NOW'
                  ? 'Owned now'
                  : 'Previously owned') +
                ' · ' +
                item.status +
                (item.editionSerial === null
                  ? ''
                  : ' · Serial ' + item.editionSerial)
              }
              disabled={busy}
              onPress={() => {
                setSelected(item);
                setHistory(null);
              }}
            />
            <Text style={styles.text}>
              {item.seriesName} · Level {item.level} · {item.rarity}
            </Text>
          </View>
        )}
      />
      <Modal
        visible={selected !== null}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <View style={styles.backdrop}>
          <View accessibilityViewIsModal style={styles.inspector}>
            <ScrollView contentContainerStyle={styles.section}>
              {selected ? (
                <>
                  <Text accessibilityRole="header" style={styles.heading}>
                    {getFace(selected.faceId).label}
                  </Text>
                  <Text style={styles.text}>
                    {selected.holding === 'OWNED_NOW'
                      ? 'Owned now'
                      : 'Previously owned'}{' '}
                    · {selected.status}
                  </Text>
                  <Text style={styles.text}>
                    {selected.seriesName} · Template version{' '}
                    {selected.templateVersion}
                  </Text>
                  <Text selectable style={styles.text}>
                    Instance {selected.instanceId}
                  </Text>
                  <Text style={styles.text}>
                    {selected.editionSerial === null
                      ? 'No edition serial recorded.'
                      : 'Edition serial ' +
                        selected.editionSerial +
                        '. Print-run cap is not recorded here.'}
                  </Text>
                  <Text style={styles.text}>
                    {selected.origin
                      ? 'Original issuance: ' +
                        historyLabel(selected.origin.action) +
                        ' · ' +
                        new Date(
                          selected.origin.recordedAt,
                        ).toLocaleDateString()
                      : 'Original issuance is unknown in this legacy record.'}
                  </Text>
                  {selected.origin ? (
                    <Text selectable style={styles.text}>
                      Origin {selected.origin.eventId}
                    </Text>
                  ) : null}
                  <Action
                    label={
                      history?.nextVersion
                        ? 'Load more transformation history'
                        : 'View transformation history'
                    }
                    disabled={
                      busy || (history !== null && history.nextVersion === null)
                    }
                    onPress={() => void readHistory()}
                  />
                  {history ? (
                    <Text style={styles.text}>
                      {history.events
                        .map(
                          (event) =>
                            'Version ' +
                            event.stateVersion +
                            ' · ' +
                            historyLabel(event.action) +
                            ' · ' +
                            new Date(event.recordedAt).toLocaleDateString(),
                        )
                        .join('\n') || 'No recorded events.'}
                    </Text>
                  ) : null}
                  <Text style={styles.text}>
                    Fusion parent/child links will appear when verified fusion
                    is connected. No lineage is inferred from matching faces or
                    serials.
                  </Text>
                  <Action label="Close archive record" onPress={close} />
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
  page: { flex: 1, backgroundColor: shellTheme.background },
  list: {
    width: '100%',
    maxWidth: 980,
    alignSelf: 'center',
    padding: 16,
    gap: 12,
    paddingBottom: 36,
  },
  section: { gap: 14, paddingVertical: 16 },
  title: { fontSize: 30, fontWeight: '700', color: shellTheme.text },
  heading: { fontSize: 20, fontWeight: '600', color: shellTheme.text },
  text: { fontSize: 15, lineHeight: 23, color: shellTheme.muted },
  accent: { fontSize: 15, lineHeight: 23, color: shellTheme.accent },
  panel: {
    padding: 14,
    gap: 8,
    borderRadius: 12,
    backgroundColor: shellTheme.surface,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  backdrop: {
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
    padding: 20,
    backgroundColor: shellTheme.surface,
    borderRadius: 16,
  },
});
