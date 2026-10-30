import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { ScrollView, Text as NativeText, TextInput, View } from 'react-native';
import { shellTheme } from '@deckforge/ui';
import type {
  LobbyCommand,
  LobbyResult,
  SpadesPolicy,
} from '@deckforge/contracts';
import type { CollectionClient } from '../collection/client';
import { Action } from '../collection/controls';
import { SpadesTable } from './SpadesTable';
const labels = {
  HELLO: 'Hello',
  THANKS: 'Thanks',
  WELL_PLAYED: 'Well played',
  GOOD_GAME: 'Good game',
} as const;
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
export function SpadesLobby({
  client,
  makeId,
}: {
  client: CollectionClient | null;
  makeId: () => string;
}) {
  const [result, setResult] = useState<LobbyResult>({
      lobby: null,
      invite: null,
    }),
    [policy, setPolicy] = useState<SpadesPolicy | null>(null),
    [invite, setInvite] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const pending = useRef<{ fingerprint: string; id: string } | null>(null),
    life = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    life.current = controller;
    if (client)
      void Promise.all([
        client.lobby(controller.signal),
        client.spadesPolicy(controller.signal),
      ])
        .then(([lobby, configured]) => {
          if (!controller.signal.aborted) {
            setResult(lobby);
            setPolicy(configured.policy);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setNotice('Could not load the private table.');
        });
    return () => controller.abort();
  }, [client]);
  async function refresh() {
    if (!client) return;
    const signal = life.current?.signal;
    try {
      const current = await client.lobby(signal);
      if (!signal?.aborted) {
        setResult(current);
        pending.current = null;
      }
    } catch {
      if (!signal?.aborted) setNotice('Could not refresh the private table.');
    }
  }
  async function perform(
    action:
      | Omit<Extract<LobbyCommand, { action: 'CREATE_PRIVATE' }>, 'commandId'>
      | Omit<Extract<LobbyCommand, { action: 'JOIN_PRIVATE' }>, 'commandId'>
      | Omit<Extract<LobbyCommand, { action: 'READY' }>, 'commandId'>
      | Omit<Extract<LobbyCommand, { action: 'LEAVE' }>, 'commandId'>
      | Omit<Extract<LobbyCommand, { action: 'SAY' }>, 'commandId'>
      | { action: 'START' },
  ) {
    if (!client || busy) return;
    const fingerprint = JSON.stringify(action);
    if (pending.current && pending.current.fingerprint !== fingerprint) {
      setNotice('Refresh before another action.');
      return;
    }
    pending.current ??= { fingerprint, id: makeId() };
    const signal = life.current?.signal;
    setBusy(true);
    try {
      if (action.action === 'START') {
        const lobby = result.lobby;
        if (!lobby?.canStart) throw new Error('Not ready');
        await client.startSpades(
          {
            lobbyId: lobby.id,
            commandId: pending.current.id,
            ...(lobby.gameId ? { rematchOf: lobby.gameId } : {}),
          },
          signal,
        );
        const next = await client.lobby(signal);
        if (!signal?.aborted) setResult(next);
      } else {
        const next = await client.lobbyCommand(
          { ...action, commandId: pending.current.id } as LobbyCommand,
          signal,
        );
        const fresh = await client.lobby(signal);
        if (!signal?.aborted)
          setResult({
            ...fresh,
            invite: fresh.lobby?.id === next.lobby?.id ? next.invite : null,
          });
      }
      if (!signal?.aborted) {
        pending.current = null;
        setNotice('Private table updated.');
      }
    } catch {
      if (!signal?.aborted)
        setNotice(
          'Could not confirm the request. Retry the same action or refresh.',
        );
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }
  const lobby = result.lobby,
    spades = lobby?.mode === 'SPADES' ? lobby : null,
    rules = spades?.spadesRules ?? policy?.rules;
  return (
    <ScrollView
      style={{ backgroundColor: shellTheme.background }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      <Text accessibilityRole="header">Spades with friends</Text>
      <Text>
        Four players, fixed opposite partners. Share the private invite
        yourself; only signed-in invited players can join.
      </Text>
      {!client ? (
        <Text>
          Connect your account to create or join a private Spades table.
        </Text>
      ) : null}
      {rules ? (
        <Text>
          Rules {rules.version}: target {rules.targetScore}; nil{' '}
          {rules.nilEnabled ? `±${rules.nilPoints}` : 'disabled'};{' '}
          {rules.bagThreshold} bags cost {rules.bagPenalty}. Failed nil tricks
          never satisfy the partner contract.
        </Text>
      ) : (
        <Text>
          Spades rules are awaiting publication. Private match creation is
          unavailable.
        </Text>
      )}
      {!lobby ? (
        <>
          <Action
            label="Create four-player private Spades room"
            disabled={!client || !policy || busy}
            onPress={() =>
              void perform({
                action: 'CREATE_PRIVATE',
                mode: 'SPADES',
                capacity: 4,
              })
            }
          />
          <TextInput
            accessibilityLabel="Spades private invite"
            value={invite}
            onChangeText={setInvite}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={64}
            style={{
              color: shellTheme.text,
              borderWidth: 1,
              borderColor: shellTheme.muted,
              minHeight: 48,
              padding: 8,
            }}
          />
          <Action
            label="Join invited Spades room"
            disabled={!client || busy || !/^[a-f0-9]{64}$/.test(invite)}
            onPress={() => void perform({ action: 'JOIN_PRIVATE', invite })}
          />
        </>
      ) : spades ? (
        <>
          <Text>
            Private table: {spades.members.length} of 4 seats.{' '}
            {spades.status.toLowerCase()}.
          </Text>
          {spades.members.map((member) => (
            <Text key={member.userId}>
              Seat {member.seat + 1}: {member.ready ? 'ready' : 'not ready'}
            </Text>
          ))}
          {result.invite ? (
            <Text selectable>Private invite: {result.invite}</Text>
          ) : null}
          {spades.gameId && client ? (
            <SpadesTable
              client={client}
              gameId={spades.gameId}
              makeId={makeId}
              onComplete={() => void refresh()}
            />
          ) : null}
          <Text>
            Every player must ready again before a rematch. Refresh to see
            friends who joined or readied.
          </Text>
          <Action
            label={spades.gameId ? 'Ready for rematch' : 'Ready for Spades'}
            disabled={busy || spades.status !== 'OPEN'}
            onPress={() => void perform({ action: 'READY', ready: true })}
          />
          <Action
            label="Not ready"
            disabled={busy || spades.status !== 'OPEN'}
            onPress={() => void perform({ action: 'READY', ready: false })}
          />
          <Action
            label={
              spades.gameId
                ? 'Start rematch with the same four players'
                : 'Start private Spades match'
            }
            disabled={busy || !spades.canStart}
            onPress={() => void perform({ action: 'START' })}
          />
          <Text>
            Safe table messages are presets only and available between matches.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(Object.keys(labels) as (keyof typeof labels)[]).map((code) => (
              <Action
                key={code}
                label={labels[code]}
                disabled={busy || spades.status !== 'OPEN'}
                onPress={() => void perform({ action: 'SAY', code })}
              />
            ))}
          </View>
          {spades.messages.map((message) => (
            <Text key={message.id}>
              Seat {message.seat + 1}, when sent: {labels[message.code]}.
            </Text>
          ))}
          <Action
            label="Leave private room"
            disabled={busy || spades.status !== 'OPEN'}
            onPress={() => void perform({ action: 'LEAVE' })}
          />
        </>
      ) : (
        <Text>
          You are seated in a poker room. Leave that room before joining Spades.
        </Text>
      )}
      <Action
        label="Refresh private table"
        disabled={!client || busy}
        onPress={() => void refresh()}
      />
      {notice ? <Text accessibilityRole="alert">{notice}</Text> : null}
    </ScrollView>
  );
}
