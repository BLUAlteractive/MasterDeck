import { SafetyPanel } from './SafetyPanel';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { shellTheme } from '@deckforge/ui';
import { Text as NativeText, View } from 'react-native';
import { getFace } from '@deckforge/game-core';
import type { SpadesCommand, SpadesView } from '@deckforge/contracts';
import { CollectionError, type CollectionClient } from '../collection/client';
import { Action } from '../collection/controls';
import {
  acceptSpades,
  receiptSpades,
  stageSpades,
  type SpadesReplica,
} from './spades-replica';
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
export function SpadesTable({
  client,
  gameId,
  makeId,
  onComplete,
}: {
  client: CollectionClient;
  gameId: string;
  makeId: () => string;
  onComplete?: () => void;
}) {
  return (
    <ConnectedTable
      key={gameId}
      client={client}
      gameId={gameId}
      makeId={makeId}
      {...(onComplete ? { onComplete } : {})}
    />
  );
}
function ConnectedTable({
  client,
  gameId,
  makeId,
  onComplete,
}: {
  client: CollectionClient;
  gameId: string;
  makeId: () => string;
  onComplete?: () => void;
}) {
  const replica = useRef<SpadesReplica>({
      gameId,
      snapshot: null,
      pending: null,
    }),
    [view, setView] = useState<SpadesView | null>(null),
    [connected, setConnected] = useState(false),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(false),
    [notice, setNotice] = useState('');
  const lifecycle = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    const stop = client.watchSpades(
      gameId,
      (input) => {
        if (controller.signal.aborted) return;
        try {
          replica.current = acceptSpades(replica.current, input);
          setView(replica.current.snapshot!.view);
        } catch {
          setNotice('Could not synchronize this table.');
          setConnected(false);
        }
      },
      setConnected,
    );
    return () => {
      controller.abort();
      stop();
    };
  }, [client, gameId]);
  const notified = useRef(false);
  useEffect(() => {
    if (view?.phase === 'MATCH_COMPLETE' && !notified.current) {
      notified.current = true;
      onComplete?.();
    }
  }, [view?.phase, onComplete]);
  async function submit(payload?: SpadesCommand['payload']) {
    if (busy || !connected) return;
    const signal = lifecycle.current?.signal;
    try {
      if (payload) {
        replica.current = stageSpades(replica.current, makeId(), payload);
        setPending(true);
      }
      const command = replica.current.pending;
      if (!command) return;
      setBusy(true);
      const receipt = await client.spadesCommand(command, signal);
      if (signal?.aborted) return;
      replica.current = receiptSpades(replica.current, receipt);
      setView(replica.current.snapshot!.view);
      setPending(replica.current.pending !== null);
      setNotice('Command confirmed.');
    } catch (error) {
      if (
        !signal?.aborted &&
        error instanceof CollectionError &&
        [400, 403, 404, 409, 422].includes(error.status)
      ) {
        replica.current = { ...replica.current, pending: null };
        setPending(false);
        setNotice('Command rejected. Refreshing the table.');
        try {
          const fresh = await client.spadesGame(gameId, signal);
          if (!signal?.aborted) {
            replica.current = acceptSpades(replica.current, fresh);
            setView(replica.current.snapshot!.view);
          }
        } catch {
          if (!signal?.aborted)
            setNotice('Could not refresh the table. Reconnect before playing.');
        }
      } else if (!signal?.aborted)
        setNotice(
          'Command could not be confirmed. Reconnect and retry the same command.',
        );
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }
  if (!view)
    return (
      <Text accessibilityRole="status">Connecting to your Spades table…</Text>
    );
  return (
    <View style={{ backgroundColor: shellTheme.background }}>
      <SpadesBoard
        view={view}
        connected={connected}
        busy={busy || pending}
        onCommand={(payload) => void submit(payload)}
      />
      {pending ? (
        <Action
          label="Retry pending command"
          disabled={!connected || busy}
          onPress={() => void submit()}
        />
      ) : null}
      <SafetyPanel
        client={client}
        game="SPADES"
        gameId={gameId}
        makeId={makeId}
      />
      {notice ? <Text accessibilityRole="alert">{notice}</Text> : null}
    </View>
  );
}
export function SpadesBoard({
  view,
  connected,
  busy,
  onCommand,
}: {
  view: SpadesView;
  connected: boolean;
  busy: boolean;
  onCommand: (payload: SpadesCommand['payload']) => void;
}) {
  const [bid, setBid] = useState(3);
  const own = view.players.find((player) => player.hand !== null),
    partner = own
      ? view.players.find((player) => player.seat === (own.seat + 2) % 4)
      : null;
  const legal = view.legal,
    enabled = connected && !busy;
  const labelSeat = (seat: number) =>
    `Seat ${seat + 1}${own?.seat === seat ? ' (you)' : partner?.seat === seat ? ' (partner)' : ''}`;
  return (
    <View
      style={{ padding: 16, gap: 12, backgroundColor: shellTheme.background }}
    >
      <Text accessibilityRole="header">Spades — fixed partnerships</Text>
      <Text>
        Rules {view.rulesetVersion}. Round {view.round}. Target{' '}
        {view.rules.targetScore}. Spades{' '}
        {view.spadesBroken ? 'broken' : 'not broken'}.
      </Text>
      <Text accessibilityRole="status" accessibilityLiveRegion="polite">
        {connected
          ? view.toAct === own?.id
            ? 'Your turn.'
            : view.phase === 'MATCH_COMPLETE'
              ? 'Match complete.'
              : view.toAct
                ? `Waiting for ${labelSeat(view.players.find((player) => player.id === view.toAct)!.seat)}.`
                : 'Round complete.'
          : 'Reconnecting. Commands are paused.'}
      </Text>
      {view.players.map((player) => (
        <Text key={player.id}>
          {labelSeat(player.seat)}: bid{' '}
          {player.bid === null
            ? 'pending'
            : player.bid === 0
              ? 'nil'
              : player.bid}
          ; {player.tricks} tricks; {player.remaining} cards remaining.
        </Text>
      ))}
      {view.teams.map((team, index) => (
        <Text key={index}>
          Team {index + 1}
          {own?.team === index ? ' (your team)' : ''}: {team.score} points,{' '}
          {team.bags} bags.
        </Text>
      ))}
      <Text accessibilityRole="header">Current trick</Text>
      {view.currentTrick.length ? (
        view.currentTrick.map((play) => (
          <Text key={play.seat}>
            {labelSeat(play.seat)}: {getFace(play.face).label}
          </Text>
        ))
      ) : (
        <Text>No cards played in this trick.</Text>
      )}
      {view.lastTrick ? (
        <Text accessibilityLiveRegion="polite">
          Last trick: {labelSeat(view.lastTrick.winner)} won.{' '}
          {view.lastTrick.plays
            .map(
              (play) =>
                `${labelSeat(play.seat)} played ${getFace(play.face).label}`,
            )
            .join('; ')}
          .
        </Text>
      ) : null}
      {view.lastResult ? (
        <Text>
          Round {view.lastResult.round} scored once:{' '}
          {view.lastResult.teams
            .map(
              (team, index) =>
                `Team ${index + 1} ${team.delta >= 0 ? '+' : ''}${team.delta} points, ${team.bags} bags`,
            )
            .join('; ')}
          .
        </Text>
      ) : null}
      {view.winner !== null ? (
        <Text accessibilityRole="header">
          Team {view.winner + 1} wins the match.
        </Text>
      ) : null}
      {legal?.kind === 'BID' ? (
        <>
          <Text>Choose your bid. Nil means taking no tricks.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {Array.from(
              { length: 14 - legal.min },
              (_, index) => index + legal.min,
            ).map((value) => (
              <Action
                key={value}
                label={value === 0 ? 'Nil (zero tricks)' : `${value} tricks`}
                selected={bid === value}
                disabled={!enabled}
                onPress={() => setBid(value)}
              />
            ))}
          </View>
          <Action
            label={
              bid === 0 ? 'Confirm nil bid' : `Confirm bid of ${bid} tricks`
            }
            disabled={!enabled}
            onPress={() => onCommand({ kind: 'BID', tricks: bid })}
          />
        </>
      ) : null}
      <Text accessibilityRole="header">Your hand</Text>
      <Text>
        Follow the led suit when held. Spades win as trump; rarity never changes
        a trick. Only legal plays are enabled.
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {own?.hand?.map((face) => {
          const playable = legal?.kind === 'PLAY' && legal.cards.includes(face);
          return (
            <Action
              key={face}
              label={`${getFace(face).label} — ${playable ? 'legal play' : 'not playable now'}`}
              disabled={!enabled || !playable}
              onPress={() => onCommand({ kind: 'PLAY', face })}
            />
          );
        })}
      </View>
      {legal?.kind === 'CONTINUE' ? (
        <Action
          label="Continue to next round"
          disabled={!enabled}
          onPress={() => onCommand({ kind: 'CONTINUE' })}
        />
      ) : null}
    </View>
  );
}
