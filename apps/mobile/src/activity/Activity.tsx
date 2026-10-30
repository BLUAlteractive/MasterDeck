import { AccessibleQuests } from './AccessibleQuests';
import type { CollectionClient } from '../collection/client';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, AppState } from 'react-native';
import { shellTheme } from '@deckforge/ui';
import { Action } from '../collection/controls';
import { deviceHealth } from './native';
import { reviewActivity } from './bridge';
export function Activity({
  client,
  makeId,
}: {
  client: CollectionClient | null;
  makeId: () => string;
}) {
  const [status, setStatus] = useState('NOT_REQUESTED'),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const active = useRef(true),
    working = useRef(false);
  useEffect(() => {
    active.current = true;
    void deviceHealth
      .permission()
      .then((s) => {
        if (active.current) setStatus(s);
      })
      .catch(() => {
        if (active.current) setStatus('UNAVAILABLE');
      });
    const sub = AppState.addEventListener('change', () => {
      setNotice('');
    });
    return () => {
      active.current = false;
      sub.remove();
    };
  }, []);
  async function run(read: boolean) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      if (read) {
        const end = new Date(),
          start = new Date(end.getTime() - 3600000);
        const batch = await deviceHealth.read(start, end);
        const review = reviewActivity(batch.samples);
        if (active.current) {
          setStatus(batch.permission);
          setNotice(
            `${batch.samples.length} local records; ${review.accepted.length} need server validation; ${review.rejected.length} excluded.${batch.truncated ? ' More records exist; this read is incomplete.' : ''} No credits or press progress awarded.`,
          );
        }
      } else {
        const s = await deviceHealth.requestPermission();
        if (active.current) setStatus(s);
      }
    } catch {
      if (active.current)
        setNotice(
          'No activity accepted. Access may be denied, unavailable or interrupted. Nonwalking quests do not require health or GPS permissions.',
        );
    } finally {
      working.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <ScrollView
      contentContainerStyle={{
        padding: 20,
        gap: 12,
        backgroundColor: shellTheme.background,
        flexGrow: 1,
      }}
    >
      <Text
        style={{ color: shellTheme.text, fontSize: 24 }}
        accessibilityRole="header"
      >
        Activity permissions
      </Text>
      <Text style={{ color: shellTheme.text }}>
        Optional step reads use HealthKit or Health Connect only while this app
        is in the foreground. No GPS, background tracking or reward claim is
        requested. Read access is optional; nonwalking quests remain a separate
        path.
      </Text>
      <Text style={{ color: shellTheme.text }}>
        Access: {status}. On iOS, read permission can be hidden by the OS; no
        samples does not prove denial.
      </Text>
      <Action
        label="Request optional step read access"
        disabled={busy || status === 'UNAVAILABLE'}
        onPress={() => void run(false)}
      />
      <Action
        label="Read the last hour locally — no reward"
        disabled={
          busy ||
          status === 'UNAVAILABLE' ||
          status === 'NOT_REQUESTED' ||
          status === 'DENIED'
        }
        onPress={() => void run(true)}
      />
      <Text style={{ color: shellTheme.text }} accessibilityLiveRegion="polite">
        {notice}
      </Text>
      <AccessibleQuests client={client} makeId={makeId} />
    </ScrollView>
  );
}
