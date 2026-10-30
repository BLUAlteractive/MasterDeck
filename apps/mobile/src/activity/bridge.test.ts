import { it, expect, vi } from 'vitest';
import { activitySampleSchema } from '@deckforge/contracts';
import { healthBridge, reviewActivity } from './bridge';
const start = new Date('2026-01-01T00:00:00.000Z'),
  end = new Date('2026-01-01T00:10:00.000Z');
const sample = (recordId = 'one', origin = 'device') =>
  activitySampleSchema.parse({
    source: 'HEALTHKIT',
    recordId,
    origin,
    revision: '1',
    start: start.toISOString(),
    end: end.toISOString(),
    steps: 1000,
    manual: false,
  });
it('does not request permissions or read absent a foreground user action', async () => {
  const native = {
    permission: vi.fn(),
    requestPermission: vi.fn(),
    read: vi.fn(),
  };
  const bridge = healthBridge(native, () => false);
  expect(native.read).not.toHaveBeenCalled();
  await expect(bridge.requestPermission()).rejects.toThrow('FOREGROUND');
  await expect(bridge.read(start, end)).rejects.toThrow('FOREGROUND');
  expect(native.read).not.toHaveBeenCalled();
  expect(native.requestPermission).not.toHaveBeenCalled();
});
it('provides an unavailable fallback with no fabricated samples', async () => {
  const bridge = healthBridge(null, () => true);
  expect(await bridge.requestPermission()).toBe('UNAVAILABLE');
  expect(await bridge.read(start, end)).toEqual({
    permission: 'UNAVAILABLE',
    samples: [],
    truncated: false,
  });
});
it('validates native records and rejects broad/future windows and out of window data', async () => {
  const native = {
      permission: vi.fn(),
      requestPermission: vi.fn(),
      read: vi.fn().mockResolvedValue({
        permission: 'READ_REQUESTED',
        samples: [sample()],
        truncated: false,
      }),
    },
    bridge = healthBridge(native, () => true);
  expect((await bridge.read(start, end)).samples).toHaveLength(1);
  await expect(
    bridge.read(start, new Date(start.getTime() + 86400001)),
  ).rejects.toThrow();
  await expect(
    bridge.read(new Date(Date.now() + 600000), new Date(Date.now() + 1200000)),
  ).rejects.toThrow();
  await expect(
    bridge.read(new Date(start.getTime() + 1000), end),
  ).rejects.toThrow('OUT_OF_WINDOW');
  native.read.mockResolvedValue({
    permission: 'GRANTED',
    samples: [{ ...sample(), steps: -1 }],
    truncated: false,
  });
  await expect(bridge.read(start, end)).rejects.toThrow();
});
it('deduplicates exact reimports and rejects overlapping origins, manual entries and implausible rates', () => {
  expect(reviewActivity([sample(), sample()]).accepted).toHaveLength(1);
  expect(
    reviewActivity([sample(), sample('two', 'watch')]).accepted,
  ).toHaveLength(0);
  expect(
    reviewActivity([{ ...sample(), manual: true }]).rejected[0]?.reason,
  ).toBe('MANUAL_ENTRY');
  expect(
    reviewActivity([{ ...sample(), steps: 5000 }]).rejected[0]?.reason,
  ).toBe('IMPLAUSIBLE_RATE');
  expect(
    reviewActivity([sample(), { ...sample(), revision: '2' }]).rejected[0]
      ?.reason,
  ).toBe('CONFLICTING_REVISION');
});
it('discards a read that completes after foreground access ends', async () => {
  let active = true;
  const native = {
    permission: vi.fn(),
    requestPermission: vi.fn(),
    read: vi.fn().mockImplementation(async () => {
      active = false;
      return {
        permission: 'READ_REQUESTED',
        samples: [sample()],
        truncated: false,
      };
    }),
  };
  await expect(
    healthBridge(native, () => active).read(start, end),
  ).rejects.toThrow('FOREGROUND');
});
