import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createCardWithOrigin, writeCardTransition } from '@deckforge/database';
import { developmentCatalog } from '@deckforge/card-domain';
import {
  fusionPreviewSchema,
  fusionReceiptSchema,
  type FusionPolicy,
  type FusionPreview,
  fusionLineageSchema,
} from '@deckforge/contracts';
import { identityFixture } from '../test/auth-fixture';
import { FusionService } from './fusion';
import { hash, json } from './rooms/shared';
import { fixtureLoadout } from '../test/funded';
const policy: FusionPolicy = {
  version: 'FUSION_TEST_ONLY_V1',
  approvalReference: 'FIXTURE ONLY — NOT PRODUCT APPROVAL',
  eligibleSeries: [developmentCatalog.seriesId],
  recipe: 'MATCHED_TEMPLATE_RARITY_PRESERVE_V1',
};
let f: Awaited<ReturnType<typeof identityFixture>>;
beforeAll(async () => {
  f = await identityFixture(null, null, policy);
});
afterAll(async () => {
  await f?.close();
});
async function ingredients(
  actor: Awaited<ReturnType<typeof f.actor>>,
  level = 1,
  branch: 'BLUE' | 'RED' = 'BLUE',
) {
  const template = await f.db.cardTemplate.findFirstOrThrow({
    where: { seriesId: developmentCatalog.seriesId, faceId: 'Q-H' },
  });
  return f.db.$transaction(async (tx) => {
    const rows = [];
    for (let i = 0; i < 5; i++)
      rows.push(
        await createCardWithOrigin(
          tx,
          {
            ownerId: actor.userId,
            templateId: template.id,
            seriesId: template.seriesId,
            faceId: template.faceId,
            level,
            branch,
            rarity: 'COMMON',
          },
          {
            operatorId: 'fusion-test',
            sourceKey: randomUUID(),
            reason: 'Disposable fixture',
          },
        ),
      );
    return rows;
  });
}
async function preview(a: Awaited<ReturnType<typeof f.actor>>, ids: string[]) {
  const r = await f.request('fusion/preview', a.bearer, { sourceIds: ids });
  expect(r.status).toBe(200);
  return fusionPreviewSchema.parse(await r.json());
}
const command = (p: FusionPreview) => ({
  previewId: p.previewId,
  previewHash: p.previewHash,
  commandId: randomUUID(),
  confirm: true as const,
});
describe('authenticated atomic fusion', () => {
  it('previews all losses without mutation, confirms exact child and preserves complete lineage and selections', async () => {
    const a = await f.actor();
    const cards = await ingredients(a);
    const ids = cards.map((c) => c.id);
    // A real 52-face starter loadout, replacing only its matching face with an ingredient.
    await fixtureLoadout(f.db, a.userId);
    const loadout = await f.db.loadout.findUniqueOrThrow({
      where: { userId: a.userId },
    });
    await f.db.loadoutCard.update({
      where: { loadoutId_faceId: { loadoutId: loadout.id, faceId: 'Q-H' } },
      data: { instanceId: ids[0]! },
    });
    await f.db.collectionManager.create({ data: { userId: a.userId } });
    await f.db.collectionManagerSlot.createMany({
      data: ids.map((instanceId, slot) => ({
        userId: a.userId,
        instanceId,
        slot: slot + 1,
        managerVersion: 1,
      })),
    });
    await f.db.cardFavorite.create({
      data: { userId: a.userId, instanceId: ids[3]!, favorite: true },
    });
    const p = await preview(a, ids);
    expect(p.effects.loadout?.sourceId).toBe(ids[0]);
    expect(p.effects.manager?.slots).toEqual([1, 2, 3, 4, 5]);
    expect(p.effects.favoriteSources).toEqual([ids[3]]);
    expect(
      await f.db.cardInstance.count({
        where: { id: { in: ids }, status: 'OWNED' },
      }),
    ).toBe(5);
    expect(
      await f.db.cardInstance.findUnique({ where: { id: p.child.id } }),
    ).toBeNull();
    const input = command(p);
    const r = await f.request('fusion/confirm', a.bearer, input);
    expect(r.status).toBe(200);
    const result = fusionReceiptSchema.parse(await r.json());
    expect(result.child).toEqual(p.child);
    expect(
      await (await f.request('fusion/confirm', a.bearer, input)).json(),
    ).toEqual(result);
    expect(
      await (
        await f.request('fusion/confirm', a.bearer, {
          ...input,
          commandId: randomUUID(),
        })
      ).json(),
    ).toEqual(result);
    const child = await f.db.cardInstance.findUniqueOrThrow({
      where: { id: result.child.id },
    });
    expect(child.level).toBe(3);
    expect(child.stateVersion).toBe(1);
    expect(
      await f.db.cardInstance.count({
        where: { id: { in: ids }, status: 'CONSUMED' },
      }),
    ).toBe(5);
    expect(
      await f.db.ownershipEvent.count({
        where: { instanceId: { in: [...ids, child.id] } },
      }),
    ).toBe(11);
    expect(
      fusionLineageSchema.parse(
        await (await f.request('fusion/lineage/' + child.id, a.bearer)).json(),
      ).parents,
    ).toEqual([...ids].sort());
    expect(
      fusionLineageSchema.parse(
        await (await f.request('fusion/lineage/' + ids[0], a.bearer)).json(),
      ).children,
    ).toEqual([child.id]);
    expect(
      (
        await f.db.loadoutCard.findUniqueOrThrow({
          where: { loadoutId_faceId: { loadoutId: loadout.id, faceId: 'Q-H' } },
        })
      ).instanceId,
    ).toBe(child.id);
    expect(
      await f.db.loadoutCard.count({ where: { loadoutId: loadout.id } }),
    ).toBe(52);
    expect(
      await f.db.collectionManagerSlot.findMany({
        where: { userId: a.userId },
        select: { slot: true, instanceId: true, managerVersion: true },
      }),
    ).toEqual([{ slot: 1, instanceId: child.id, managerVersion: 2 }]);
    expect(
      (
        await f.db.cardFavorite.findUniqueOrThrow({
          where: {
            userId_instanceId: { userId: a.userId, instanceId: child.id },
          },
        })
      ).favorite,
    ).toBe(true);
    await expect(
      new FusionService(f.db, null).confirm(a.principal, input),
    ).resolves.toEqual(result);
    expect(
      (
        await f.request('fusion/confirm', a.bearer, {
          ...input,
          previewHash: '0'.repeat(64),
        })
      ).status,
    ).toBe(409);
    const outsider = await f.actor();
    expect(
      (await f.request('fusion/lineage/' + child.id, outsider.bearer)).status,
    ).toBe(404);
    await expect(
      f.db.fusionJob.update({
        where: { id: result.jobId },
        data: { receipt: {} },
      }),
    ).rejects.toThrow();
    await expect(
      f.db.fusionIngredient.delete({ where: { parentId: ids[0]! } }),
    ).rejects.toThrow();
  });
  it('serializes cross-service duplicate confirmations and overlapping previews into exactly one child', async () => {
    const a = await f.actor(),
      cards = await ingredients(a),
      ids = cards.map((c) => c.id);
    const p = await preview(a, ids),
      q = await preview(a, ids);
    const input = command(p);
    const one = new FusionService(f.db, policy),
      two = new FusionService(f.secondDb, policy);
    const receipts = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        (i % 2 ? one : two).confirm(a.principal, input),
      ),
    );
    expect(new Set(receipts.map((r) => r.jobId)).size).toBe(1);
    await expect(two.confirm(a.principal, command(q))).rejects.toThrow();
    expect(await f.db.fusionJob.count({ where: { ownerId: a.userId } })).toBe(
      1,
    );
    expect(
      await f.db.fusionIngredient.count({ where: { parentId: { in: ids } } }),
    ).toBe(5);
  });
  it('allows only one simultaneous confirmation of different previews sharing parents', async () => {
    const a = await f.actor(),
      cards = await ingredients(a),
      ids = cards.map((c) => c.id),
      p = await preview(a, ids),
      q = await preview(a, ids);
    const outcomes = await Promise.allSettled([
      new FusionService(f.db, policy).confirm(a.principal, command(p)),
      new FusionService(f.secondDb, policy).confirm(a.principal, command(q)),
    ]);
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(await f.db.fusionJob.count({ where: { ownerId: a.userId } })).toBe(
      1,
    );
    expect(
      await f.db.cardInstance.count({
        where: { id: { in: ids }, status: 'CONSUMED' },
      }),
    ).toBe(5);
  });
  it('requires fresh preview after lock/version, favorite or loadout selection changes', async () => {
    const a = await f.actor(),
      cards = await ingredients(a),
      ids = cards.map((c) => c.id);
    const p = await preview(a, ids);
    await f.db.cardFavorite.create({
      data: { userId: a.userId, instanceId: ids[0]!, favorite: true },
    });
    expect(
      (await f.request('fusion/confirm', a.bearer, command(p))).status,
    ).toBe(409);
    const q = await preview(a, ids),
      lockToken = randomUUID();
    await f.db.$transaction(async (tx) => {
      await writeCardTransition(tx, {
        instanceId: ids[0]!,
        ownerId: a.userId,
        expectedVersion: 1,
        command: { action: 'LOCK', lockToken, lockReason: 'TEST_LOCK' },
        operatorId: 'test',
        sourceKey: randomUUID(),
        reason: 'Fixture',
      });
      await writeCardTransition(tx, {
        instanceId: ids[0]!,
        ownerId: a.userId,
        expectedVersion: 2,
        command: { action: 'UNLOCK', lockToken },
        operatorId: 'test',
        sourceKey: randomUUID(),
        reason: 'Fixture',
      });
    });
    expect(
      (await f.request('fusion/confirm', a.bearer, command(q))).status,
    ).toBe(409);
    expect(await f.db.fusionJob.count({ where: { ownerId: a.userId } })).toBe(
      0,
    );
  });
  it('rejects foreign/duplicate/locked sources, unapproved policy and client-controlled output', async () => {
    const a = await f.actor(),
      other = await f.actor(),
      cards = await ingredients(a),
      ids = cards.map((c) => c.id);
    expect(
      (await f.request('fusion/preview', other.bearer, { sourceIds: ids }))
        .status,
    ).toBe(404);
    expect(
      (
        await f.request('fusion/preview', a.bearer, {
          sourceIds: [...ids.slice(1), ids[1]],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await f.request('fusion/preview', a.bearer, {
          sourceIds: ids,
          level: 6,
        })
      ).status,
    ).toBe(400);
    await expect(
      new FusionService(f.db).preview(a.principal, { sourceIds: ids }),
    ).rejects.toMatchObject({ code: 'FUSION_POLICY_NOT_CONFIGURED' });
    const p = await preview(a, ids);
    await expect(
      new FusionService(f.db, { ...policy, version: 'OTHER' }).confirm(
        a.principal,
        command(p),
      ),
    ).rejects.toMatchObject({ code: 'FUSION_POLICY_CHANGED' });
    await f.db.$transaction((tx) =>
      writeCardTransition(tx, {
        instanceId: ids[0]!,
        ownerId: a.userId,
        expectedVersion: 1,
        command: {
          action: 'LOCK',
          lockToken: randomUUID(),
          lockReason: 'PENDING_REFUND',
        },
        operatorId: 'test',
        sourceKey: randomUUID(),
        reason: 'Fixture',
      }),
    );
    expect(
      (await f.request('fusion/preview', a.bearer, { sourceIds: ids })).status,
    ).toBe(409);
    expect(
      (
        await f.request('fusion/confirm', a.bearer, {
          ...command(p),
          confirm: false,
        })
      ).status,
    ).toBe(400);
  });
  it('rejects expired previews, revoked sessions and incomplete direct-SQL jobs', async () => {
    const a = await f.actor(),
      cards = await ingredients(a),
      ids = cards.map((c) => c.id),
      p = await preview(a, ids);
    const previewId = randomUUID(),
      expiresAt = new Date(Date.now() - 60000).toISOString(),
      childId = randomUUID();
    const body = {
      policy: p.policy,
      sources: p.sources,
      child: { ...p.child, id: childId },
      effects: p.effects,
    };
    const previewHash = hash({
      ownerId: a.userId,
      previewId,
      expiresAt,
      ...body,
    });
    await f.db.fusionPreview.create({
      data: {
        id: previewId,
        ownerId: a.userId,
        childId,
        expiresAt: new Date(expiresAt),
        fingerprint: previewHash,
        snapshot: json({ ...body, previewId, previewHash, expiresAt }),
      },
    });
    await expect(
      new FusionService(f.db, policy).confirm(a.principal, {
        ...command(p),
        previewId,
        previewHash,
      }),
    ).rejects.toMatchObject({ code: 'PREVIEW_EXPIRED' });
    await expect(
      f.db.$transaction(async (tx) => {
        await createCardWithOrigin(
          tx,
          { ...p.child, ownerId: a.userId },
          {
            operatorId: 'test',
            sourceKey: randomUUID(),
            reason: 'Invalid fixture',
            action: 'FUSION_CREATE',
          },
        );
        await tx.fusionJob.create({
          data: {
            id: randomUUID(),
            previewId: p.previewId,
            ownerId: a.userId,
            childId: p.child.id,
            receipt: json({
              previewHash: p.previewHash,
              child: p.child,
              effects: p.effects,
            }),
          },
        });
      }),
    ).rejects.toThrow();
    expect(
      await f.db.cardInstance.findUnique({ where: { id: p.child.id } }),
    ).toBeNull();
    await f.db.authSession.update({
      where: { id: a.principal.sessionId },
      data: { revokedAt: new Date() },
    });
    await expect(
      new FusionService(f.db, policy).confirm(a.principal, command(p)),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(
      await f.db.cardInstance.count({
        where: { id: { in: ids }, status: 'OWNED' },
      }),
    ).toBe(5);
  });
  it.each([
    [2, 'RED', 4],
    [3, 'BLUE', 5],
    [4, 'RED', 6],
  ] as const)(
    'creates exact %s %s branch outcome',
    async (level, branch, target) => {
      const a = await f.actor(),
        cards = await ingredients(a, level, branch);
      const p = await preview(
        a,
        cards.map((c) => c.id),
      );
      expect(p.child.level).toBe(target);
      const r = await f.request('fusion/confirm', a.bearer, command(p));
      expect(r.status).toBe(200);
      expect(fusionReceiptSchema.parse(await r.json()).child).toEqual(p.child);
    },
  );
  it('rolls back every consume when child creation fails and allows the original confirmation retry', async () => {
    const a = await f.actor(),
      cards = await ingredients(a),
      ids = cards.map((c) => c.id),
      p = await preview(a, ids),
      input = command(p);
    await f.db.$executeRawUnsafe(
      `CREATE FUNCTION fusion_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."id"='${p.child.id}'::uuid THEN RAISE EXCEPTION 'injected child failure'; END IF; RETURN NEW; END $$`,
    );
    await f.db.$executeRawUnsafe(
      'CREATE TRIGGER fusion_test_fail BEFORE INSERT ON "CardInstance" FOR EACH ROW EXECUTE FUNCTION fusion_test_fail()',
    );
    try {
      await expect(
        new FusionService(f.db, policy).confirm(a.principal, input),
      ).rejects.toThrow();
    } finally {
      await f.db.$executeRawUnsafe(
        'DROP TRIGGER fusion_test_fail ON "CardInstance"',
      );
      await f.db.$executeRawUnsafe('DROP FUNCTION fusion_test_fail()');
    }
    expect(
      await f.db.cardInstance.count({
        where: { id: { in: ids }, status: 'OWNED', stateVersion: 1 },
      }),
    ).toBe(5);
    expect(await f.db.fusionJob.count({ where: { ownerId: a.userId } })).toBe(
      0,
    );
    expect(
      await f.db.ownershipEvent.count({ where: { instanceId: { in: ids } } }),
    ).toBe(5);
    expect((await f.request('fusion/confirm', a.bearer, input)).status).toBe(
      200,
    );
  });
});
