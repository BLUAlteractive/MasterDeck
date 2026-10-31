import { it, expect } from 'vitest';
import { packDefinitionSchema } from './packs';
const common = {
  name: 'Test pack',
  startsAt: '2026-01-01T00:00:00Z',
  endsAt: '2030-01-01T00:00:00Z',
  stockLimit: 10,
  regions: [],
};
it('permits earned integer-weight pools only and rejects paid random or functional cosmetics', () => {
  const earned = {
    ...common,
    kind: 'DISCOVERY',
    currency: 'TRAIL_CREDITS',
    price: 100,
    drawCount: 1,
    duplicatePolicy: 'ALLOW_COPIES',
    guarantee: 'NONE',
    pool: [{ weight: 1, reward: { kind: 'TRAIL_INK', units: 1 } }],
  };
  expect(packDefinitionSchema.safeParse(earned).success).toBe(true);
  for (const patch of [
    { currency: 'STORE_GEMS' },
    { currency: 'USD' },
    { pool: [{ weight: 0, reward: { kind: 'TRAIL_INK', units: 1 } }] },
    { guarantee: 'RARE' },
  ])
    expect(
      packDefinitionSchema.safeParse({ ...earned, ...patch }).success,
    ).toBe(false);
  const fixed = {
    ...common,
    kind: 'FIXED_COSMETIC',
    stockLimit: null,
    cosmeticProductId: '00000000-0000-4000-8000-000000000001',
    functionalEffects: false,
    randomized: false,
  };
  expect(packDefinitionSchema.safeParse(fixed).success).toBe(true);
  expect(
    packDefinitionSchema.safeParse({ ...fixed, randomized: true }).success,
  ).toBe(false);
  expect(
    packDefinitionSchema.safeParse({ ...fixed, levelBoost: 1 }).success,
  ).toBe(false);
});
