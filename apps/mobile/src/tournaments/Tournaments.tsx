import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text as NativeText, View } from 'react-native';
import type { ComponentProps } from 'react';
import type { TournamentView } from '@deckforge/contracts';
import { shellTheme } from '@deckforge/ui';
import { Action } from '../collection/controls';
import { CollectionError, type CollectionClient } from '../collection/client';
import { PokerTable } from '../play/PokerTable';
import {
  stageTournamentAction,
  type PendingTournamentAction,
  type TournamentIntent,
} from './pending';
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
const actionLabels: Record<TournamentView['nextAction'], string> = {
  REGISTER: 'Register for this free-entry event.',
  WAIT_START: 'Registered. Wait for the scheduled start.',
  READY: 'Confirm readiness for your assigned hand.',
  WAIT_OPPONENT:
    'Waiting for your opponent or the previous bracket result. Refresh the bracket to check.',
  PLAY: 'Your hand is available below.',
  COMPLETE: 'Your bracket participation is complete. See the results below.',
  CANCELLED: 'This event was cancelled. No entry fee was charged.',
  INELIGIBLE:
    'Entry is unavailable. Check eligibility and configuration status.',
};
export function TournamentBoard({
  event,
  busy = false,
  onAction = () => {},
}: {
  event: TournamentView;
  busy?: boolean;
  onAction?: (intent: TournamentIntent) => void;
}) {
  const ownMatch = event.matches.find(
    (m) =>
      m.status !== 'COMPLETE' &&
      m.gameId === null &&
      event.ownEntry !== null &&
      [m.leftSeed, m.rightSeed].includes(event.ownEntry),
  );
  const reporting =
    event.status === 'COMPLETED' &&
    event.reportUntil !== null &&
    new Date(event.reportUntil) > new Date();
  return (
    <View style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={{ fontSize: 22 }}>
        {event.name}
      </Text>
      <Text>
        Scheduled UTC: {event.startsAt}. Status: {event.status}. Registered:{' '}
        {event.registered}/{event.capacity}.
      </Text>
      <Text>
        Eligibility: {event.eligibility}. Your event seed:{' '}
        {event.ownEntry ?? 'not registered'}.
      </Text>
      <Text>
        Free entry. Each hand reserves {event.handBuyIn} earned Play Chips under
        the existing game policy. A complete playable loadout and sufficient
        earned chips are checked before each hand. No purchased chips.
      </Text>
      <Text>
        Classic heads-up, one hand per round. Higher final stack advances; equal
        stacks require a fresh hand and new readiness. A full field is required
        at start. Prize: prestige title “{event.prizeTitle}”. No cash or
        transferable prize.
      </Text>
      <Text accessibilityLiveRegion="polite">
        Next action: {actionLabels[event.nextAction]}
      </Text>
      {event.nextAction === 'REGISTER' ? (
        <Action
          label="Register — free tournament entry"
          disabled={busy}
          onPress={() =>
            onAction({ action: 'REGISTER', tournamentId: event.id })
          }
        />
      ) : null}
      {event.nextAction === 'READY' && ownMatch ? (
        <Action
          label={
            'Confirm ready for round ' +
            (ownMatch.round + 1) +
            ', hand attempt ' +
            ownMatch.attempt
          }
          disabled={busy}
          onPress={() =>
            onAction({
              action: 'READY',
              tournamentId: event.id,
              matchId: ownMatch.id,
              attempt: ownMatch.attempt,
            })
          }
        />
      ) : null}
      {event.status === 'COMPLETED' ? (
        <Text accessibilityRole="header">
          Archived result — champion seed {event.championSeed}. Title:{' '}
          {event.prizeTitle}.
        </Text>
      ) : null}
      <Text accessibilityRole="header">Bracket</Text>
      {event.matches.length ? (
        event.matches.map((m) => (
          <View
            key={m.id}
            style={{
              gap: 8,
              padding: 12,
              borderColor: shellTheme.text,
              borderWidth: 1,
            }}
          >
            <Text>
              Round {m.round + 1}, match {m.slot + 1}: seed{' '}
              {m.leftSeed ?? 'awaiting winner'} vs seed{' '}
              {m.rightSeed ?? 'awaiting winner'}. {m.status}. Attempt{' '}
              {m.attempt}.
              {m.winnerSeed !== null
                ? ' Winner: seed ' + m.winnerSeed + '.'
                : ''}
            </Text>
            {reporting && m.gameId ? (
              <View style={{ gap: 8 }}>
                <Text>Report this result for review:</Text>
                {(
                  [
                    'RESULT_INCONSISTENT',
                    'CONNECTION_FAILURE',
                    'COLLUSION',
                  ] as const
                ).map((code) => (
                  <Action
                    key={code}
                    label={
                      'Report ' +
                      code.toLowerCase().replaceAll('_', ' ') +
                      ' for round ' +
                      (m.round + 1)
                    }
                    disabled={busy}
                    onPress={() =>
                      onAction({
                        action: 'REPORT',
                        tournamentId: event.id,
                        matchId: m.id,
                        code,
                      })
                    }
                  />
                ))}
              </View>
            ) : null}
          </View>
        ))
      ) : (
        <Text>Bracket seeds are published when the full event starts.</Text>
      )}
      <Text accessibilityRole="header">Standings — verified round wins</Text>
      {event.standings.map((s) => (
        <Text key={s.seed}>
          Seed {s.seed}: {s.wins} wins.{s.champion ? ' Champion.' : ''}
        </Text>
      ))}
      {event.reportUntil ? (
        <Text>
          Result report deadline UTC: {event.reportUntil}. A report receipt
          requests review; it does not automatically change results. Full
          moderation case handling is pending.
        </Text>
      ) : null}
    </View>
  );
}
export function Tournaments({
  client,
  makeId,
}: {
  client: CollectionClient | null;
  makeId: () => string;
}) {
  const [items, setItems] = useState<TournamentView[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [selected, setSelected] = useState<TournamentView | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [unconfirmed, setUnconfirmed] = useState(false),
    life = useRef<AbortController | null>(null),
    working = useRef(false),
    pending = useRef<PendingTournamentAction | null>(null),
    selectedId = useRef<string | null>(null);
  useEffect(() => {
    const c = new AbortController();
    life.current = c;
    if (client) {
      working.current = true;
      setBusy(true);
      void client
        .tournaments(undefined, c.signal)
        .then((page) => {
          if (!c.signal.aborted) {
            setItems(page.items);
            setCursor(page.nextCursor);
          }
        })
        .catch(() => {
          if (!c.signal.aborted)
            setNotice('Could not load the tournament schedule.');
        })
        .finally(() => {
          if (!c.signal.aborted) {
            working.current = false;
            setBusy(false);
          }
        });
    }
    return () => c.abort();
  }, [client]);
  async function refresh(more = false, id?: string) {
    if (!client || working.current) return;
    working.current = true;
    setBusy(true);
    const signal = life.current?.signal;
    try {
      if (id) {
        const event = await client.tournament(id, signal);
        if (!signal?.aborted) {
          selectedId.current = id;
          setSelected(event);
        }
      } else {
        const page = await client.tournaments(
          more ? (cursor ?? undefined) : undefined,
          signal,
        );
        if (!signal?.aborted) {
          setItems((old) =>
            more
              ? [
                  ...new Map(
                    [...old, ...page.items].map((t) => [t.id, t]),
                  ).values(),
                ]
              : page.items,
          );
          setCursor(page.nextCursor);
        }
        if (selectedId.current) {
          const event = await client.tournament(selectedId.current, signal);
          if (!signal?.aborted) setSelected(event);
        }
      }
      if (!signal?.aborted)
        setNotice('Tournament information refreshed from the server.');
    } catch {
      if (!signal?.aborted)
        setNotice('Could not refresh. Reconnect and try again.');
    } finally {
      working.current = false;
      if (!signal?.aborted) setBusy(false);
    }
  }
  async function command(intent: TournamentIntent) {
    if (!client || working.current) return;
    const signal = life.current?.signal;
    try {
      pending.current = stageTournamentAction(pending.current, intent, makeId);
    } catch {
      setNotice(
        'An action is unconfirmed. Retry it before choosing another action.',
      );
      return;
    }
    const job = pending.current;
    working.current = true;
    setBusy(true);
    setUnconfirmed(true);
    try {
      let message = 'Server confirmed your action.';
      if (job.intent.action === 'REGISTER')
        await client.registerTournament(
          job.intent.tournamentId,
          job.commandId,
          signal,
        );
      else if (job.intent.action === 'READY')
        await client.readyTournament(
          job.intent.matchId,
          job.intent.attempt,
          job.commandId,
          signal,
        );
      else {
        const receipt = await client.reportTournament(
          job.intent.tournamentId,
          {
            commandId: job.commandId,
            matchId: job.intent.matchId,
            code: job.intent.code,
          },
          signal,
        );
        message = 'Result report recorded. Reference ' + receipt.id + '.';
      }
      if (signal?.aborted) return;
      pending.current = null;
      setUnconfirmed(false);
      setNotice(message);
      const event = await client.tournament(job.intent.tournamentId, signal);
      if (!signal?.aborted) {
        selectedId.current = event.id;
        setSelected(event);
        setItems((old) => old.map((t) => (t.id === event.id ? event : t)));
      }
    } catch (error) {
      if (signal?.aborted) return;
      if (
        error instanceof CollectionError &&
        [400, 403, 404, 409, 422].includes(error.status)
      ) {
        pending.current = null;
        setUnconfirmed(false);
        setNotice(
          'Action rejected. Refresh eligibility, roster, funds and result status before trying again.',
        );
      } else
        setNotice(
          pending.current
            ? 'Action could not be confirmed. Retry the unconfirmed action. Refresh does not resend it.'
            : 'Action was confirmed, but the bracket could not refresh. Refresh to see the current result.',
        );
    } finally {
      working.current = false;
      if (!signal?.aborted) setBusy(false);
    }
  }
  const active = selected?.matches.find(
    (m) => m.status === 'PLAYING' && m.gameId !== null,
  );
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Text accessibilityRole="header" style={{ fontSize: 26 }}>
        Tournaments
      </Text>
      {!client ? (
        <Text>
          Connect a permanent account to view schedules, register and play. No
          tournament is simulated in this preview.
        </Text>
      ) : (
        <>
          <Action
            label="Refresh tournament schedule and bracket"
            disabled={busy}
            onPress={() => void refresh()}
          />
          {!items.length ? (
            <Text>
              No published events returned. Tournament policy and identity must
              be configured before live registration.
            </Text>
          ) : (
            items.map((t) => (
              <Action
                key={t.id}
                label={t.name + ' — ' + t.status + ' — ' + t.startsAt}
                selected={selected?.id === t.id}
                disabled={busy}
                onPress={() => void refresh(false, t.id)}
              />
            ))
          )}
          {cursor ? (
            <Action
              label="Load more tournament schedules and archives"
              disabled={busy}
              onPress={() => void refresh(true)}
            />
          ) : null}
          {unconfirmed ? (
            <Action
              label="Retry unconfirmed tournament action"
              disabled={busy}
              onPress={() => {
                if (pending.current) void command(pending.current.intent);
              }}
            />
          ) : null}
          {selected ? (
            <TournamentBoard
              event={selected}
              busy={busy || unconfirmed}
              onAction={(intent) => void command(intent)}
            />
          ) : null}
          {active?.gameId ? (
            <PokerTable
              key={active.gameId}
              client={client}
              gameId={active.gameId}
              makeId={makeId}
            />
          ) : null}
        </>
      )}
      <Text accessibilityLiveRegion="polite">{notice}</Text>
    </ScrollView>
  );
}
