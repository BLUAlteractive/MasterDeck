import { SafetyPanel } from './SafetyPanel';
import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import type { PokerRoomCommand, PokerViewResponse } from '@deckforge/contracts';
import { shellTheme } from '@deckforge/ui';
import { Action } from '../collection/controls';
import { CollectionError, type CollectionClient } from '../collection/client';
import { PokerMatchScreen } from './PokerMatchScreen';
import {
  createReplica,
  acceptSnapshot,
  acceptReceipt,
  stageCommand,
  rejectCommand,
  type RoomReplica,
} from './replica';
export function PokerBoard({
  view,
  connected,
  busy,
  pending,
  onCommand,
  onRetry,
}: {
  view: PokerViewResponse;
  connected: boolean;
  busy: boolean;
  pending: boolean;
  onCommand: (payload: PokerRoomCommand['payload']) => void;
  onRetry: () => void;
}) {
  const [target, setTarget] = useState(''),
    legal = view.legal,
    disabled = !connected || busy || pending;
  const amount = target === '' ? (legal?.minRaiseTo ?? 0) : Number(target),
    valid =
      /^\d{1,10}$/.test(target || String(amount)) &&
      Number.isSafeInteger(amount) &&
      !!legal &&
      amount >= legal.minRaiseTo &&
      amount <= legal.maxTo;
  return (
    <View style={{ gap: 12 }}>
      <PokerMatchScreen
        mode="CLASSIC"
        rulesetVersion={view.rulesetVersion}
        view={view}
      />
      <Text style={{ color: shellTheme.text }} accessibilityLiveRegion="polite">
        {!connected
          ? 'Reconnecting. Commands are paused.'
          : view.street === 'COMPLETE'
            ? 'Hand complete. Await server settlement and refresh the bracket.'
            : legal
              ? 'Your turn. Only server-authorized actions are available.'
              : 'Waiting for the other player.'}
      </Text>
      {pending ? (
        <Action
          label="Retry unconfirmed poker command"
          disabled={!connected || busy}
          onPress={onRetry}
        />
      ) : null}
      {legal && view.street !== 'COMPLETE' ? (
        <View style={{ gap: 8 }}>
          <Action
            label="Fold"
            disabled={disabled}
            onPress={() => onCommand({ action: 'FOLD' })}
          />
          {legal.canCheck ? (
            <Action
              label="Check"
              disabled={disabled}
              onPress={() => onCommand({ action: 'CHECK' })}
            />
          ) : (
            <Action
              label={'Call ' + legal.call + ' earned Play Chips'}
              disabled={disabled}
              onPress={() => onCommand({ action: 'CALL' })}
            />
          )}
          {legal.canAllIn ? (
            <Action
              label="All in — commit remaining earned Play Chips"
              disabled={disabled}
              onPress={() => onCommand({ action: 'ALL_IN' })}
            />
          ) : null}
          {legal.canRaise ? (
            <>
              <Text style={{ color: shellTheme.text }}>
                Raise total: {legal.minRaiseTo}–{legal.maxTo} earned Play Chips.
              </Text>
              <TextInput
                accessibilityLabel="Raise to total earned Play Chips"
                keyboardType="number-pad"
                value={target}
                placeholder={String(legal.minRaiseTo)}
                placeholderTextColor={shellTheme.text}
                editable={!disabled}
                onChangeText={setTarget}
                style={{
                  color: shellTheme.text,
                  borderColor: shellTheme.text,
                  borderWidth: 1,
                  minHeight: 48,
                  padding: 12,
                }}
              />
              <Action
                label={
                  valid
                    ? 'Confirm raise to ' + amount
                    : 'Enter a valid raise total'
                }
                disabled={disabled || !valid}
                onPress={() => onCommand({ action: 'BET_TO', target: amount })}
              />
            </>
          ) : null}
        </View>
      ) : null}
      {view.outcome ? (
        <Text style={{ color: shellTheme.text }}>
          Server result: {view.outcome.reason}. Final earned Play Chip stacks:{' '}
          {view.outcome.allocation.players
            .map((p, i) => 'Seat ' + (i + 1) + ': ' + p.finalStack)
            .join('; ')}
          . Tournament advancement is confirmed separately by the server.
        </Text>
      ) : null}
    </View>
  );
}
export function PokerTable({
  client,
  gameId,
  makeId,
}: {
  client: CollectionClient;
  gameId: string;
  makeId: () => string;
}) {
  return (
    <ConnectedPokerTable
      key={gameId}
      client={client}
      gameId={gameId}
      makeId={makeId}
    />
  );
}
function ConnectedPokerTable({
  client,
  gameId,
  makeId,
}: {
  client: CollectionClient;
  gameId: string;
  makeId: () => string;
}) {
  const replica = useRef<RoomReplica>(createReplica(gameId)),
    life = useRef<AbortController | null>(null),
    working = useRef(false),
    [snapshot, setSnapshot] = useState<RoomReplica['snapshot']>(null),
    [connected, setConnected] = useState(false),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(false),
    [notice, setNotice] = useState('');
  function receive(input: unknown) {
    replica.current = acceptSnapshot(replica.current, input);
    setSnapshot(replica.current.snapshot);
  }
  useEffect(() => {
    const c = new AbortController();
    life.current = c;
    const stop = client.watchPoker(
      gameId,
      (input) => {
        if (!c.signal.aborted) receive(input);
      },
      (value) => {
        if (!c.signal.aborted) setConnected(value);
      },
    );
    return () => {
      c.abort();
      stop();
    };
  }, [client, gameId]);
  async function submit(payload?: PokerRoomCommand['payload']) {
    if (working.current || !connected) return;
    const signal = life.current?.signal;
    try {
      if (payload) {
        replica.current = stageCommand(replica.current, makeId(), payload);
        setPending(true);
      }
      const command = replica.current.pending;
      if (!command) return;
      working.current = true;
      setBusy(true);
      const receipt = await client.pokerCommand(command, signal);
      if (signal?.aborted) return;
      replica.current = acceptReceipt(replica.current, receipt);
      setSnapshot(replica.current.snapshot);
      setPending(replica.current.pending !== null);
      setNotice('Server confirmed the command.');
    } catch (error) {
      if (signal?.aborted) return;
      if (
        error instanceof CollectionError &&
        [400, 403, 404, 409, 422].includes(error.status)
      ) {
        const command = replica.current.pending;
        if (command)
          replica.current = rejectCommand(replica.current, command.commandId);
        setPending(false);
        setNotice('Command rejected. Refreshing server state.');
        try {
          const fresh = await client.game(gameId, signal);
          if (!signal?.aborted) receive(fresh);
        } catch {
          if (!signal?.aborted)
            setNotice('Could not refresh. Reconnect before acting.');
        }
      } else
        setNotice(
          'Command could not be confirmed. Retry the same command after reconnecting.',
        );
    } finally {
      working.current = false;
      if (!signal?.aborted) setBusy(false);
    }
  }
  return (
    <View style={{ gap: 12 }}>
      {snapshot ? (
        <PokerBoard
          view={snapshot.view}
          connected={connected}
          busy={busy}
          pending={pending}
          onCommand={(p) => void submit(p)}
          onRetry={() => void submit()}
        />
      ) : (
        <Text style={{ color: shellTheme.text }}>
          Connecting to your private tournament hand…
        </Text>
      )}
      {snapshot ? (
        <SafetyPanel
          client={client}
          game="POKER"
          gameId={gameId}
          makeId={makeId}
        />
      ) : null}
      <Text style={{ color: shellTheme.text }} accessibilityLiveRegion="polite">
        {notice}
      </Text>
    </View>
  );
}
