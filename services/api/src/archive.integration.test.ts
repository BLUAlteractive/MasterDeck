import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import {
  createDatabase,
  createCardWithOrigin,
  writeCardTransition,
  type PrismaClient,
} from '@deckforge/database';
import { developmentCatalog } from '@deckforge/card-domain';
import {
  archiveResponseSchema,
  albumResponseSchema,
} from '@deckforge/contracts';
import { createApp } from './app';
import { createCollectionClient } from '../../../apps/mobile/src/collection/client';
import { AuthService } from './auth/service';
import { createTokenVerifier } from './auth/token-verifier';
const apiRequire = createRequire(
  fileURLToPath(new URL('../package.json', import.meta.url)),
);
const { generateKeyPair, exportJWK, SignJWT } = (await import(
  apiRequire.resolve('jose')
)) as typeof import('jose');
let db: PrismaClient;
let app: Awaited<ReturnType<typeof createApp>>;
let jwks: Server;
let base: string;
let issuer: string;
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let auth: AuthService;
const seriesId = developmentCatalog.seriesId;
async function token(sub: string, sid: string, guest = true) {
  return new SignJWT({
    session_id: sid,
    is_anonymous: guest,
    role: 'authenticated',
    aal: 'aal1',
  })
    .setProtectedHeader({ alg: 'ES256', kid: 'starter-test' })
    .setSubject(sub)
    .setIssuer(issuer)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(keys.privateKey);
}
async function request(path: string, bearer?: string, body?: unknown) {
  return fetch(base + '/v1/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function actor() {
  const sub = randomUUID(),
    sid = randomUUID();
  const bearer = await token(sub, sid);
  const response = await request('auth/session', bearer, {});
  expect(response.status).toBe(200);
  const profile = (await response.json()) as { userId: string };
  return { sub, sid, bearer, userId: profile.userId };
}
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? 'http://missing.invalid');
  if (
    url.hostname !== '127.0.0.1' ||
    !/^deckforge_test_[a-f0-9]{16}$/.test(
      process.env.DECKFORGE_DISPOSABLE_DB ?? '',
    ) ||
    url.pathname !== '/' + process.env.DECKFORGE_DISPOSABLE_DB
  )
    throw new Error('Owned disposable DB required');
  db = createDatabase(url.toString());
  keys = await generateKeyPair('ES256');
  const key = {
    ...(await exportJWK(keys.publicKey)),
    kid: 'starter-test',
    alg: 'ES256',
  };
  jwks = createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ keys: [key] }));
  });
  jwks.listen(0, '127.0.0.1');
  await once(jwks, 'listening');
  const address = jwks.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  issuer = `http://127.0.0.1:${address.port}/auth/v1`;
  auth = new AuthService(
    db,
    createTokenVerifier({
      issuer,
      audience: 'authenticated',
      jwksUrl: issuer + '/.well-known/jwks.json',
    }),
  );
  app = await createApp([], auth);
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
afterAll(async () => {
  await app?.close();
  if (jwks) await new Promise<void>((resolve) => jwks.close(() => resolve()));
  await db?.$disconnect();
});

async function mint(
  ownerId: string,
  face = 0,
  editionSerial?: number,
  templateId?: string,
  selectedSeries: string = seriesId,
) {
  const template = developmentCatalog.templates[face]!;
  return db.$transaction((tx) =>
    createCardWithOrigin(
      tx,
      {
        ownerId,
        templateId: templateId ?? template.id,
        seriesId: selectedSeries,
        faceId: template.faceId,
        ...(editionSerial === undefined ? {} : { editionSerial }),
      },
      {
        operatorId: 'test.archive',
        sourceKey: randomUUID(),
        reason: 'PRIVATE_ARCHIVE_REASON',
      },
    ),
  );
}
async function consume(
  ownerId: string,
  instanceId: string,
  action: 'FUSION_CONSUME' | 'REVOKE' = 'FUSION_CONSUME',
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${ownerId}::uuid FOR UPDATE`;
    return writeCardTransition(tx, {
      ownerId,
      instanceId,
      expectedVersion: 1,
      command: { action },
      operatorId: 'test.archive',
      sourceKey: randomUUID(),
      reason: 'PRIVATE_ARCHIVE_REASON',
    });
  });
}
describe('private album and retained ownership archive', () => {
  it('retains consumed/revoked instances, serials and original issuance without leaking private audit data', async () => {
    const owner = await actor(),
      other = await actor();
    const card = await mint(owner.userId, 0, 1900000011);
    const revoked = await mint(owner.userId, 1);
    const locked = await mint(owner.userId, 2);
    const foreign = await mint(other.userId);
    await consume(owner.userId, card.id);
    await consume(owner.userId, revoked.id, 'REVOKE');
    await db.$transaction((tx) =>
      writeCardTransition(tx, {
        ownerId: owner.userId,
        instanceId: locked.id,
        expectedVersion: 1,
        command: {
          action: 'LOCK',
          lockToken: randomUUID(),
          lockReason: 'TEST_ARCHIVE',
        },
        operatorId: 'test.archive',
        sourceKey: randomUUID(),
        reason: 'PRIVATE_ARCHIVE_REASON',
      }),
    );
    const client = createCollectionClient(base, async () => owner.bearer);
    const all = await client.archive();
    expect(all.items).toHaveLength(3);
    expect(all.items.some((item) => item.instanceId === foreign.id)).toBe(
      false,
    );
    expect(all.items.find((item) => item.instanceId === card.id)).toMatchObject(
      {
        editionSerial: 1900000011,
        holding: 'PREVIOUSLY_OWNED',
        status: 'CONSUMED',
        stateVersion: 2,
        origin: { eventId: card.originEventId, action: 'GRANT' },
      },
    );
    expect(
      (await client.archive('current')).items.map((item) => item.instanceId),
    ).toEqual([locked.id]);
    expect((await client.archive('former')).items).toHaveLength(2);
    const history = await client.history(card.id);
    expect(history.originEventId).toBe(card.originEventId);
    expect(history.events.map((event) => event.action)).toEqual([
      'GRANT',
      'FUSION_CONSUME',
    ]);
    expect(JSON.stringify(all)).not.toMatch(
      /ownerId|actorUserId|sourceKey|reason|lockToken|operatorId|PRIVATE_ARCHIVE_REASON/,
    );
    expect(
      (await db.cardInstance.findUniqueOrThrow({ where: { id: card.id } }))
        .originEventId,
    ).toBe(card.originEventId);
  });
  it('counts distinct series faces over more than 100 records and retains recorded completion after consumption', async () => {
    const owner = await actor();
    const ids: string[] = [];
    await db.$transaction(
      async (tx) => {
        for (let i = 0; i < 125; i++) {
          const template = developmentCatalog.templates[i % 52]!;
          const card = await createCardWithOrigin(
            tx,
            {
              ownerId: owner.userId,
              templateId: template.id,
              seriesId,
              faceId: template.faceId,
            },
            {
              operatorId: 'test.archive',
              sourceKey: randomUUID(),
              reason: 'ISOLATED_125_RECORD_FIXTURE',
            },
          );
          ids.push(card.id);
        }
      },
      { timeout: 15000 },
    );
    const client = createCollectionClient(base, async () => owner.bearer);
    expect((await client.album()).items[0]).toMatchObject({
      recordedInstances: 125,
      currentInstances: 125,
      recordedFaces: 52,
      currentFaces: 52,
      completeNow: true,
      completeRecorded: true,
    });
    for (const index of [0, 52, 104]) await consume(owner.userId, ids[index]!);
    expect((await client.album()).items[0]).toMatchObject({
      recordedInstances: 125,
      currentInstances: 122,
      recordedFaces: 52,
      currentFaces: 51,
      completeNow: false,
      completeRecorded: true,
    });
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.archive('all', cursor);
      seen.push(...page.items.map((item) => item.instanceId));
      cursor = page.nextCursor ?? undefined;
      expect(seen.length).toBeLessThanOrEqual(125);
    } while (cursor);
    expect([...new Set(seen)].sort()).toEqual(ids.sort());
    expect(
      await db.cardInstance.count({ where: { ownerId: owner.userId } }),
    ).toBe(125);
    expect(
      await db.ownershipEvent.count({
        where: { instance: { ownerId: owner.userId } },
      }),
    ).toBe(128);
  });
  it('paginates series independently and never exposes unheld catalog series or another owner totals', async () => {
    const owner = await actor();
    await mint(owner.userId);
    const expected: string[] = [seriesId];
    for (let i = 0; i < 2; i++) {
      const id = randomUUID();
      const series = await db.cardSeries.create({
        data: {
          id,
          slug: 'archive-fixture-' + id,
          displayName: 'Isolated archive fixture',
          rightsOwner: 'TEST_ONLY',
        },
      });
      const template = await db.cardTemplate.create({
        data: {
          seriesId: series.id,
          faceId: developmentCatalog.templates[0]!.faceId,
          playStyleFamily: 'BASE',
        },
      });
      await mint(owner.userId, 0, undefined, template.id, series.id);
      expected.push(series.id);
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const response = await request(
        'collection/album?limit=1' + (cursor ? '&cursor=' + cursor : ''),
        owner.bearer,
      );
      expect(response.status).toBe(200);
      const page = albumResponseSchema.parse(await response.json());
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.recordedInstances).toBe(1);
      seen.push(page.items[0]!.seriesId);
      cursor = page.nextCursor;
      expect(seen.length).toBeLessThanOrEqual(3);
    } while (cursor);
    expect(seen).toEqual(expected.sort());
    const filtered = archiveResponseSchema.parse(
      await (
        await request(
          'collection/archive?seriesId=' + expected[0],
          owner.bearer,
        )
      ).json(),
    );
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]?.seriesId).toBe(expected[0]);
  });
  it('rejects unknown filters and all unauthenticated/revoked access without writes', async () => {
    const owner = await actor();
    await mint(owner.userId);
    for (const path of ['collection/archive', 'collection/album']) {
      expect((await request(path)).status).toBe(401);
      expect(
        (await request(path + '?ownerId=' + owner.userId, owner.bearer)).status,
      ).toBe(400);
      expect((await request(path + '?limit=101', owner.bearer)).status).toBe(
        400,
      );
    }
    expect(
      (await request('collection/archive?view=deleted', owner.bearer)).status,
    ).toBe(400);
    expect(
      (await request('collection/archive?seriesId=invalid', owner.bearer))
        .status,
    ).toBe(400);
    await auth.logout(await auth.authenticate('Bearer ' + owner.bearer));
    for (const path of ['collection/archive', 'collection/album'])
      expect((await request(path, owner.bearer)).status).toBe(401);
  });
});
