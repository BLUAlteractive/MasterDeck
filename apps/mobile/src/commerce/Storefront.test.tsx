import { it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  cosmeticPresentationSchema,
  storefrontViewSchema,
} from '@deckforge/contracts';
import { StorefrontBoard } from './Storefront';
const id = '00000000-0000-4000-8000-000000000001';
it('discloses fixed contents, cosmetic isolation, reference price and unavailable checkout', () => {
  const view = storefrontViewSchema.parse({
    available: true,
    products: [
      {
        id,
        version: 1,
        name: 'Original evening theme',
        description: 'One known theme',
        platformProductId: 'test.theme',
        referencePrice: { currency: 'USD', amountMinor: 299, minorUnits: 2 },
        contents: [
          {
            id,
            name: 'Evening table',
            presentation: {
              kind: 'TABLE_THEME',
              primaryColor: '#123456',
              accentColor: '#ffffff',
              motif: 'SOLID',
            },
          },
        ],
      },
    ],
    checkout: 'UNAVAILABLE_IN_THIS_BUILD',
    functionalEffects: false,
    paidRandomizedContents: false,
  });
  const html = renderToStaticMarkup(<StorefrontBoard view={view} />);
  expect(html).toContain('Exact contents');
  expect(html).toContain('USD 2.99');
  expect(html).toContain('Confirm the localized platform price');
  expect(html).toContain('never change earned rarity');
  expect(html).toContain('No payment can be submitted');
  expect(html).not.toContain('role="button"');
});
it('rejects any functional modifier in a cosmetic asset', () => {
  expect(() =>
    cosmeticPresentationSchema.parse({
      kind: 'CARD_BACK',
      primaryColor: '#123456',
      accentColor: '#ffffff',
      motif: 'DOTS',
      rarity: 'LEGENDARY',
    }),
  ).toThrow();
});
import { CosmeticSwatch } from './Storefront';
it('renders the actual published pattern with a readable external description', () => {
  const html = renderToStaticMarkup(
    <CosmeticSwatch
      presentation={{
        kind: 'AVATAR',
        primaryColor: '#123456',
        accentColor: '#ffffff',
        motif: 'DOTS',
      }}
    />,
  );
  expect(html).toContain('Preview AVATAR DOTS');
  expect(html).toContain('role="img"');
  expect(html).toContain('border-top-left-radius:8px');
});
