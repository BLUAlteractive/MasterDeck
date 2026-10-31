import { it, expect } from 'vitest';
import { screenPatternSchema } from './press';
const recipe = {
  name: 'Test Basic Blue',
  tier: 'BASIC',
  branch: 'BLUE',
  sourceLevel: 1,
  targetLevel: 3,
  requiredSteps: 4000,
  requiredTrailInk: 0,
  creditPrice: 60,
  currency: 'TRAIL_CREDITS',
  consumable: true,
  ruleVersion: 'TEST_ONLY',
  visualThemeId: 'ORIGINAL_PLATEN_V1',
  cancelAfterProgress: 'DISABLED',
};
it('rejects purchased currency, functional cosmetic modifiers, invalid transitions and unpublished cancellation policies', () => {
  expect(screenPatternSchema.parse(recipe).targetLevel).toBe(3);
  for (const change of [
    { currency: 'STORE_GEMS' },
    { sourceLevel: 5, targetLevel: 7 },
    { branch: 'RED' },
    { targetLevel: 4 },
    { requiredSteps: 0 },
    { requiredTrailInk: -1 },
    { printingSpeedBoost: 2 },
    { cancelAfterProgress: 'REFUND_ALL' },
  ])
    expect(
      screenPatternSchema.safeParse({ ...recipe, ...change }).success,
    ).toBe(false);
});
import { screenPurchaseSchema } from './press';
it('accepts only a stable command and offer hash for an earned screen purchase, never a client price or paid wallet', () => {
  const purchase = {
    commandId: '00000000-0000-4000-8000-000000000001',
    expectedDefinitionHash: 'a'.repeat(64),
  };
  expect(screenPurchaseSchema.parse(purchase)).toEqual(purchase);
  for (const extra of [
    { currency: 'STORE_GEMS' },
    { price: 0 },
    { status: 'AVAILABLE' },
    { screenId: purchase.commandId },
  ])
    expect(
      screenPurchaseSchema.safeParse({ ...purchase, ...extra }).success,
    ).toBe(false);
});
