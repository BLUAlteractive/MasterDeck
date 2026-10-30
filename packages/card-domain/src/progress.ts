/** Counts only a new eligible server event; monetary grants are a separate reviewed boundary. */
export function advanceProgress(
  count: number,
  target: number,
  consumed: boolean,
) {
  if (
    !Number.isSafeInteger(count) ||
    count < 0 ||
    !Number.isSafeInteger(target) ||
    target < 1 ||
    target > 1000000 ||
    count > target
  )
    throw new Error('INVALID_PROGRESS');
  const next = consumed ? count : Math.min(count + 1, target);
  return { count: next, award: !consumed && count < target && next === target };
}

/** UTC publication windows use the immutable event occurrence time, never worker arrival time. */
export function progressWindow(
  goal: {
    window: 'LIFETIME' | 'DAILY' | 'WEEKLY' | 'SEASON';
    startsAt?: string | undefined;
    endsAt?: string | undefined;
  },
  at: Date,
): string | null {
  if (!Number.isFinite(at.getTime())) throw new Error('INVALID_EVENT_TIME');
  if (goal.window === 'LIFETIME') return 'lifetime';
  if (!goal.startsAt || !goal.endsAt)
    throw new Error('MISSING_PUBLICATION_WINDOW');
  const start = Date.parse(goal.startsAt),
    end = Date.parse(goal.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    throw new Error('INVALID_PUBLICATION_WINDOW');
  if (at.getTime() < start || at.getTime() >= end) return null;
  if (goal.window === 'SEASON') return 'season:' + start;
  const day = new Date(at);
  day.setUTCHours(0, 0, 0, 0);
  if (goal.window === 'WEEKLY')
    day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return (
    (goal.window === 'DAILY' ? 'daily:' : 'weekly:') +
    day.toISOString().slice(0, 10)
  );
}
