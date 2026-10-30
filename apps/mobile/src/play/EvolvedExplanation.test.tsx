import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  evolvedExplanationSchema,
  type EvolvedExplanationView,
} from '@deckforge/contracts';
import { EvolvedExplanation } from './EvolvedExplanation';
// Wire-only fixture: the UI must not import a scorer or infer a balance from this panel.
function fixture(): EvolvedExplanationView {
  const cards = ['2-C', '3-D', '4-H', '5-S', '6-C', '7-D', '8-H'];
  const selections: string[][] = [];
  for (let a = 0; a < 3; a++)
    for (let b = a + 1; b < 4; b++)
      for (let c = b + 1; c < 5; c++)
        for (let d = c + 1; d < 6; d++)
          for (let e = d + 1; e < 7; e++)
            selections.push([
              cards[a]!,
              cards[b]!,
              cards[c]!,
              cards[d]!,
              cards[e]!,
            ]);
  return evolvedExplanationSchema.parse({
    mode: 'EVOLVED_EXPERIMENTAL',
    rulesetVersion: 'EVOLVED_A_EXPERIMENTAL_V1',
    effectsVersion: 'NONE_V1',
    playerId: 'a',
    summary:
      'Straight. Evolved power 4450. Eligible included holes: none. Collectible bonus 0. Cap 1200. Equal power compares exact conventional rank, then splits.',
    candidates: selections.map((cards, index) => ({
      cards,
      category: 'STRAIGHT',
      categoryIndex: 4,
      tiebreak: [13],
      tieValue: 450,
      baseScore: 4450,
      bonus: {
        includedHoles: [],
        levelPoints: 0,
        rarityPoints: 0,
        stylePoints: 0,
        pairPoints: 0,
        seriesPoints: 0,
        seriesEffectId: null,
        rawTotal: 0,
        total: 0,
        capApplied: false,
      },
      score: 4450,
      selected: index === 0,
      description:
        'Straight. Eligible included holes: none. Unused holes and community cards earn no bonus. Cap 1200.',
    })),
  });
}
describe('Evolved explanation accessible semantics', () => {
  it('renders a header, spoken numeric breakdown, rules versions and expandable candidate control', () => {
    const html = renderToStaticMarkup(
      <EvolvedExplanation explanation={fixture()} />,
    );
    expect(html).toContain('role="heading"');
    expect(html).toContain('Evolved power 4450');
    expect(html).toContain('aria-label="Straight.');
    expect(html).toContain('EVOLVED_A_EXPERIMENTAL_V1');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('Show all 21 candidate details');
    expect(html).toContain('does not settle chips');
  });
  it('rejects an invalid wire payload instead of rendering a fabricated result', () => {
    expect(() =>
      renderToStaticMarkup(
        <EvolvedExplanation
          explanation={
            {
              ...fixture(),
              rulesetVersion: 'UNKNOWN',
            } as unknown as EvolvedExplanationView
          }
        />,
      ),
    ).toThrow();
  });
});
