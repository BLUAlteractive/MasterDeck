import { renderToStaticMarkup } from 'react-dom/server';
import { it, expect } from 'vitest';
import { QuestBoard } from './AccessibleQuests';
import type { AccessibleView } from '@deckforge/contracts';
it('offers no-GPS/health alternative without disability disclosure and states the approval gate', () => {
  const html = renderToStaticMarkup(
    <QuestBoard
      view={{ available: false, quests: [] }}
      busy={false}
      onStart={() => {}}
      onClaim={() => {}}
      onCancel={() => {}}
    />,
  );
  expect(html).toContain('No health access, GPS or disability disclosure');
  expect(html).toContain('No step sample is fabricated');
  expect(html).toContain('reviewed equivalent quest plan is not configured');
  expect(html).not.toContain('Opt in to this nonwalking alternative');
});
it('discloses opt-in, exact task/reward, cap and unfinished Press integration', () => {
  const view: AccessibleView = {
    available: true,
    quests: [
      {
        goalId: 'TEST:QUEST',
        definition: {
          id: 'QUEST',
          kind: 'POKER_COMPLETED',
          target: 2,
          badge: 'Quest',
          window: 'DAILY',
          startsAt: '2026-01-01T00:00:00.000Z',
          endsAt: '2030-01-01T00:00:00.000Z',
        },
        trailCredits: '100',
        equivalencePlanId: 'TEST_PLAN',
        pressRecipeId: 'TEST_RECIPE',
        enrollment: null,
      },
    ],
  };
  const html = renderToStaticMarkup(
    <QuestBoard
      view={view}
      busy={false}
      onStart={() => {}}
      onClaim={() => {}}
      onCancel={() => {}}
    />,
  );
  expect(html).toContain('events after enrollment');
  expect(html).toContain('100 earned-only Trail Credits');
  expect(html).toContain('shared daily cap');
  expect(html).toContain('screen and supply requirements still apply');
  expect(html).toContain('Opt in to this nonwalking alternative');
});
