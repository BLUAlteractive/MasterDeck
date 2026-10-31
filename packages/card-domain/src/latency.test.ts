import { it, expect } from 'vitest';
import {
  emptyLatency,
  observeLatency,
  latencyPercentileUpper,
} from './latency';
it('keeps bounded noncumulative latency buckets and reports a conservative percentile upper bound', () => {
  let h = emptyLatency();
  for (const n of [1, 5, 6, 20, 5001]) h = observeLatency(h, n);
  expect(h.count).toBe(5);
  expect(h.buckets.reduce((a, b) => a + b, 0)).toBe(5);
  expect(latencyPercentileUpper(h, 0.5)).toBe(20);
  expect(latencyPercentileUpper(h, 0.95)).toBeNull();
});
it('does not record invalid durations or invent a percentile with no observations', () => {
  const h = emptyLatency();
  for (const n of [-1, NaN, Infinity]) expect(observeLatency(h, n)).toBe(h);
  expect(latencyPercentileUpper(h, 0.95)).toBeNull();
});
