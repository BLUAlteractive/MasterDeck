import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { safetyViewSchema, type SafetyCommand } from '@deckforge/contracts';
import { shellTheme } from '@deckforge/ui';
import { CollectionError, type CollectionClient } from '../collection/client';
import { Action } from '../collection/controls';
export function SafetyPanel({
  client,
  game,
  gameId,
  makeId,
}: {
  client: CollectionClient;
  game: 'POKER' | 'SPADES';
  gameId: string;
  makeId: () => string;
}) {
  const [view, setView] = useState<ReturnType<
      typeof safetyViewSchema.parse
    > | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    life = useRef<AbortController | null>(null),
    working = useRef(false),
    pending = useRef<SafetyCommand | null>(null);
  useEffect(() => {
    const c = new AbortController();
    life.current = c;
    void client
      .safety(game, gameId, c.signal)
      .then((v) => {
        if (!c.signal.aborted) setView(v);
      })
      .catch(() => {
        if (!c.signal.aborted)
          setNotice(
            'Safety controls could not load. Reconnect and reopen the table.',
          );
      });
    return () => c.abort();
  }, [client, game, gameId]);
  async function submit(command?: SafetyCommand) {
    if (working.current) return;
    if (pending.current && command) {
      setNotice('Retry the unconfirmed safety request before another action.');
      return;
    }
    pending.current ??= command ?? null;
    const input = pending.current;
    if (!input) return;
    working.current = true;
    setBusy(true);
    const signal = life.current?.signal;
    try {
      const r = await client.safetyCommand(input, signal);
      if (signal?.aborted) return;
      pending.current = null;
      setNotice('Safety request recorded. Reference ' + r.reference + '.');
      const fresh = await client.safety(game, gameId, signal);
      if (!signal?.aborted) setView(fresh);
    } catch (error) {
      if (
        error instanceof CollectionError &&
        [400, 401, 403, 404, 409, 422].includes(error.status)
      )
        pending.current = null;
      if (!signal?.aborted)
        setNotice('Request unconfirmed. Retry the same safety request.');
    } finally {
      working.current = false;
      if (!signal?.aborted) setBusy(false);
    }
  }
  return (
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={{ color: shellTheme.text }}>
        Table safety
      </Text>
      <Text style={{ color: shellTheme.text }}>
        Blocking prevents future tables together. It does not change the current
        hand or its balances. Reports request staff review.
      </Text>
      {view?.participants.map((p) => (
        <Action
          key={p.userId}
          label={
            (p.blocked ? 'Unblock' : 'Block') +
            ' seat ' +
            (p.seat + 1) +
            ' for future tables'
          }
          disabled={busy}
          onPress={() =>
            void submit({
              game,
              gameId,
              action: 'SET_BLOCK',
              commandId: makeId(),
              targetUserId: p.userId,
              blocked: !p.blocked,
            })
          }
        />
      ))}
      {(
        [
          'RESULT_INCONSISTENT',
          'CONNECTION_FAILURE',
          'HARASSMENT',
          'COLLUSION',
        ] as const
      ).map((code) => (
        <Action
          key={code}
          label={'Report ' + code.toLowerCase().replaceAll('_', ' ')}
          disabled={busy || !view}
          onPress={() =>
            void submit({
              game,
              gameId,
              action: 'REPORT',
              commandId: makeId(),
              code,
            })
          }
        />
      ))}
      {pending.current ? (
        <Action
          label="Retry unconfirmed safety request"
          disabled={busy}
          onPress={() => void submit()}
        />
      ) : null}
      <Text style={{ color: shellTheme.text }} accessibilityLiveRegion="polite">
        {notice}
      </Text>
    </View>
  );
}
