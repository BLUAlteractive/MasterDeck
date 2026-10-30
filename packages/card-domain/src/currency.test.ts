import { it, expect } from 'vitest';
import {
  currencyDirection,
  type Currency,
  type CurrencyPurpose,
} from './currency';
it('enforces every currency/purpose pair without exchanges, purchased chips or paid function', () => {
  const allowed = new Set([
    'TRAIL_CREDITS:EARN_ACTIVITY',
    'TRAIL_CREDITS:EARN_ACCESSIBLE_QUEST',
    'TRAIL_CREDITS:BUY_SCREEN',
    'TRAIL_CREDITS:BUY_EARNED_PACK',
    'TRAIL_CREDITS:BUY_SUPPLY',
    'STORE_GEMS:VERIFIED_PURCHASE',
    'STORE_GEMS:BUY_COSMETIC',
    'STORE_GEMS:PURCHASE_REFUND',
  ]);
  const currencies: Currency[] = ['PLAY_CHIPS', 'TRAIL_CREDITS', 'STORE_GEMS'],
    purposes: CurrencyPurpose[] = [
      'EARN_ACTIVITY',
      'EARN_ACCESSIBLE_QUEST',
      'BUY_SCREEN',
      'BUY_EARNED_PACK',
      'BUY_SUPPLY',
      'VERIFIED_PURCHASE',
      'BUY_COSMETIC',
      'PURCHASE_REFUND',
    ];
  for (const currency of currencies)
    for (const purpose of purposes) {
      const run = () => currencyDirection(currency, purpose);
      if (allowed.has(currency + ':' + purpose))
        expect(run()).toMatch(/GRANT|SPEND|REFUND/);
      else expect(run).toThrow('FORBIDDEN_CURRENCY_USE');
    }
});
