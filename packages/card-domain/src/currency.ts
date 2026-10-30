export type Currency = 'PLAY_CHIPS' | 'TRAIL_CREDITS' | 'STORE_GEMS';
export type CurrencyPurpose =
  | 'EARN_ACTIVITY'
  | 'EARN_ACCESSIBLE_QUEST'
  | 'BUY_SCREEN'
  | 'BUY_EARNED_PACK'
  | 'BUY_SUPPLY'
  | 'VERIFIED_PURCHASE'
  | 'BUY_COSMETIC'
  | 'PURCHASE_REFUND';
/** Closed policy: there is no exchange, purchased wagering, transfer or cash-out purpose. */
export function currencyDirection(
  currency: Currency,
  purpose: CurrencyPurpose,
): 'GRANT' | 'SPEND' | 'REFUND' {
  if (currency === 'TRAIL_CREDITS') {
    if (purpose === 'EARN_ACTIVITY' || purpose === 'EARN_ACCESSIBLE_QUEST')
      return 'GRANT';
    if (['BUY_SCREEN', 'BUY_EARNED_PACK', 'BUY_SUPPLY'].includes(purpose))
      return 'SPEND';
  }
  if (currency === 'STORE_GEMS') {
    if (purpose === 'VERIFIED_PURCHASE') return 'GRANT';
    if (purpose === 'BUY_COSMETIC') return 'SPEND';
    if (purpose === 'PURCHASE_REFUND') return 'REFUND';
  }
  throw new Error('FORBIDDEN_CURRENCY_USE');
}
