import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createCardWithOrigin, writeCardTransition } from '@deckforge/database';
import { developmentCatalog } from '@deckforge/card-domain';
import { identityFixture } from '../test/auth-fixture';
import { fixturePress } from '../test/press-fixture';
import { PressJobService } from './press/jobs';
import { FusionService } from './fusion';
let f: Awaited<ReturnType<typeof identityFixture>>;
beforeAll(async () => {
  f = await identityFixture();
});
afterAll(async () => {
  await f?.close();
});
it('starts exactly one reserved job under concurrent retries and cannot reserve a second slot or another owner source', async () => {
  const x = await fixturePress(f),
    replies = await Promise.all(
      Array.from({ length: 10 }, () => x.service.start(x.p.principal, x.input)),
    );
  for (const reply of replies) expect(reply).toEqual(replies[0]);
  expect(await f.db.pressJob.count({ where: { userId: x.p.userId } })).toBe(1);
  expect(
    await f.db.pressJobEvent.count({ where: { userId: x.p.userId } }),
  ).toBe(1);
  expect(
    await f.db.ownedScreen.findUniqueOrThrow({
      where: { id: x.input.screenId },
    }),
  ).toMatchObject({
    status: 'ASSIGNED',
    stateVersion: 2,
    jobId: replies[0]!.jobId,
  });
  await expect(
    x.service.start(x.p.principal, { ...x.input, commandId: randomUUID() }),
  ).rejects.toMatchObject({ code: 'PRESS_SLOT_RESERVED' });
  await expect(
    x.service.start(f.players[0]!.principal, {
      ...x.input,
      commandId: randomUUID(),
    }),
  ).rejects.toMatchObject({ code: 'PERMANENT_ACCOUNT_REQUIRED' });
  await expect(
    x.service.view(f.players[1]!.principal, replies[0]!.jobId),
  ).rejects.toMatchObject({ code: 'PRESS_JOB_UNAVAILABLE' });
  expect((await new PressJobService(f.db).view(x.p.principal)).active?.id).toBe(
    replies[0]!.jobId,
  );
}, 30000);
it('pauses/resumes with stable versions, cancels an untouched job by returning its screen and preserves the original card', async () => {
  const x = await fixturePress(f),
    started = await x.service.start(x.p.principal, x.input),
    pause = {
      commandId: randomUUID(),
      jobId: started.jobId,
      expectedVersion: 1,
      action: 'PAUSE',
    };
  const paused = await x.service.command(x.p.principal, pause);
  expect(paused).toMatchObject({ status: 'PAUSED', stateVersion: 2 });
  expect(await x.service.command(x.p.principal, pause)).toEqual(paused);
  await expect(
    x.service.command(x.p.principal, { ...pause, commandId: randomUUID() }),
  ).rejects.toMatchObject({ code: 'STALE_PRESS_JOB' });
  const resumed = await x.service.command(x.p.principal, {
    commandId: randomUUID(),
    jobId: started.jobId,
    expectedVersion: 2,
    action: 'RESUME',
  });
  expect(resumed.stateVersion).toBe(3);
  await new PressJobService(f.db).command(x.p.principal, {
    commandId: randomUUID(),
    jobId: started.jobId,
    expectedVersion: 3,
    action: 'CANCEL',
  });
  expect(
    await f.db.ownedScreen.findUniqueOrThrow({
      where: { id: x.input.screenId },
    }),
  ).toMatchObject({ status: 'AVAILABLE', stateVersion: 3, jobId: null });
  expect(
    await f.db.cardInstance.findUniqueOrThrow({ where: { id: x.card.id } }),
  ).toMatchObject({ status: 'OWNED', level: 1, stateVersion: 1 });
  expect(
    await f.db.pressJobEvent.count({ where: { jobId: started.jobId } }),
  ).toBe(4);
  await x.service.start(x.p.principal, {
    ...x.input,
    commandId: randomUUID(),
    expectedScreenVersion: 3,
  });
}, 30000);
it('rejects game-locked, terminal, cross-branch and stale sources, while an active job still permits old-state game lock/unlock', async () => {
  const x = await fixturePress(f),
    token = randomUUID();
  await f.db.$transaction((tx) =>
    writeCardTransition(tx, {
      instanceId: x.card.id,
      ownerId: x.p.userId,
      expectedVersion: 1,
      command: { action: 'LOCK', lockToken: token, lockReason: 'TEST_MATCH' },
      operatorId: 'test.press-lock',
      sourceKey: randomUUID(),
      reason: 'TEST_ONLY',
    }),
  );
  await expect(
    x.service.start(x.p.principal, { ...x.input, expectedCardVersion: 2 }),
  ).rejects.toMatchObject({ code: 'INELIGIBLE_PRESS_SOURCE' });
  await f.db.$transaction((tx) =>
    writeCardTransition(tx, {
      instanceId: x.card.id,
      ownerId: x.p.userId,
      expectedVersion: 2,
      command: { action: 'UNLOCK', lockToken: token },
      operatorId: 'test.press-lock',
      sourceKey: randomUUID(),
      reason: 'TEST_ONLY',
    }),
  );
  const started = await x.service.start(x.p.principal, {
    ...x.input,
    expectedCardVersion: 3,
  });
  await f.db.$transaction((tx) =>
    writeCardTransition(tx, {
      instanceId: x.card.id,
      ownerId: x.p.userId,
      expectedVersion: 3,
      command: { action: 'LOCK', lockToken: token, lockReason: 'TEST_MATCH' },
      operatorId: 'test.press-lock',
      sourceKey: randomUUID(),
      reason: 'TEST_ONLY',
    }),
  );
  expect(
    (await x.service.view(x.p.principal, started.jobId)).active?.status,
  ).toBe('ACTIVE');
  await f.db.$transaction((tx) =>
    writeCardTransition(tx, {
      instanceId: x.card.id,
      ownerId: x.p.userId,
      expectedVersion: 4,
      command: { action: 'UNLOCK', lockToken: token },
      operatorId: 'test.press-lock',
      sourceKey: randomUUID(),
      reason: 'TEST_ONLY',
    }),
  );
  const terminal = await fixturePress(f, 5),
    red = await fixturePress(f, 2, 'RED');
  for (const y of [terminal, red])
    await expect(y.service.start(y.p.principal, y.input)).rejects.toMatchObject(
      { code: 'INELIGIBLE_PRESS_SOURCE' },
    );
}, 30000);
it('prevents fusion or direct job rewriting, and deletion atomically revokes the reservation without consuming/evolving', async () => {
  const x = await fixturePress(f),
    started = await x.service.start(x.p.principal, x.input),
    ids = [x.card.id];
  for (let i = 0; i < 4; i++)
    ids.push(
      (
        await f.db.$transaction((tx) =>
          createCardWithOrigin(
            tx,
            {
              ownerId: x.p.userId,
              templateId: x.card.templateId,
              seriesId: x.card.seriesId,
              faceId: x.card.faceId,
              level: 1,
              branch: 'BLUE',
              rarity: 'COMMON',
            },
            {
              operatorId: 'test.press-fusion',
              sourceKey: randomUUID(),
              reason: 'TEST_ONLY',
            },
          ),
        )
      ).id,
    );
  const fusion = new FusionService(f.db, {
    version: 'TEST_ONLY',
    approvalReference: 'TEST_ONLY_NOT_APPROVAL',
    eligibleSeries: [developmentCatalog.seriesId],
    recipe: 'MATCHED_TEMPLATE_RARITY_PRESERVE_V1',
  });
  await expect(
    fusion.preview(x.p.principal, { sourceIds: ids }),
  ).rejects.toMatchObject({ code: 'CARD_RESERVED_FOR_PRESS' });
  await expect(
    f.db.pressJob.update({
      where: { id: started.jobId },
      data: { acceptedSteps: 4000, stateVersion: 2 },
    }),
  ).rejects.toThrow();
  await expect(
    f.db.pressJobEvent.deleteMany({ where: { jobId: started.jobId } }),
  ).rejects.toThrow();
  await f.auth.requestDeletion(x.p.principal);
  expect(
    await f.db.pressJob.findUniqueOrThrow({ where: { id: started.jobId } }),
  ).toMatchObject({ status: 'REVOKED', stateVersion: 2, acceptedSteps: 0 });
  expect(
    await f.db.ownedScreen.findUniqueOrThrow({
      where: { id: x.input.screenId },
    }),
  ).toMatchObject({ status: 'REVOKED', jobId: started.jobId });
  expect(
    await f.db.cardInstance.findUniqueOrThrow({ where: { id: x.card.id } }),
  ).toMatchObject({ level: 1, status: 'OWNED' });
}, 30000);
