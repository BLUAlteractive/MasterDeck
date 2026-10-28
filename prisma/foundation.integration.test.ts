import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type PrismaClient } from '../packages/database/src';
import { sampleSeriesId, seedFoundation } from '../packages/database/src/seed';

let database: PrismaClient;
let userId: string;
let templateId: string;
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? 'http://missing.invalid');
  if (
    url.hostname !== '127.0.0.1' ||
    !/^deckforge_test_[a-f0-9]{16}$/.test(
      process.env.DECKFORGE_DISPOSABLE_DB ?? '',
    ) ||
    url.pathname !== `/${process.env.DECKFORGE_DISPOSABLE_DB}`
  ) {
    throw new Error(
      'Integration tests require the runner-owned disposable database.',
    );
  }
  database = createDatabase(url.toString());
  userId = (await database.user.create({ data: {} })).id;
  templateId = (
    await database.cardTemplate.create({
      data: {
        seriesId: sampleSeriesId,
        faceId: 'A-S',
        playStyleFamily: 'fixture-only',
      },
    })
  ).id;
});
afterAll(async () => {
  await database?.$disconnect();
});
function cardData() {
  return {
    ownerId: userId,
    templateId,
    seriesId: sampleSeriesId,
    faceId: 'A-S',
  };
}

describe('PostgreSQL foundation constraints', () => {
  it('seeds all 52 canonical faces and one unpublished sample without grants or overwrite', async () => {
    const before = await database.cardInstance.count();
    await Promise.all([seedFoundation(database), seedFoundation(database)]);
    const faces = await database.faceDefinition.findMany();
    expect(faces).toHaveLength(52);
    expect(new Set(faces.map((face) => face.id)).size).toBe(52);
    for (const suit of ['CLUBS', 'DIAMONDS', 'HEARTS', 'SPADES']) {
      expect(
        faces
          .filter((face) => face.suit === suit)
          .map((face) => face.rank)
          .sort((a, b) => a - b),
      ).toEqual(Array.from({ length: 13 }, (_, i) => i + 2));
    }
    expect(await database.cardSeries.count()).toBe(1);
    expect(
      (
        await database.cardSeries.findUniqueOrThrow({
          where: { id: sampleSeriesId },
        })
      ).status,
    ).toBe('DRAFT');
    expect(await database.cardInstance.count()).toBe(before);
    await database.cardSeries.update({
      where: { id: sampleSeriesId },
      data: { displayName: 'Retained local edit' },
    });
    await seedFoundation(database);
    expect(
      (
        await database.cardSeries.findUniqueOrThrow({
          where: { id: sampleSeriesId },
        })
      ).displayName,
    ).toBe('Retained local edit');
  });

  it('allows exactly one insertion of a card UUID under eight concurrent attempts', async () => {
    const id = randomUUID();
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        database.cardInstance.create({ data: { ...cardData(), id } }),
      ),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(7);
    for (const result of results) {
      if (result.status === 'rejected')
        expect(result.reason).toMatchObject({ code: 'P2002' });
    }
    expect(await database.cardInstance.count({ where: { id } })).toBe(1);
  });

  it('rejects missing owners, mismatched template faces and referenced-row deletion', async () => {
    await expect(
      database.cardInstance.create({
        data: { ...cardData(), ownerId: randomUUID() },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      database.cardInstance.create({ data: { ...cardData(), faceId: 'Q-H' } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await database.cardInstance.create({ data: cardData() });
    await expect(
      database.user.delete({ where: { id: userId } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      database.cardTemplate.delete({ where: { id: templateId } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      database.faceDefinition.delete({ where: { id: 'A-S' } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('enforces face, enum, branch, positive version and serial constraints in PostgreSQL', async () => {
    await expect(
      database.$executeRaw`INSERT INTO "FaceDefinition" ("id", "rank", "suit") VALUES ('BAD', 15, 'SPADES')`,
    ).rejects.toThrow();
    await expect(
      database.$executeRaw`UPDATE "FaceDefinition" SET "id" = 'wrong' WHERE "id" = 'Q-H'`,
    ).rejects.toThrow();
    await expect(
      database.$executeRaw`UPDATE "User" SET "status" = 'UNKNOWN' WHERE "id" = ${userId}::uuid`,
    ).rejects.toThrow();
    for (const invalid of [
      { level: 2 },
      { level: 9 },
      { stateVersion: 0 },
      { editionSerial: -1 },
    ]) {
      await expect(
        database.cardInstance.create({ data: { ...cardData(), ...invalid } }),
      ).rejects.toThrow();
    }
    await expect(
      database.cardInstance.create({
        data: { ...cardData(), branch: 'RED', level: 2 },
      }),
    ).resolves.toMatchObject({ level: 2 });
    const serial = 101;
    await database.cardInstance.create({
      data: { ...cardData(), editionSerial: serial },
    });
    await expect(
      database.cardInstance.create({
        data: { ...cardData(), editionSerial: serial },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('protects permanent instance identity and advances mutable state by one version', async () => {
    const card = await database.cardInstance.create({ data: cardData() });
    await expect(
      database.cardInstance.update({
        where: { id: card.id },
        data: { id: randomUUID(), stateVersion: 2 },
      }),
    ).rejects.toThrow();
    await expect(
      database.cardInstance.update({
        where: { id: card.id },
        data: { level: 3 },
      }),
    ).rejects.toThrow();
    const attempts = await Promise.all(
      Array.from({ length: 8 }, () =>
        database.cardInstance.updateMany({
          where: { id: card.id, stateVersion: 1 },
          data: { status: 'LOCKED', stateVersion: { increment: 1 } },
        }),
      ),
    );
    expect(attempts.reduce((total, result) => total + result.count, 0)).toBe(1);
    expect(
      (
        await database.cardInstance.findUniqueOrThrow({
          where: { id: card.id },
        })
      ).stateVersion,
    ).toBe(2);
    await expect(
      database.cardInstance.delete({ where: { id: card.id } }),
    ).rejects.toThrow();
  });

  it('preserves append-only events and rejects duplicate source keys and orphan history', async () => {
    const card = await database.cardInstance.create({ data: cardData() });
    const event = await database.ownershipEvent.create({
      data: {
        instanceId: card.id,
        actorUserId: userId,
        action: 'GRANT',
        sourceKey: randomUUID(),
        reason: 'integration fixture',
        stateVersion: 1,
        snapshot: { level: 1 },
      },
    });
    await expect(
      database.ownershipEvent.update({
        where: { id: event.id },
        data: { reason: 'rewrite' },
      }),
    ).rejects.toThrow();
    await expect(
      database.ownershipEvent.delete({ where: { id: event.id } }),
    ).rejects.toThrow();
    const copy = event;
    // Select explicit fields so tests do not accidentally reuse metadata as authoritative input.
    const data = {
      instanceId: copy.instanceId,
      actorUserId: userId,
      action: copy.action,
      sourceKey: copy.sourceKey,
      reason: copy.reason,
      stateVersion: copy.stateVersion,
      snapshot: { level: 1 },
    };
    await expect(
      database.ownershipEvent.create({ data }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      database.ownershipEvent.create({
        data: { ...data, sourceKey: randomUUID(), instanceId: randomUUID() },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    expect(
      await database.ownershipEvent.count({ where: { id: event.id } }),
    ).toBe(1);
  });

  it('scopes immutable operation records by user, operation and key', async () => {
    const other = await database.user.create({ data: {} });
    const data = {
      userId,
      operation: 'fixture',
      key: 'fixture-key-001',
      requestHash: 'a'.repeat(64),
      result: { ok: true },
    };
    const record = await database.operationRecord.create({ data });
    await expect(
      database.operationRecord.create({ data }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await database.operationRecord.create({
      data: { ...data, userId: other.id },
    });
    await database.operationRecord.create({
      data: { ...data, operation: 'other' },
    });
    await expect(
      database.operationRecord.update({
        where: { id: record.id },
        data: { result: { changed: true } },
      }),
    ).rejects.toThrow();
    await expect(
      database.operationRecord.delete({ where: { id: record.id } }),
    ).rejects.toThrow();
    await expect(
      database.operationRecord.create({ data: { ...data, key: 'short' } }),
    ).rejects.toThrow();
  });

  it('binds external subjects to one internal user and rolls back failed multi-row transactions', async () => {
    const issuer = 'https://identity.example.invalid';
    const subject = randomUUID();
    await database.externalIdentity.create({
      data: { issuer, subject, userId },
    });
    const other = await database.user.create({ data: {} });
    await expect(
      database.externalIdentity.create({
        data: { issuer, subject, userId: other.id },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    const id = randomUUID();
    await expect(
      database.$transaction(
        async (tx) => {
          await tx.cardInstance.create({ data: { ...cardData(), id } });
          await tx.ownershipEvent.create({
            data: {
              instanceId: id,
              action: 'GRANT',
              sourceKey: id,
              reason: 'rollback fixture',
              stateVersion: 1,
              snapshot: { level: 1 },
            },
          });
          throw new Error('intentional rollback');
        },
        { isolationLevel: 'Serializable' },
      ),
    ).rejects.toThrow('intentional rollback');
    expect(
      await database.cardInstance.findUnique({ where: { id } }),
    ).toBeNull();
    expect(
      await database.ownershipEvent.count({ where: { instanceId: id } }),
    ).toBe(0);
  });
});
