import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createDatabase, type PrismaClient } from '@deckforge/database';
import { developmentCatalog } from '@deckforge/card-domain';
import { starterGrantResponseSchema } from '@deckforge/contracts';
import { createApp } from './app';
import { AuthService } from './auth/service';
import { createTokenVerifier } from './auth/token-verifier';
import { StarterService } from './starter';
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
function command(key = randomUUID(), series: string = seriesId) {
  return { seriesId: series, idempotencyKey: key };
}
async function approve(eligible = true) {
  await db.designAsset.updateMany({
    data: {
      useScope: 'COMMERCIAL',
      approvalReference: 'TEST_ONLY_STARTER_APPROVAL',
    },
  });
  await db.cardSeries.update({
    where: { id: seriesId },
    data: { status: 'PUBLISHED', starterEligible: eligible },
  });
}
async function draft() {
  await db.cardSeries.update({
    where: { id: seriesId },
    data: { status: 'DRAFT', starterEligible: false },
  });
  await db.designAsset.updateMany({
    data: { useScope: 'INTERNAL_PREVIEW', approvalReference: null },
  });
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
  if (db) await draft();
  await app?.close();
  if (jwks) await new Promise<void>((resolve) => jwks.close(() => resolve()));
  await db?.$disconnect();
});
describe('starter grant transaction and authorization', () => {
  it('rejects unauthenticated commands and caller-selected ownership or card data', async () => {
    expect((await request('cards/starter', undefined, command())).status).toBe(
      401,
    );
    const user = await actor();
    for (const extra of [{ userId: randomUUID() }, { cards: [] }, { level: 6 }])
      expect(
        (
          await request('cards/starter', user.bearer, {
            ...command(),
            ...extra,
          })
        ).status,
      ).toBe(400);
    expect(
      await db.starterGrant.count({ where: { userId: user.userId } }),
    ).toBe(0);
  });
  it('does not grant draft, unapproved or non-starter series', async () => {
    const user = await actor();
    expect(
      (await request('cards/starter', user.bearer, command())).status,
    ).toBe(409);
    await db.cardSeries.update({
      where: { id: seriesId },
      data: { status: 'PUBLISHED', starterEligible: true },
    });
    expect(
      (await request('cards/starter', user.bearer, command())).status,
    ).toBe(503);
    await approve(false);
    expect(
      (await request('cards/starter', user.bearer, command())).status,
    ).toBe(409);
    expect(
      await db.cardInstance.count({ where: { ownerId: user.userId } }),
    ).toBe(0);
    await approve();
  });
  it('serializes ten simultaneous mixed-key requests into 52 exact faces and one grant/operation', async () => {
    const user = await actor();
    const key = randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        request(
          'cards/starter',
          user.bearer,
          command(i < 5 ? key : randomUUID()),
        ),
      ),
    );
    expect(responses.map((r) => r.status)).toEqual(Array(10).fill(200));
    const results = await Promise.all(
      responses.map(async (r) =>
        starterGrantResponseSchema.parse(await r.json()),
      ),
    );
    for (const result of results) expect(result).toEqual(results[0]);
    const result = results[0]!;
    const cards = await db.cardInstance.findMany({
      where: { ownerId: user.userId },
    });
    expect(cards).toHaveLength(52);
    expect(new Set(cards.map((c) => c.id)).size).toBe(52);
    expect(cards.map((c) => c.faceId).sort()).toEqual(
      developmentCatalog.templates.map((t) => t.faceId).sort(),
    );
    expect(
      cards.every(
        (c) =>
          c.level === 1 &&
          c.branch === 'BLUE' &&
          c.rarity === 'COMMON' &&
          c.status === 'OWNED' &&
          c.starterGrantId === result.grantId,
      ),
    ).toBe(true);
    expect(
      await db.starterGrant.count({ where: { userId: user.userId } }),
    ).toBe(1);
    expect(
      await db.operationRecord.count({
        where: { userId: user.userId, operation: 'cards.starter' },
      }),
    ).toBe(1);
    expect(
      await db.ownershipEvent.count({
        where: { actorUserId: user.userId, action: 'GRANT' },
      }),
    ).toBe(52);
    expect(
      (await request('cards/starter', user.bearer, command(key, randomUUID())))
        .status,
    ).toBe(409);
    // Replays remain the immutable original grant even after catalog retirement or card evolution.
    await db.cardInstance.update({
      where: { id: cards[0]!.id },
      data: { level: 3, stateVersion: 2 },
    });
    await draft();
    const replay = await request('cards/starter', user.bearer, command());
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(result);
    await approve();
    const permanent = await token(user.sub, user.sid, false);
    expect(
      (
        await request('auth/guest-link', permanent, {
          expectedUserId: user.userId,
          idempotencyKey: randomUUID(),
        })
      ).status,
    ).toBe(200);
    expect(
      (await request('cards/starter', user.bearer, command())).status,
    ).toBe(401);
    expect(
      await (await request('cards/starter', permanent, command())).json(),
    ).toEqual(result);
  });
  it('grants different accounts separate UUIDs and isolates private inventory', async () => {
    const a = await actor(),
      b = await actor();
    const ra = starterGrantResponseSchema.parse(
      await (await request('cards/starter', a.bearer, command())).json(),
    );
    const rb = starterGrantResponseSchema.parse(
      await (await request('cards/starter', b.bearer, command())).json(),
    );
    expect(ra.grantId).not.toBe(rb.grantId);
    expect(
      ra.cards.some((c) =>
        rb.cards.some((other) => other.instanceId === c.instanceId),
      ),
    ).toBe(false);
    const inventory = (await (
      await request('cards?limit=100', a.bearer)
    ).json()) as { items: { instanceId: string }[] };
    expect(inventory.items.map((c) => c.instanceId).sort()).toEqual(
      ra.cards.map((c) => c.instanceId).sort(),
    );
  });
  it('rolls back all cards and the grant if writing provenance fails, then retries the same key', async () => {
    const user = await actor();
    const input = command();
    // Test-only DB fault, removed in finally. No runtime fault-injection option exists.
    await db.$executeRawUnsafe(
      `CREATE FUNCTION fail_starter_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test fault'; END; $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER fail_starter_test BEFORE INSERT ON "OwnershipEvent" FOR EACH ROW EXECUTE FUNCTION fail_starter_test()`,
    );
    try {
      expect((await request('cards/starter', user.bearer, input)).status).toBe(
        503,
      );
      expect(
        await db.cardInstance.count({ where: { ownerId: user.userId } }),
      ).toBe(0);
      expect(
        await db.starterGrant.count({ where: { userId: user.userId } }),
      ).toBe(0);
      expect(
        await db.operationRecord.count({
          where: { userId: user.userId, operation: 'cards.starter' },
        }),
      ).toBe(0);
    } finally {
      await db.$executeRawUnsafe(
        'DROP TRIGGER fail_starter_test ON "OwnershipEvent"',
      );
      await db.$executeRawUnsafe('DROP FUNCTION fail_starter_test()');
    }
    expect((await request('cards/starter', user.bearer, input)).status).toBe(
      200,
    );
  });
  it('rechecks revoked or suspended access inside the transaction', async () => {
    const user = await actor();
    const principal = await auth.authenticate('Bearer ' + user.bearer);
    await auth.logout(principal);
    const service = new StarterService(auth);
    await expect(
      service.grantStarterDeck(principal, command()),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    const other = await actor();
    const active = await auth.authenticate('Bearer ' + other.bearer);
    await db.user.update({
      where: { id: other.userId },
      data: { status: 'SUSPENDED' },
    });
    await expect(
      service.grantStarterDeck(active, command()),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
  it('orders concurrent logout and grant without partial effects or deadlocks', async () => {
    const user = await actor();
    const principal = await auth.authenticate('Bearer ' + user.bearer);
    const service = new StarterService(auth);
    const [grant, logout] = await Promise.allSettled([
      service.grantStarterDeck(principal, command()),
      auth.logout(principal),
    ]);
    expect(logout.status).toBe('fulfilled');
    if (grant.status === 'rejected')
      expect(grant.reason).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(
      await db.starterGrant.count({ where: { userId: user.userId } }),
    ).toBe(grant.status === 'fulfilled' ? 1 : 0);
    expect(
      await db.cardInstance.count({ where: { ownerId: user.userId } }),
    ).toBe(grant.status === 'fulfilled' ? 52 : 0);
    expect(
      (await request('cards/starter', user.bearer, command())).status,
    ).toBe(401);
  });
  it('limits authenticated retries even when the series is unavailable', async () => {
    const user = await actor();
    const principal = await auth.authenticate('Bearer ' + user.bearer);
    const service = new StarterService(auth);
    for (let i = 0; i < 20; i++)
      await expect(
        service.grantStarterDeck(
          principal,
          command(randomUUID(), randomUUID()),
        ),
      ).rejects.toMatchObject({ code: 'STARTER_UNAVAILABLE' });
    await expect(
      service.grantStarterDeck(principal, command()),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(
      await db.starterGrant.count({ where: { userId: user.userId } }),
    ).toBe(0);
  });
  it('rejects non-base rarity templates without minting', async () => {
    const user = await actor();
    await db.cardTemplate.createMany({
      data: developmentCatalog.templates.map((template, index) => ({
        id: randomUUID(),
        seriesId,
        faceId: template.faceId,
        version: 2,
        frontAssetId: template.frontAssetId,
        backAssetId: template.backAssetId,
        rarity: index === 0 ? 'RARE' : 'COMMON',
        playStyleFamily: template.playStyleFamily,
      })),
    });
    await db.cardSeries.update({
      where: { id: seriesId },
      data: { manifestVersion: 2 },
    });
    try {
      expect(
        (await request('cards/starter', user.bearer, command())).status,
      ).toBe(409);
      expect(
        await db.cardInstance.count({ where: { ownerId: user.userId } }),
      ).toBe(0);
    } finally {
      await db.cardSeries.update({
        where: { id: seriesId },
        data: { manifestVersion: 1 },
      });
    }
  });
  it('enforces immutable origin, append-only grants and deferred completeness in PostgreSQL', async () => {
    const user = await db.user.create({ data: {} });
    const id = randomUUID();
    await expect(
      db.starterGrant.create({
        data: {
          id,
          userId: user.id,
          seriesId,
          manifestVersion: 1,
          result: {
            grantId: id,
            seriesId,
            cards: Array.from({ length: 52 }, () => ({
              instanceId: randomUUID(),
              faceId: 'A-S',
            })),
          },
        },
      }),
    ).rejects.toThrow();
    const grant = await db.starterGrant.findFirstOrThrow();
    await expect(
      db.starterGrant.delete({ where: { id: grant.id } }),
    ).rejects.toThrow();
    await expect(
      db.starterGrant.update({
        where: { id: grant.id },
        data: { manifestVersion: 2 },
      }),
    ).rejects.toThrow();
    const card = await db.cardInstance.findFirstOrThrow({
      where: { starterGrantId: grant.id },
    });
    await expect(
      db.cardInstance.update({
        where: { id: card.id },
        data: { starterGrantId: null, stateVersion: card.stateVersion + 1 },
      }),
    ).rejects.toThrow();
  });
});
