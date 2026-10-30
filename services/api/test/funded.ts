import { randomUUID } from 'node:crypto';
import { createCardWithOrigin, type PrismaClient } from '@deckforge/database';
import { developmentCatalog } from '@deckforge/card-domain';
/** Isolated fixture inventory. Never imported by runtime controllers or grant adapters. */
export async function fixtureLoadout(db: PrismaClient, userId: string) {
  return db.$transaction(
    async (tx) => {
      const templates = await tx.cardTemplate.findMany({
        where: { seriesId: developmentCatalog.seriesId, version: 1 },
      });
      if (templates.length !== 52) throw new Error('Fixture catalog required');
      const selected = [];
      for (const t of templates)
        selected.push(
          await createCardWithOrigin(
            tx,
            {
              ownerId: userId,
              templateId: t.id,
              seriesId: t.seriesId,
              faceId: t.faceId,
            },
            {
              operatorId: 'test.funded-hand',
              sourceKey: randomUUID(),
              reason: 'ISOLATED_TEST_ONLY',
            },
          ),
        );
      const id = randomUUID();
      await tx.loadout.create({ data: { id, userId } });
      await tx.loadoutCard.createMany({
        data: selected.map((c) => ({
          loadoutId: id,
          userId,
          loadoutVersion: 1,
          faceId: c.faceId,
          instanceId: c.id,
        })),
      });
      return selected;
    },
    { timeout: 15000 },
  );
}
