import { useEffect, useRef, useState } from 'react';
import type { PokerViewResponse } from '@deckforge/contracts';
import { Text, TextInput, View } from 'react-native';
import {
  pokerRulesVersions,
  type LobbyCommand,
  type LobbyResult,
  type PokerMode,
} from '@deckforge/contracts';
import type { CollectionClient } from '../collection/client';
import { Action } from '../collection/controls';
import { PokerMatchScreen } from './PokerMatchScreen';
export function PlayLobby({
  client,
  makeId,
}: {
  client: CollectionClient | null;
  makeId: () => string;
}) {
  const [mode, setMode] = useState<PokerMode>('CLASSIC'),
    [result, setResult] = useState<LobbyResult>({ lobby: null, invite: null }),
    [invite, setInvite] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const [game, setGame] = useState<
    { gameId: string; view: PokerViewResponse } | undefined
  >();
  useEffect(() => {
    const controller = new AbortController();
    setGame(undefined);
    if (client && result.lobby?.gameId && result.lobby.mode !== 'SPADES')
      void client
        .game(result.lobby.gameId, controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) setGame(value);
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setNotice('Could not refresh the current hand.');
        });
    return () => controller.abort();
  }, [client, result]);
  const lifecycle = useRef<AbortController | null>(null),
    pending = useRef<{ fingerprint: string; commandId: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    setBusy(false);
    if (client)
      void client
        .lobby(controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) setResult(value);
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setNotice('Could not refresh your lobby.');
        });
    return () => controller.abort();
  }, [client]);
  async function refresh() {
    if (!client) return;
    const signal = lifecycle.current?.signal;
    setBusy(true);
    try {
      const value = await client.lobby(signal);
      if (!signal?.aborted) {
        setResult(value);
        pending.current = null;
        setNotice('Lobby refreshed.');
      }
    } catch {
      if (!signal?.aborted) setNotice('Could not refresh your lobby.');
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }
  async function command(
    input:
      | Omit<Extract<LobbyCommand, { action: 'QUEUE' }>, 'commandId'>
      | Omit<Extract<LobbyCommand, { action: 'CREATE_PRIVATE' }>, 'commandId'>
      | Omit<Extract<LobbyCommand, { action: 'JOIN_PRIVATE' }>, 'commandId'>
      | Omit<Extract<LobbyCommand, { action: 'READY' }>, 'commandId'>
      | Omit<Extract<LobbyCommand, { action: 'LEAVE' }>, 'commandId'>,
  ) {
    if (!client || busy) return;
    const fingerprint = JSON.stringify(input);
    if (pending.current && pending.current.fingerprint !== fingerprint) {
      setNotice('Refresh the lobby before another action.');
      return;
    }
    pending.current ??= { fingerprint, commandId: makeId() };
    const signal = lifecycle.current?.signal;
    setBusy(true);
    try {
      const value = await client.lobbyCommand(
        { ...input, commandId: pending.current.commandId } as LobbyCommand,
        signal,
      );
      if (!signal?.aborted) {
        setResult(value);
        pending.current = null;
        setNotice('Lobby updated.');
      }
    } catch {
      if (!signal?.aborted)
        setNotice(
          'Request could not be confirmed. Retry the same action or refresh.',
        );
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }
  async function start() {
    const lobby = result.lobby;
    if (!client || !lobby?.canStart || busy) return;
    const fingerprint = 'START:' + lobby.id;
    if (pending.current && pending.current.fingerprint !== fingerprint) {
      setNotice('Refresh the lobby before another action.');
      return;
    }
    pending.current ??= { fingerprint, commandId: makeId() };
    const signal = lifecycle.current?.signal;
    setBusy(true);
    try {
      await client.startGame(lobby.id, pending.current.commandId, signal);
      const value = await client.lobby(signal);
      if (!signal?.aborted) {
        setResult(value);
        pending.current = null;
        setNotice('Hand started.');
      }
    } catch {
      if (!signal?.aborted)
        setNotice('Start could not be confirmed. Retry or refresh.');
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }
  const lobby = result.lobby;
  if (lobby?.mode === 'SPADES')
    return (
      <View>
        <Text>Your private Spades room is open. Use the Spades tab.</Text>
        <Action
          label="Refresh lobby"
          disabled={busy}
          onPress={() => void refresh()}
        />
      </View>
    );
  const shownMode = lobby?.mode ?? mode;
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <PokerMatchScreen
        {...(game && game.gameId === lobby?.gameId ? { view: game.view } : {})}
        mode={shownMode}
        rulesetVersion={lobby?.rulesetVersion ?? pokerRulesVersions[shownMode]}
      />
      {!client ? (
        <Text>
          Connect your account to join a queue or private room. Preview cards
          are not owned inventory.
        </Text>
      ) : null}
      {!lobby ? (
        <>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Action
              label="Classic"
              selected={mode === 'CLASSIC'}
              onPress={() => setMode('CLASSIC')}
            />
            <Action
              label="Evolved — experimental"
              selected={mode === 'EVOLVED'}
              onPress={() => setMode('EVOLVED')}
            />
          </View>
          <Text>
            {mode === 'EVOLVED'
              ? 'Experimental lobby only; live games are unavailable until balancing review.'
              : 'Classic uses standard face-only ranking.'}
          </Text>
          <Action
            label="Join selected queue"
            disabled={!client || busy}
            onPress={() => void command({ action: 'QUEUE', mode })}
          />
          <Action
            label="Create private room"
            disabled={!client || busy}
            onPress={() =>
              void command({ action: 'CREATE_PRIVATE', mode, capacity: 2 })
            }
          />
          <TextInput
            accessibilityLabel="Private room invite"
            value={invite}
            onChangeText={setInvite}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={64}
          />
          <Action
            label="Join private room"
            disabled={!client || busy || !/^[a-f0-9]{64}$/.test(invite)}
            onPress={() => void command({ action: 'JOIN_PRIVATE', invite })}
          />
        </>
      ) : (
        <>
          <Text>
            Room {lobby.kind.toLowerCase()}, {lobby.status.toLowerCase()}.{' '}
            {lobby.members.length} of {lobby.capacity} seats.
          </Text>
          {lobby.members.map((member) => (
            <Text key={member.userId}>
              Seat {member.seat + 1}: {member.ready ? 'ready' : 'not ready'}
            </Text>
          ))}
          <Text>
            {lobby.admission === 'BALANCE_REVIEW_REQUIRED'
              ? 'Evolved admission is disabled pending balancing review.'
              : lobby.admission === 'POLICY_NOT_CONFIGURED'
                ? 'Games are unavailable until an approved Play Chip policy is configured.'
                : 'Ready players need eligible loadouts and earned Play Chips.'}
          </Text>
          <Action
            label="Start Classic hand"
            disabled={busy || !lobby.canStart}
            onPress={() => void start()}
          />
          <Action
            label="Ready"
            disabled={busy || lobby.status !== 'OPEN'}
            onPress={() => void command({ action: 'READY', ready: true })}
          />
          <Action
            label="Not ready"
            disabled={busy || lobby.status !== 'OPEN'}
            onPress={() => void command({ action: 'READY', ready: false })}
          />
          <Action
            label="Leave room"
            disabled={busy || lobby.status !== 'OPEN'}
            onPress={() => void command({ action: 'LEAVE' })}
          />
          {result.invite ? (
            <Text selectable>Private invite: {result.invite}</Text>
          ) : null}
        </>
      )}
      <Action
        label="Refresh lobby"
        disabled={!client || busy}
        onPress={() => void refresh()}
      />
      {notice ? <Text accessibilityRole="alert">{notice}</Text> : null}
    </View>
  );
}
