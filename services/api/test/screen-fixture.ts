import { randomUUID } from 'node:crypto';
import type { ScreenPatternDefinition } from '@deckforge/contracts';
import type { identityFixture } from './auth-fixture';
import { fixtureAdmin } from './admin-fixture';
import { ScreenCatalogService } from '../src/press/catalog';
import { hash } from '../src/rooms/shared';
export const testScreenDefinition: ScreenPatternDefinition = {
  name: 'TEST_ONLY Basic Blue',
  tier: 'BASIC',
  branch: 'BLUE',
  sourceLevel: 1,
  targetLevel: 3,
  requiredSteps: 4000,
  requiredTrailInk: 0,
  creditPrice: 60,
  currency: 'TRAIL_CREDITS',
  consumable: true,
  ruleVersion: 'TEST_ONLY_NOT_APPROVAL',
  visualThemeId: 'ORIGINAL_PLATEN_V1',
  cancelAfterProgress: 'DISABLED',
};
/** Independent synthetic approval in the owned test database only. Never seed runtime recipes. */
export async function fixtureScreen(
  f: Awaited<ReturnType<typeof identityFixture>>,
  definition = testScreenDefinition,
) {
  const patternId = randomUUID(),
    editor = await fixtureAdmin(f, ['CONTENT_EDITOR']),
    reviewer = await fixtureAdmin(f, ['CONTENT_REVIEWER']),
    economist = await fixtureAdmin(f, ['CONTENT_REVIEWER']),
    publisher = await fixtureAdmin(f, ['CONTENT_PUBLISHER']);
  const policy = {
      version: 'TEST_ONLY_SCREEN_V1',
      approvalReference: 'TEST_ONLY_NOT_APPROVAL',
      allowedPatternIds: [patternId],
    },
    catalog = new ScreenCatalogService(f.db, policy);
  const key = () => ({
    commandId: randomUUID(),
    reason: 'TEST_ONLY_NOT_APPROVAL',
    patternId,
  });
  await catalog.command(editor.principal, {
    ...key(),
    action: 'DRAFT',
    slug: 'test-screen-' + patternId,
    version: 1,
    definition,
  });
  for (const [actor, review] of [
    [reviewer, 'CONTENT'],
    [economist, 'ECONOMY'],
  ] as const)
    await catalog.command(actor.principal, {
      ...key(),
      action: 'REVIEW',
      review,
      definitionHash: hash(definition),
      evidence: 'TEST_ONLY_NOT_APPROVAL',
    });
  await catalog.command(publisher.principal, {
    ...key(),
    action: 'PUBLISH',
    expectedVersion: 1,
  });
  return {
    patternId,
    definition,
    policy,
    catalog,
    editor,
    reviewer,
    economist,
    publisher,
  };
}
