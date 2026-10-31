import { it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { packViewSchema, packOpeningSchema } from '@deckforge/contracts';
import { PackShelf, PackReveal, Packs } from './Packs';
const id = '00000000-0000-4000-8000-000000000001';
const base = {
  id,
  slug: 'test',
  version: 1,
  definitionHash: 'a'.repeat(64),
  remainingStock: 0,
};
it('discloses exact integer odds, earned price, duplicate policy and sold-out stock', () => {
  const pack = packViewSchema.parse({
    ...base,
    definition: {
      kind: 'DISCOVERY',
      name: 'Original discovery',
      startsAt: '2026-01-01T00:00:00Z',
      endsAt: '2030-01-01T00:00:00Z',
      regions: [],
      stockLimit: 1,
      currency: 'TRAIL_CREDITS',
      price: 100,
      drawCount: 3,
      duplicatePolicy: 'ALLOW_COPIES',
      guarantee: 'NONE',
      pool: [{ weight: 1, reward: { kind: 'TRAIL_INK', units: 2 } }],
    },
    odds: [
      { reward: { kind: 'TRAIL_INK', units: 2 }, numerator: 1, denominator: 1 },
    ],
    fixedContents: null,
  });
  const html = renderToStaticMarkup(
    <PackShelf
      packs={[pack]}
      kind="DISCOVERY"
      disabled={false}
      onOpen={() => {}}
    />,
  );
  for (const label of [
    '100 Trail Credits',
    '1/1',
    '0 openings remaining',
    'Copies are allowed',
    'aria-disabled="true"',
  ])
    expect(html).toContain(label);
});
it('shows exact fixed contents, cosmetic isolation and unavailable checkout without a payment button', () => {
  const product = {
    id,
    version: 1,
    name: 'Original cosmetic',
    description: 'Presentation',
    platformProductId: 'test.fixed',
    referencePrice: { currency: 'USD', amountMinor: 299, minorUnits: 2 },
    contents: [
      {
        id,
        name: 'Evening theme',
        presentation: {
          kind: 'TABLE_THEME',
          primaryColor: '#123456',
          accentColor: '#ffffff',
          motif: 'SOLID',
        },
      },
    ],
  };
  const pack = packViewSchema.parse({
    ...base,
    remainingStock: null,
    definition: {
      kind: 'FIXED_COSMETIC',
      name: 'Fixed set',
      startsAt: '2026-01-01T00:00:00Z',
      endsAt: '2030-01-01T00:00:00Z',
      regions: [],
      stockLimit: null,
      cosmeticProductId: id,
      functionalEffects: false,
      randomized: false,
    },
    odds: [],
    fixedContents: product,
  });
  const html = renderToStaticMarkup(
    <PackShelf
      packs={[pack]}
      kind="FIXED_COSMETIC"
      disabled={false}
      onOpen={() => {}}
    />,
  );
  for (const label of [
    'Evening theme',
    'USD 2.99',
    'no random draws',
    'Native checkout is unavailable',
    'never change earned rarity',
  ])
    expect(html).toContain(label);
  expect(html).not.toContain('role="button"');
});
it('renders a complete text reveal without animation or secrets and labels the disconnected preview', () => {
  const receipt = packOpeningSchema.parse({
    openingId: id,
    packId: id,
    definitionHash: 'a'.repeat(64),
    currency: 'TRAIL_CREDITS',
    charged: '100',
    rngVersion: 'HMAC_SHA256_V1',
    seedCommitment: 'b'.repeat(64),
    outcomes: [
      {
        kind: 'CARD',
        instanceId: id,
        templateId: id,
        faceId: 'A-S',
        branch: 'BLUE',
        level: 1,
        rarity: 'COMMON',
      },
      { kind: 'TRAIL_INK', units: 2 },
    ],
  });
  const html = renderToStaticMarkup(<PackReveal receipt={receipt} />);
  expect(html).toContain('A-S');
  expect(html).toContain('owned instance');
  expect(html).toContain('2 bound Trail Ink');
  expect(html).not.toMatch(/rngBox|encryptionKey|"seed"/);
  expect(
    renderToStaticMarkup(
      <Packs client={null} makeId={() => id} onOpened={() => {}} />,
    ),
  ).toContain('Artwork preview');
});
