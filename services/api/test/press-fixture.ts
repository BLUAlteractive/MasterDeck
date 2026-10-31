import { randomUUID } from 'node:crypto';
import { createCardWithOrigin } from '@deckforge/database';
import { developmentCatalog } from '@deckforge/card-domain';
import type { identityFixture } from './auth-fixture';
import { fixtureScreen } from './screen-fixture';
import { earnedFixture } from './earned-fixture';
import { OwnedScreenService } from '../src/press/screens';
import { PressJobService } from '../src/press/jobs';
import { hash } from '../src/rooms/shared';
export const testPressPolicy = {
  version: 'TEST_ONLY_PRESS_V1',
  approvalReference: 'TEST_ONLY_NOT_APPROVAL',
};
export async function fixturePress(
  f: Awaited<ReturnType<typeof identityFixture>>,
  level = 1,
  branch: 'BLUE' | 'RED' = 'BLUE',
) {
  const pattern = await fixtureScreen(f),
    p = await f.actor(false);
  await earnedFixture(f, p, 120);
  const screen = await new OwnedScreenService(pattern.catalog).buy(
    p.principal,
    pattern.patternId,
    {
      commandId: randomUUID(),
      expectedDefinitionHash: hash(pattern.definition),
    },
  );
  const template = await f.db.cardTemplate.findFirstOrThrow({
    where: { seriesId: developmentCatalog.seriesId, faceId: 'Q-H' },
  });
  const card = await f.db.$transaction((tx) =>
    createCardWithOrigin(
      tx,
      {
        ownerId: p.userId,
        templateId: template.id,
        seriesId: template.seriesId,
        faceId: template.faceId,
        level,
        branch,
        rarity: 'COMMON',
      },
      {
        operatorId: 'test.press-fixture',
        sourceKey: randomUUID(),
        reason: 'TEST_ONLY',
      },
    ),
  );
  const service = new PressJobService(f.db, testPressPolicy),
    input = {
      commandId: randomUUID(),
      cardId: card.id,
      screenId: screen.screen.screenId,
      expectedCardVersion: card.stateVersion,
      expectedScreenVersion: 1,
    };
  return { p, pattern, screen, card, service, input };
}
