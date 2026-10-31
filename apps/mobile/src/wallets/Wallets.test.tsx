import { renderToStaticMarkup } from 'react-dom/server';
import { it, expect } from 'vitest';
import { WalletSummary } from './Wallets';
import { walletViewSchema } from '@deckforge/contracts';
it('keeps exact large balances and three distinct earned/paid restrictions visible', () => {
  const view = walletViewSchema.parse({
    playChips: '9007199254740993',
    trailCredits: '150',
    storeGems: '20',
    restrictions: {
      playChips: 'EARNED_PLAY_ONLY',
      trailCredits: 'VALIDATED_ACTIVITY_OR_ACCESSIBLE_QUEST_ONLY',
      storeGems: 'PAID_COSMETICS_ONLY',
      exchange: false,
      cashOut: false,
    },
  });
  const html = renderToStaticMarkup(<WalletSummary view={view} />);
  for (const text of [
    '9007199254740993',
    'Play Chips',
    'Trail Credits',
    'Store Gems',
    'nonwalking quests',
    'never gameplay power',
    'cannot be exchanged',
  ])
    expect(html).toContain(text);
});
