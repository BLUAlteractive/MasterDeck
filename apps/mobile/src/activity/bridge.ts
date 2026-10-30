import { activityBatchSchema, type ActivitySample } from '@deckforge/contracts';
export interface HealthNative {
  permission(): Promise<string>;
  requestPermission(): Promise<string>;
  read(start: string, end: string): Promise<unknown>;
}
/** Local diagnostics only. Neither this adapter nor Health data is a server reward proof. */
export function healthBridge(
  native: HealthNative | null,
  foreground: () => boolean,
) {
  const active = () => {
    if (!foreground()) throw new Error('FOREGROUND_REQUIRED');
  };
  return {
    async permission() {
      return native ? native.permission() : 'UNAVAILABLE';
    },
    async requestPermission() {
      active();
      return native ? native.requestPermission() : 'UNAVAILABLE';
    },
    async read(start: Date, end: Date) {
      active();
      if (
        !Number.isFinite(start.getTime()) ||
        !Number.isFinite(end.getTime()) ||
        end <= start ||
        end.getTime() - start.getTime() > 86400000 ||
        end.getTime() > Date.now() + 60000
      )
        throw new Error('INVALID_ACTIVITY_WINDOW');
      if (!native)
        return activityBatchSchema.parse({
          permission: 'UNAVAILABLE',
          samples: [],
          truncated: false,
        });
      const batch = activityBatchSchema.parse(
        await native.read(start.toISOString(), end.toISOString()),
      );
      active();
      if (
        batch.samples.some(
          (s) =>
            Date.parse(s.start) < start.getTime() ||
            Date.parse(s.end) > end.getTime(),
        )
      )
        throw new Error('OUT_OF_WINDOW_SAMPLE');
      return batch;
    },
  };
}
/** Conservative local review: reject all overlapping alternatives rather than add device totals.
 * Canonical cross-session/device crediting and corrections belong to B061, not client state. */
export function reviewActivity(samples: readonly ActivitySample[]) {
  const accepted: ActivitySample[] = [],
    rejected: { recordId: string; reason: string }[] = [];
  const groups = new Map<string, ActivitySample[]>();
  for (const sample of samples) {
    const key = sample.source + ':' + sample.recordId;
    groups.set(key, [...(groups.get(key) ?? []), sample]);
  }
  const unique: ActivitySample[] = [];
  for (const group of groups.values()) {
    const first = group[0]!;
    if (group.some((s) => JSON.stringify(s) !== JSON.stringify(first))) {
      rejected.push({
        recordId: first.recordId,
        reason: 'CONFLICTING_REVISION',
      });
      continue;
    }
    unique.push(first);
  }
  for (const s of unique) {
    let reason: string | null = null;
    if (s.manual) reason = 'MANUAL_ENTRY';
    else if (
      s.steps / ((Date.parse(s.end) - Date.parse(s.start)) / 60000) >
      300
    )
      reason = 'IMPLAUSIBLE_RATE';
    else if (
      unique.some(
        (other) =>
          other !== s &&
          !other.manual &&
          Date.parse(s.start) < Date.parse(other.end) &&
          Date.parse(other.start) < Date.parse(s.end),
      )
    )
      reason = 'OVERLAPPING_SOURCE';
    if (reason) rejected.push({ recordId: s.recordId, reason });
    else accepted.push(s);
  }
  return { accepted, rejected };
}
