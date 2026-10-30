import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { AccessibleView } from '@deckforge/contracts';
import { shellTheme } from '@deckforge/ui';
import { Action } from '../collection/controls';
import { CollectionError, type CollectionClient } from '../collection/client';
export function QuestBoard({
  view,
  busy,
  onStart,
  onClaim,
  onCancel,
}: {
  view: AccessibleView;
  busy: boolean;
  onStart: (id: string) => void;
  onClaim: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  return (
    <View style={{ gap: 12 }}>
      <Text
        style={{ color: shellTheme.text, fontSize: 22 }}
        accessibilityRole="header"
      >
        Nonwalking quests
      </Text>
      <Text style={{ color: shellTheme.text }}>
        No health access, GPS or disability disclosure is required. Opt in
        before completing the published server-verified tasks. No step sample is
        fabricated.
      </Text>
      {!view.available ? (
        <Text style={{ color: shellTheme.text }}>
          A reviewed equivalent quest plan is not configured. Rewards are
          unavailable.
        </Text>
      ) : (
        view.quests.map((q) => (
          <View key={q.goalId} style={{ gap: 8 }}>
            <Text style={{ color: shellTheme.text }}>
              {q.definition.badge}: {q.definition.target} {q.definition.kind}{' '}
              events after enrollment. {q.trailCredits} earned-only Trail
              Credits, within the shared daily cap. Press equivalence plan{' '}
              {q.equivalencePlanId}, recipe {q.pressRecipeId}; screen and supply
              requirements still apply.
            </Text>
            {q.enrollment ? (
              <>
                <Text style={{ color: shellTheme.text }}>
                  Status {q.enrollment.status}. Progress {q.enrollment.progress}
                  /{q.definition.target}. Expires {q.enrollment.expiresAt}.
                </Text>
                {q.enrollment.paused ? (
                  <Text style={{ color: shellTheme.text }}>
                    Policy changed; this quest is paused. Cancellation awards
                    nothing.
                  </Text>
                ) : null}
                {q.enrollment.receipt ? (
                  <Text style={{ color: shellTheme.text }}>
                    Claim recorded once. Trail Credits{' '}
                    {q.enrollment.receipt.trailCredits}. Nonwalking Press proof
                    is awaiting Printing Press integration; no card has been
                    upgraded.
                  </Text>
                ) : q.enrollment.status === 'ACTIVE' ? (
                  <>
                    <Action
                      label="Claim completed nonwalking quest"
                      disabled={
                        busy ||
                        q.enrollment.paused ||
                        q.enrollment.progress < q.definition.target
                      }
                      onPress={() => onClaim(q.enrollment!.id)}
                    />
                    <Action
                      label="Cancel quest — no reward or consumption"
                      disabled={busy}
                      onPress={() => onCancel(q.enrollment!.id)}
                    />
                  </>
                ) : null}
              </>
            ) : (
              <Action
                label="Opt in to this nonwalking alternative"
                disabled={busy}
                onPress={() => onStart(q.goalId)}
              />
            )}
          </View>
        ))
      )}
    </View>
  );
}
export function AccessibleQuests({
  client,
  makeId,
}: {
  client: CollectionClient | null;
  makeId: () => string;
}) {
  const [view, setView] = useState<AccessibleView>({
      available: false,
      quests: [],
    }),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const life = useRef<AbortController | null>(null),
    pending = useRef<{
      kind: 'start' | 'claim' | 'cancel';
      id: string;
      commandId: string;
    } | null>(null),
    working = useRef(false);
  useEffect(() => {
    const c = new AbortController();
    life.current = c;
    if (client)
      void client
        .accessibleQuests(c.signal)
        .then((v) => {
          if (!c.signal.aborted) setView(v);
        })
        .catch(() => {
          if (!c.signal.aborted) setNotice('Could not load nonwalking quests.');
        });
    return () => c.abort();
  }, [client]);
  async function act(kind: 'start' | 'claim' | 'cancel', id: string) {
    if (!client || working.current) return;
    if (
      pending.current &&
      (pending.current.kind !== kind || pending.current.id !== id)
    ) {
      setNotice('Retry the pending action before another action.');
      return;
    }
    pending.current ??= { kind, id, commandId: makeId() };
    working.current = true;
    setBusy(true);
    setNotice('');
    try {
      const command = pending.current;
      if (kind === 'start')
        await client.startAccessible(
          { goalId: id, commandId: command.commandId },
          life.current?.signal,
        );
      else if (kind === 'claim')
        await client.claimAccessible(
          { enrollmentId: id, commandId: command.commandId },
          life.current?.signal,
        );
      else
        await client.cancelAccessible(
          { enrollmentId: id, commandId: command.commandId },
          life.current?.signal,
        );
      pending.current = null;
      const result = await client.accessibleQuests(life.current?.signal);
      if (!life.current?.signal.aborted) setView(result);
    } catch (e) {
      if (
        e instanceof CollectionError &&
        [400, 403, 404, 409, 422].includes(e.status)
      )
        pending.current = null;
      if (!life.current?.signal.aborted)
        setNotice(
          e instanceof CollectionError
            ? e.message
            : 'Outcome unknown. Retry the same action to recover its receipt.',
        );
    } finally {
      working.current = false;
      if (!life.current?.signal.aborted) setBusy(false);
    }
  }
  return (
    <View style={{ gap: 12 }}>
      {!client ? (
        <Text style={{ color: shellTheme.text }}>
          Connect your account for nonwalking quest progress.
        </Text>
      ) : (
        <>
          <QuestBoard
            view={view}
            busy={busy}
            onStart={(id) => void act('start', id)}
            onClaim={(id) => void act('claim', id)}
            onCancel={(id) => void act('cancel', id)}
          />
          <Action
            label="Refresh nonwalking quest progress"
            disabled={busy || pending.current !== null}
            onPress={() => {
              void client
                .accessibleQuests(life.current?.signal)
                .then((v) => {
                  if (!life.current?.signal.aborted) setView(v);
                })
                .catch(() => setNotice('Could not refresh quests.'));
            }}
          />
        </>
      )}
      <Text style={{ color: shellTheme.text }} accessibilityLiveRegion="polite">
        {notice}
      </Text>
    </View>
  );
}
