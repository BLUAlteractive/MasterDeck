import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { identityFixture } from '../test/auth-fixture';
import { fixtureAdmin } from '../test/admin-fixture';
import { fixtureScreen, testScreenDefinition } from '../test/screen-fixture';
import { ScreenCatalogService } from './press/catalog';
import { hash } from './rooms/shared';
let f: Awaited<ReturnType<typeof identityFixture>>;
beforeAll(async () => {
  f = await identityFixture();
});
afterAll(async () => {
  await f?.close();
});
it('defaults unavailable, rejects unscoped commands and paid/terminal/boost recipes without creating inventory', async () => {
  const editor = await fixtureAdmin(f, ['CONTENT_EDITOR']),
    service = new ScreenCatalogService(f.db),
    patternId = randomUUID(),
    input = {
      commandId: randomUUID(),
      reason: 'TEST_ONLY_NOT_APPROVAL',
      action: 'DRAFT',
      patternId,
      slug: 'test-screen-' + patternId,
      version: 1,
      definition: testScreenDefinition,
    };
  expect(await service.list()).toEqual({ available: false, patterns: [] });
  await expect(
    service.command(f.players[0]!.principal, input),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  for (const change of [
    { currency: 'STORE_GEMS' },
    { sourceLevel: 5, targetLevel: 7 },
    { printingSpeedBoost: 2 },
  ])
    await expect(
      service.command(editor.principal, {
        ...input,
        definition: { ...input.definition, ...change },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  const before = await f.db.cardInstance.count(),
    results = await Promise.all(
      Array.from({ length: 10 }, () =>
        service.command(editor.principal, input),
      ),
    );
  for (const result of results) expect(result).toEqual(results[0]);
  expect(await f.db.screenPattern.count({ where: { id: patternId } })).toBe(1);
  await expect(
    service.command(editor.principal, {
      commandId: randomUUID(),
      reason: 'TEST_ONLY_NOT_APPROVAL',
      action: 'REVIEW',
      patternId,
      review: 'CONTENT',
      definitionHash: hash(testScreenDefinition),
      evidence: 'TEST_ONLY_NOT_APPROVAL',
    }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(await f.db.cardInstance.count()).toBe(before);
});
it('publishes only independently reviewed exact hashes and retains immutable recipes after retirement', async () => {
  const published = await fixtureScreen(f),
    view = (await published.catalog.list()).patterns[0]!;
  expect(view.definition).toEqual(testScreenDefinition);
  expect(view.definitionHash).toBe(hash(testScreenDefinition));
  await expect(
    f.db.screenPattern.update({
      where: { id: published.patternId },
      data: {
        definition: { ...testScreenDefinition, requiredSteps: 1 },
        stateVersion: 3,
      },
    }),
  ).rejects.toThrow();
  await expect(
    f.db.screenReview.deleteMany({ where: { patternId: published.patternId } }),
  ).rejects.toThrow();
  await published.catalog.command(published.publisher.principal, {
    commandId: randomUUID(),
    reason: 'TEST_ONLY_RETIRE',
    action: 'RETIRE',
    patternId: published.patternId,
    expectedVersion: 2,
  });
  expect((await published.catalog.list()).patterns).toHaveLength(0);
  expect(
    (
      await f.db.screenPattern.findUniqueOrThrow({
        where: { id: published.patternId },
      })
    ).definition,
  ).toEqual(testScreenDefinition);
  expect(
    await f.db.cardInstance.count({
      where: { ownerId: published.editor.userId },
    }),
  ).toBe(0);
}, 30000);
it('requires distinct content/economy reviewers and a separate publisher bound to the exact recipe hash', async () => {
  const editor = await fixtureAdmin(f, [
      'CONTENT_EDITOR',
      'CONTENT_REVIEWER',
      'CONTENT_PUBLISHER',
    ]),
    reviewer = await fixtureAdmin(f, ['CONTENT_REVIEWER']),
    publisher = await fixtureAdmin(f, ['CONTENT_PUBLISHER']),
    patternId = randomUUID(),
    service = new ScreenCatalogService(f.db);
  const key = () => ({
    commandId: randomUUID(),
    reason: 'TEST_ONLY_NOT_APPROVAL',
    patternId,
  });
  await service.command(editor.principal, {
    ...key(),
    action: 'DRAFT',
    slug: 'test-screen-' + patternId,
    version: 1,
    definition: testScreenDefinition,
  });
  await expect(
    service.command(editor.principal, {
      ...key(),
      action: 'REVIEW',
      review: 'CONTENT',
      definitionHash: hash(testScreenDefinition),
      evidence: 'TEST_ONLY_NOT_APPROVAL',
    }),
  ).rejects.toMatchObject({ code: 'INDEPENDENT_SCREEN_REVIEW_REQUIRED' });
  await expect(
    service.command(reviewer.principal, {
      ...key(),
      action: 'REVIEW',
      review: 'CONTENT',
      definitionHash: 'a'.repeat(64),
      evidence: 'TEST_ONLY_NOT_APPROVAL',
    }),
  ).rejects.toMatchObject({ code: 'INDEPENDENT_SCREEN_REVIEW_REQUIRED' });
  await service.command(reviewer.principal, {
    ...key(),
    action: 'REVIEW',
    review: 'CONTENT',
    definitionHash: hash(testScreenDefinition),
    evidence: 'TEST_ONLY_NOT_APPROVAL',
  });
  await expect(
    service.command(publisher.principal, {
      ...key(),
      action: 'PUBLISH',
      expectedVersion: 1,
    }),
  ).rejects.toMatchObject({ code: 'INDEPENDENT_SCREEN_REVIEW_REQUIRED' });
});
