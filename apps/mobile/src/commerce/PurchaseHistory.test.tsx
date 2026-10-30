import { it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PurchaseHistoryBoard } from './PurchaseHistory';
it('describes revocation and native restore limits without promising a new grant or wallet debit', () => {
  const html = renderToStaticMarkup(<PurchaseHistoryBoard items={[]} />);
  expect(html).toContain('Other verified purchases can still provide');
  expect(html).toContain('No earned card or wallet is affected');
  expect(html).toContain('Native store restores are unavailable');
  expect(html).toContain(
    'No verified purchases in this account and environment',
  );
});
