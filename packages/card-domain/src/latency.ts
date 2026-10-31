export const latencyBounds = [5, 20, 50, 100, 250, 500, 1000, 5000] as const;
export type LatencyHistogram = Readonly<{
  count: number;
  buckets: readonly number[];
}>;
export const emptyLatency = (): LatencyHistogram => ({
  count: 0,
  buckets: Array.from({ length: latencyBounds.length + 1 }, () => 0),
});
export function observeLatency(
  state: LatencyHistogram,
  ms: number,
): LatencyHistogram {
  if (!Number.isFinite(ms) || ms < 0 || state.count >= Number.MAX_SAFE_INTEGER)
    return state;
  const index = latencyBounds.findIndex((b) => ms <= b),
    buckets = [...state.buckets];
  buckets[index < 0 ? latencyBounds.length : index]!++;
  return { count: state.count + 1, buckets };
}
export function latencyPercentileUpper(
  state: LatencyHistogram,
  percentile: number,
) {
  if (!state.count || percentile <= 0 || percentile > 1) return null;
  let total = 0;
  for (let i = 0; i < state.buckets.length; i++) {
    total += state.buckets[i]!;
    if (total >= Math.ceil(state.count * percentile))
      return latencyBounds[i] ?? null;
  }
  return null;
}
