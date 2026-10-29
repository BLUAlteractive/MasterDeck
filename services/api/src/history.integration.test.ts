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
  cardSnapshot,
  type PrismaClient,
} from '@deckforge/database';
import {
  developmentCatalog,
  type CardTransition,
} from '@deckforge/card-domain';
import { cardHistoryResponseSchema } from '@deckforge/contracts';
import { createApp } from './app';
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
async function mint(ownerId: string, action: 'MINT' | 'GRANT' = 'MINT') {
  const template = developmentCatalog.templates[0]!;
  return db.$transaction((tx) =>
    createCardWithOrigin(
      tx,
      { ownerId, templateId: template.id, seriesId, faceId: template.faceId },
      {
        actorUserId: ownerId,
        operatorId: 'test.history',
        sourceKey: randomUUID(),
        reason: 'PRIVATE_FIXTURE_REASON',
        action,
      },
    ),
  );
}
async function transition(
  ownerId: string,
  instanceId: string,
  expectedVersion: number,
  command: CardTransition,
  sourceKey: string = randomUUID(),
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${ownerId}::uuid FOR UPDATE`;
    return writeCardTransition(tx, {
      ownerId,
      instanceId,
      expectedVersion,
      command,
      operatorId: 'test.history',
      sourceKey,
      reason: 'PRIVATE_FIXTURE_REASON',
    });
  });
}
describe('owner history, lifecycle concurrency and database audit invariants', () => {
  it('exposes mint origins only to the owner, with bounded strict queries', async () => {
    const owner = await actor(),
      other = await actor();
    const card = await mint(owner.userId);
    expect((await request(`cards/${card.id}/provenance`)).status).toBe(401);
    expect(
      (await request(`cards/${card.id}/provenance`, other.bearer)).status,
    ).toBe(404);
    expect(
      (await request(`cards/${randomUUID()}/provenance`, other.bearer)).status,
    ).toBe(404);
    for (const suffix of [
      '?limit=101',
      '?afterVersion=-1',
      '?ownerId=' + other.userId,
    ])
      expect(
        (await request(`cards/${card.id}/provenance` + suffix, owner.bearer))
          .status,
      ).toBe(400);
    const response = await request(`cards/${card.id}/provenance`, owner.bearer);
    expect(response.status).toBe(200);
    const body = cardHistoryResponseSchema.parse(await response.json());
    expect(body.originEventId).toBe(card.originEventId);
    expect(body.events[0]).toMatchObject({
      action: 'MINT',
      stateVersion: 1,
      actor: 'SELF',
    });
    expect(JSON.stringify(body)).not.toMatch(
      /operatorId|sourceKey|PRIVATE_FIXTURE_REASON|ownerId|lockToken|test.history/,
    );
  });
  it('paginates retained mint/lock/unlock/consume history after removal from active inventory', async () => {
    const owner = await actor();
    const card = await mint(owner.userId);
    const token = randomUUID();
    await transition(owner.userId, card.id, 1, {
      action: 'LOCK',
      lockToken: token,
      lockReason: 'TEST_MATCH',
    });
    await expect(
      transition(owner.userId, card.id, 2, { action: 'FUSION_CONSUME' }),
    ).rejects.toMatchObject({ code: 'INVALID_CARD_TRANSITION' });
    await expect(
      transition(owner.userId, card.id, 2, {
        action: 'UNLOCK',
        lockToken: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CARD_TRANSITION' });
    await transition(owner.userId, card.id, 2, {
      action: 'UNLOCK',
      lockToken: token,
    });
    await transition(owner.userId, card.id, 3, { action: 'FUSION_CONSUME' });
    const first = cardHistoryResponseSchema.parse(
      await (
        await request(`cards/${card.id}/provenance?limit=2`, owner.bearer)
      ).json(),
    );
    expect(first.currentStatus).toBe('CONSUMED');
    expect(first.events.map((e) => e.action)).toEqual(['MINT', 'LOCK']);
    expect(first.nextVersion).toBe(2);
    const next = cardHistoryResponseSchema.parse(
      await (
        await request(
          `cards/${card.id}/provenance?limit=2&afterVersion=2`,
          owner.bearer,
        )
      ).json(),
    );
    expect(next.events.map((e) => e.action)).toEqual([
      'UNLOCK',
      'FUSION_CONSUME',
    ]);
    expect(next.nextVersion).toBeNull();
    expect(next.events.every((e) => e.actor === 'SYSTEM')).toBe(true);
    const inventory = (await (
      await request('cards?limit=100', owner.bearer)
    ).json()) as { items: { instanceId: string }[] };
    expect(inventory.items.some((c) => c.instanceId === card.id)).toBe(false);
    const rows = await db.ownershipEvent.findMany({
      where: { instanceId: card.id },
      orderBy: { stateVersion: 'asc' },
    });
    expect(rows.map((e) => e.stateVersion)).toEqual([1, 2, 3, 4]);
    expect(rows.every((e) => e.operatorId === 'test.history')).toBe(true);
    expect(
      (await db.cardInstance.findUniqueOrThrow({ where: { id: card.id } }))
        .originEventId,
    ).toBe(card.originEventId);
    await expect(
      transition(owner.userId, card.id, 4, {
        action: 'LOCK',
        lockToken: token,
        lockReason: 'TEST_MATCH',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CARD_TRANSITION' });
  });
  it('permits one of ten competing transitions and keeps versions/events contiguous', async () => {
    const owner = await actor();
    const card = await mint(owner.userId, 'GRANT');
    const outcomes = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        transition(owner.userId, card.id, 1, {
          action: 'LOCK',
          lockToken: randomUUID(),
          lockReason: 'TEST_MATCH',
        }),
      ),
    );
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    for (const outcome of outcomes)
      if (outcome.status === 'rejected')
        expect(outcome.reason).toMatchObject({ code: 'STALE_CARD' });
    expect(
      await db.ownershipEvent.count({ where: { instanceId: card.id } }),
    ).toBe(2);
    expect(
      (await db.cardInstance.findUniqueOrThrow({ where: { id: card.id } }))
        .stateVersion,
    ).toBe(2);
  });
  it('rolls state back when an audit source collides and forbids writes without matching events', async () => {
    const owner = await actor();
    const card = await mint(owner.userId);
    const origin = await db.ownershipEvent.findUniqueOrThrow({
      where: { id: card.originEventId! },
    });
    await expect(
      transition(
        owner.userId,
        card.id,
        1,
        { action: 'REVOKE' },
        origin.sourceKey,
      ),
    ).rejects.toThrow();
    expect(
      (await db.cardInstance.findUniqueOrThrow({ where: { id: card.id } }))
        .status,
    ).toBe('OWNED');
    await expect(
      db.cardInstance.update({
        where: { id: card.id },
        data: { status: 'CONSUMED', stateVersion: 2 },
      }),
    ).rejects.toThrow();
    await expect(
      db.ownershipEvent.create({
        data: {
          instanceId: card.id,
          operatorId: 'test.history',
          action: 'LOCK',
          sourceKey: randomUUID(),
          reason: 'INVALID_FUTURE',
          stateVersion: 2,
          snapshot: cardSnapshot(card),
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.ownershipEvent.delete({ where: { id: origin.id } }),
    ).rejects.toThrow();
    await expect(
      db.ownershipEvent.update({
        where: { id: origin.id },
        data: { operatorId: 'rewrite' },
      }),
    ).rejects.toThrow();
  });
  it('requires a same-instance origin and prevents identity and terminal-state rewrites', async () => {
    const owner = await actor();
    const card = await mint(owner.userId);
    const other = await mint(owner.userId);
    const data = {
      ownerId: owner.userId,
      templateId: card.templateId,
      seriesId,
      faceId: card.faceId,
    };
    await expect(db.cardInstance.create({ data })).rejects.toThrow();
    await expect(
      db.cardInstance.create({
        data: { ...data, originEventId: other.originEventId },
      }),
    ).rejects.toThrow();
    await expect(
      db.cardInstance.update({
        where: { id: card.id },
        data: { originEventId: other.originEventId, stateVersion: 2 },
      }),
    ).rejects.toThrow();
    await transition(owner.userId, card.id, 1, { action: 'REVOKE' });
    await expect(
      db.cardInstance.update({
        where: { id: card.id },
        data: { status: 'OWNED', stateVersion: 3 },
      }),
    ).rejects.toThrow();
    expect(
      (await request(`cards/${card.id}/provenance`, owner.bearer)).status,
    ).toBe(200);
    expect(
      (
        await request(`cards/${card.id}/status`, owner.bearer, {
          status: 'OWNED',
        })
      ).status,
    ).toBe(404);
  });
});
