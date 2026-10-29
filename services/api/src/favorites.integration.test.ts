import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import {
  createDatabase,
  createCardWithOrigin,
  type PrismaClient,
} from '@deckforge/database';
import { developmentCatalog } from '@deckforge/card-domain';
import {
  privateCardsSchema,
  favoriteResponseSchema,
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

async function mint(ownerId: string) {
  const template = developmentCatalog.templates[0]!;
  return db.$transaction((tx) =>
    createCardWithOrigin(
      tx,
      { ownerId, templateId: template.id, seriesId, faceId: template.faceId },
      {
        operatorId: 'test.gallery',
        actorUserId: ownerId,
        sourceKey: randomUUID(),
        reason: 'ISOLATED_GALLERY_FIXTURE',
      },
    ),
  );
}
async function favorite(id: string, bearer: string | undefined, body: unknown) {
  return fetch(base + '/v1/cards/' + id + '/favorite', {
    method: 'PUT',
    headers: {
      ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}
describe('gallery metadata and non-functional favorite preferences', () => {
  it('returns owner-only series/version/status/favorite metadata without private provenance', async () => {
    const owner = await actor();
    const card = await mint(owner.userId);
    const page = privateCardsSchema.parse(
      await (await request('cards', owner.bearer)).json(),
    );
    expect(page.items[0]).toMatchObject({
      instanceId: card.id,
      seriesId,
      seriesName: expect.any(String),
      templateVersion: 1,
      status: 'OWNED',
      favorite: false,
    });
    expect(JSON.stringify(page)).not.toMatch(
      /operatorId|sourceKey|reason|ownerId|lockToken/,
    );
  });
  it('persists repeated/concurrent preferences exactly once without mutating cards or origin events', async () => {
    const owner = await actor();
    const card = await mint(owner.userId);
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        favorite(card.id, owner.bearer, { favorite: true }),
      ),
    );
    expect(responses.every((response) => response.status === 200)).toBe(true);
    for (const response of responses)
      expect(favoriteResponseSchema.parse(await response.json())).toEqual({
        instanceId: card.id,
        favorite: true,
      });
    expect(
      await db.cardFavorite.count({
        where: { userId: owner.userId, instanceId: card.id },
      }),
    ).toBe(1);
    expect(
      await db.cardInstance.findUniqueOrThrow({ where: { id: card.id } }),
    ).toEqual(card);
    expect(
      await db.ownershipEvent.count({ where: { instanceId: card.id } }),
    ).toBe(1);
    expect(
      privateCardsSchema.parse(
        await (await request('cards', owner.bearer)).json(),
      ).items[0]?.favorite,
    ).toBe(true);
    expect(
      (await favorite(card.id, owner.bearer, { favorite: false })).status,
    ).toBe(200);
    expect(
      (
        await db.cardFavorite.findUniqueOrThrow({
          where: {
            userId_instanceId: { userId: owner.userId, instanceId: card.id },
          },
        })
      ).favorite,
    ).toBe(false);
  });
  it('drives inventory, favorites, history and equip through the actual mobile API adapter', async () => {
    const owner = await actor();
    await db.$transaction(
      async (tx) => {
        for (const template of developmentCatalog.templates)
          await createCardWithOrigin(
            tx,
            {
              ownerId: owner.userId,
              templateId: template.id,
              seriesId,
              faceId: template.faceId,
            },
            {
              operatorId: 'test.gallery',
              actorUserId: owner.userId,
              sourceKey: randomUUID(),
              reason: 'CLIENT_ROUNDTRIP_FIXTURE',
            },
          );
      },
      { timeout: 15000 },
    );
    const client = createCollectionClient(base, async () => owner.bearer);
    expect((await client.bootstrap()).userId).toBe(owner.userId);
    const page = await client.list();
    expect(page.items).toHaveLength(52);
    const first = page.items[0]!;
    expect(await client.favorite(first.instanceId, true)).toEqual({
      instanceId: first.instanceId,
      favorite: true,
    });
    expect((await client.history(first.instanceId)).events).toHaveLength(1);
    expect((await client.currentLoadout()).loadout).toBeNull();
    const command = {
      id: randomUUID(),
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
      faceToInstanceIds: Object.fromEntries(
        page.items.map((card) => [card.faceId, card.instanceId]),
      ),
    };
    const receipt = await client.equip(command);
    expect(receipt.version).toBe(1);
    expect(await client.equip(command)).toEqual(receipt);
    expect((await client.currentLoadout()).loadout?.validation.valid).toBe(
      true,
    );
  });
  it('rejects anonymous, foreign, revoked and attributed preference writes and enforces owner FK', async () => {
    const owner = await actor(),
      other = await actor();
    const card = await mint(owner.userId);
    expect(
      (await favorite(card.id, undefined, { favorite: true })).status,
    ).toBe(401);
    expect(
      (await favorite(card.id, other.bearer, { favorite: true })).status,
    ).toBe(404);
    expect(
      (
        await favorite(card.id, owner.bearer, {
          favorite: true,
          userId: other.userId,
        })
      ).status,
    ).toBe(400);
    await expect(
      db.cardFavorite.create({
        data: { userId: other.userId, instanceId: card.id, favorite: true },
      }),
    ).rejects.toThrow();
    await auth.logout(await auth.authenticate('Bearer ' + owner.bearer));
    expect(
      (await favorite(card.id, owner.bearer, { favorite: true })).status,
    ).toBe(401);
  });
});
