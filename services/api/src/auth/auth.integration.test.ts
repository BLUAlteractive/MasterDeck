import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  profileSchema,
  privateCardsSchema,
  apiErrorSchema,
  deletionResponseSchema,
} from '@deckforge/contracts';
import { io, type Socket } from 'socket.io-client';
import {
  createDatabase,
  createCardWithOrigin,
  type PrismaClient,
} from '@deckforge/database';
import { createApp } from '../app';
import { AuthService } from './service';
import { createTokenVerifier } from './token-verifier';

// Resolve JOSE from the API's declared dependencies; signing keys exist only in this test process.
const apiRequire = createRequire(
  fileURLToPath(new URL('../../package.json', import.meta.url)),
);
const { generateKeyPair, exportJWK, SignJWT } = (await import(
  apiRequire.resolve('jose')
)) as typeof import('jose');
let database: PrismaClient;
let app: Awaited<ReturnType<typeof createApp>>;
let jwksServer: Server;
let base: string;
let issuer: string;
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let secondKeys: Awaited<ReturnType<typeof generateKeyPair>>;
const sockets: Socket[] = [];
function socketEvent(client: Socket, event: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Socket event timeout')),
      5000,
    );
    client.once(event, (value: unknown) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}
async function token(
  sub = randomUUID(),
  session = randomUUID(),
  overrides: Record<string, unknown> = {},
  second = false,
) {
  return new SignJWT({
    session_id: session,
    is_anonymous: true,
    role: 'authenticated',
    aal: 'aal1',
    ...overrides,
  })
    .setProtectedHeader({ alg: 'ES256', kid: second ? 'second' : 'first' })
    .setSubject(sub)
    .setIssuer(issuer)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('2m')
    .sign((second ? secondKeys : keys).privateKey);
}
async function request(path: string, bearer?: string, body?: unknown) {
  return fetch(`${base}/v1/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function session(
  anonymous = true,
  overrides: Record<string, unknown> = {},
) {
  const sub = randomUUID();
  const sid = randomUUID();
  const bearer = await token(sub, sid, {
    is_anonymous: anonymous,
    ...overrides,
  });
  const response = await request('auth/session', bearer, {});
  expect(response.status).toBe(200);
  const profile = (await response.json()) as {
    userId: string;
    isGuest: boolean;
    role: string;
  };
  return { sub, sid, bearer, profile };
}
async function card(ownerId: string) {
  const template = await database.cardTemplate.upsert({
    where: {
      seriesId_faceId_version: {
        seriesId: '11111111-1111-4111-8111-111111111111',
        faceId: 'Q-H',
        version: 999,
      },
    },
    create: {
      seriesId: '11111111-1111-4111-8111-111111111111',
      faceId: 'Q-H',
      playStyleFamily: 'auth-fixture',
      version: 999,
    },
    update: {},
  });
  return database.$transaction((tx) =>
    createCardWithOrigin(
      tx,
      {
        ownerId,
        templateId: template.id,
        seriesId: template.seriesId,
        faceId: template.faceId,
      },
      {
        operatorId: 'test.auth',
        actorUserId: ownerId,
        sourceKey: randomUUID(),
        reason: 'AUTH_FIXTURE',
      },
    ),
  );
}
function socket(bearer?: string) {
  const client = io(`${base}/rooms`, {
    transports: ['websocket'],
    reconnection: false,
    autoConnect: false,
    auth: bearer ? { token: bearer } : {},
  });
  sockets.push(client);
  return client;
}
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? 'http://missing.invalid');
  if (
    url.hostname !== '127.0.0.1' ||
    !/^deckforge_test_[a-f0-9]{16}$/.test(
      process.env.DECKFORGE_DISPOSABLE_DB ?? '',
    ) ||
    url.pathname !== `/${process.env.DECKFORGE_DISPOSABLE_DB}`
  )
    throw new Error('Disposable DB required.');
  database = createDatabase(url.toString());
  keys = await generateKeyPair('ES256');
  secondKeys = await generateKeyPair('ES256');
  const publicKeys = [
    { ...(await exportJWK(keys.publicKey)), kid: 'first', alg: 'ES256' },
    { ...(await exportJWK(secondKeys.publicKey)), kid: 'second', alg: 'ES256' },
  ];
  jwksServer = createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ keys: publicKeys }));
  });
  jwksServer.listen(0, '127.0.0.1');
  await once(jwksServer, 'listening');
  const address = jwksServer.address();
  if (!address || typeof address === 'string') throw new Error('No JWKS port');
  issuer = `http://127.0.0.1:${address.port}/auth/v1`;
  const auth = new AuthService(
    database,
    createTokenVerifier({
      issuer,
      audience: 'authenticated',
      jwksUrl: `${issuer}/.well-known/jwks.json`,
    }),
  );
  app = await createApp(['http://localhost:8081'], auth);
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
afterAll(async () => {
  for (const client of sockets) client.disconnect();
  await app?.close();
  if (jwksServer)
    await new Promise<void>((resolve) => jwksServer.close(() => resolve()));
  await database?.$disconnect();
});

describe('signed identity and authorization over HTTP and sockets', () => {
  it('rejects unauthenticated private API and socket connections without private detail', async () => {
    const response = await request('me');
    expect(response.status).toBe(401);
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(Object.keys(body.error).sort()).toEqual([
      'code',
      'message',
      'requestId',
    ]);
    const client = socket();
    const failed = socketEvent(client, 'connect_error');
    client.connect();
    expect(await failed).toMatchObject({ message: 'UNAUTHORIZED' });
  });

  it('rejects expired, wrong-issuer, wrong-audience, service-role and tampered tokens', async () => {
    const now = Math.floor(Date.now() / 1000);
    const expired = await new SignJWT({
      session_id: randomUUID(),
      is_anonymous: true,
      role: 'authenticated',
      aal: 'aal1',
    })
      .setProtectedHeader({ alg: 'ES256', kid: 'first' })
      .setSubject(randomUUID())
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setIssuedAt(now - 120)
      .setExpirationTime(now - 1)
      .sign(keys.privateKey);
    const wrongIssuer = await new SignJWT({
      session_id: randomUUID(),
      is_anonymous: true,
      role: 'authenticated',
      aal: 'aal1',
    })
      .setProtectedHeader({ alg: 'ES256', kid: 'first' })
      .setSubject(randomUUID())
      .setIssuer('https://wrong.example.invalid')
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('2m')
      .sign(keys.privateKey);
    const wrongAudience = await new SignJWT({
      session_id: randomUUID(),
      is_anonymous: true,
      role: 'authenticated',
      aal: 'aal1',
    })
      .setProtectedHeader({ alg: 'ES256', kid: 'first' })
      .setSubject(randomUUID())
      .setIssuer(issuer)
      .setAudience('wrong')
      .setIssuedAt()
      .setExpirationTime('2m')
      .sign(keys.privateKey);
    const expiredSocket = socket(expired);
    const rejected = socketEvent(expiredSocket, 'connect_error');
    expiredSocket.connect();
    expect(await rejected).toMatchObject({ message: 'UNAUTHORIZED' });
    const valid = await token();
    const pieces = valid.split('.');
    pieces[2] = (pieces[2]?.startsWith('A') ? 'B' : 'A') + pieces[2]!.slice(1);
    for (const invalid of [
      expired,
      wrongIssuer,
      wrongAudience,
      await token(undefined, undefined, { role: 'service_role' }),
      pieces.join('.'),
    ]) {
      expect((await request('auth/session', invalid, {})).status).toBe(401);
    }
  });

  it('provisions a single internal guest during concurrent requests and accepts a rollover key', async () => {
    const sub = randomUUID();
    const sid = randomUUID();
    const bearer = await token(sub, sid, {}, true);
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => request('auth/session', bearer, {})),
    );
    expect(responses.map((response) => response.status)).toEqual([
      200, 200, 200, 200, 200,
    ]);
    const profiles = await Promise.all(
      responses.map(async (response) =>
        profileSchema.parse(await response.json()),
      ),
    );
    expect(new Set(profiles.map((profile) => profile.userId)).size).toBe(1);
    expect(profiles[0]).toMatchObject({ isGuest: true, role: 'PLAYER' });
    expect(
      await database.externalIdentity.count({
        where: { issuer, subject: sub },
      }),
    ).toBe(1);
  });

  it('restricts inventory to its verified owner and rejects an owner override', async () => {
    const a = await session();
    const b = await session();
    const aCard = await card(a.profile.userId);
    const bCard = await card(b.profile.userId);
    const itemsA = privateCardsSchema.parse(
      await (await request('cards', a.bearer)).json(),
    ).items;
    const itemsB = privateCardsSchema.parse(
      await (await request('cards', b.bearer)).json(),
    ).items;
    expect(
      itemsA.map((item: { instanceId: string }) => item.instanceId),
    ).toEqual([aCard.id]);
    expect(
      itemsB.map((item: { instanceId: string }) => item.instanceId),
    ).toEqual([bCard.id]);
    expect(
      (await request(`cards?owner=${b.profile.userId}`, a.bearer)).status,
    ).toBe(400);
    expect(JSON.stringify(itemsA)).not.toContain(b.profile.userId);
  });

  it('links only the same subject/internal user and preserves exact inventory under retries', async () => {
    const guest = await session();
    const owned = await card(guest.profile.userId);
    const permanent = await token(guest.sub, guest.sid, {
      is_anonymous: false,
    });
    const body = {
      expectedUserId: guest.profile.userId,
      idempotencyKey: 'link-fixture-key-001',
    };
    const replies = await Promise.all(
      Array.from({ length: 3 }, () =>
        request('auth/guest-link', permanent, body),
      ),
    );
    expect(replies.map((reply) => reply.status)).toEqual([200, 200, 200]);
    for (const reply of replies)
      expect(await reply.json()).toMatchObject({
        userId: guest.profile.userId,
        isGuest: false,
      });
    expect(
      privateCardsSchema
        .parse(await (await request('cards', permanent)).json())
        .items.map((item: { instanceId: string }) => item.instanceId),
    ).toEqual([owned.id]);
    expect(
      await database.cardInstance.count({
        where: { ownerId: guest.profile.userId },
      }),
    ).toBe(1);
    expect(
      await database.authAudit.count({
        where: { userId: guest.profile.userId, event: 'GUEST_LINKED' },
      }),
    ).toBe(1);
    expect((await request('me', guest.bearer)).status).toBe(401);
    expect(
      (
        await request('auth/guest-link', permanent, {
          ...body,
          expectedUserId: randomUUID(),
        })
      ).status,
    ).toBe(409);
  });

  it('ignores client admin metadata and requires a server role plus MFA', async () => {
    const user = await session(false, {
      user_metadata: { role: 'ADMIN' },
      app_metadata: { role: 'ADMIN' },
    });
    expect((await request('admin/access', user.bearer)).status).toBe(403);
    await database.user.update({
      where: { id: user.profile.userId },
      data: { role: 'ADMIN' },
    });
    expect((await request('admin/access', user.bearer)).status).toBe(403);
    const mfa = await token(user.sub, user.sid, {
      is_anonymous: false,
      aal: 'aal2',
    });
    expect((await request('admin/access', mfa)).status).toBe(200);
  });

  it('revokes local sessions durably and refuses session resurrection', async () => {
    const user = await session();
    expect((await request('auth/logout', user.bearer, {})).status).toBe(200);
    expect((await request('me', user.bearer)).status).toBe(401);
    expect((await request('auth/session', user.bearer, {})).status).toBe(401);
    const identity = await database.externalIdentity.findUniqueOrThrow({
      where: { issuer_subject: { issuer, subject: user.sub } },
    });
    const stored = await database.authSession.findUniqueOrThrow({
      where: {
        identityId_providerSessionId: {
          identityId: identity.id,
          providerSessionId: user.sid,
        },
      },
    });
    await expect(
      database.authSession.update({
        where: { id: stored.id },
        data: { revokedAt: null },
      }),
    ).rejects.toThrow();
  });

  it('denies room actions and rechecks revocation on an already connected socket', async () => {
    const user = await session();
    const client = socket(user.bearer);
    const connected = socketEvent(client, 'connect');
    client.connect();
    await connected;
    expect(
      await client
        .timeout(2000)
        .emitWithAck('room.join', { gameId: randomUUID() }),
    ).toEqual({ error: { code: 'ROOM_UNAVAILABLE' } });
    expect(
      await client
        .timeout(2000)
        .emitWithAck('game.command', { stateVersion: 0 }),
    ).toEqual({ error: { code: 'ROOM_UNAVAILABLE' } });
    await request('auth/logout', user.bearer, {});
    const denied = socketEvent(client, 'auth.error');
    client.emit('room.join', { gameId: randomUUID() });
    expect(await denied).toEqual({ code: 'UNAUTHORIZED' });
  });

  it('disconnects idle sockets when the signed token expires', async () => {
    const user = await session();
    const short = await new SignJWT({
      session_id: user.sid,
      is_anonymous: true,
      role: 'authenticated',
      aal: 'aal1',
    })
      .setProtectedHeader({ alg: 'ES256', kid: 'first' })
      .setSubject(user.sub)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 2)
      .sign(keys.privateKey);
    const client = socket(short);
    const connected = socketEvent(client, 'connect');
    const expired = socketEvent(client, 'auth.error');
    client.connect();
    await connected;
    expect(await expired).toEqual({ code: 'UNAUTHORIZED' });
  });

  it('denies suspended users and queues deletion without claiming a privacy purge', async () => {
    const suspended = await session();
    await database.user.update({
      where: { id: suspended.profile.userId },
      data: { status: 'SUSPENDED' },
    });
    expect((await request('me', suspended.bearer)).status).toBe(401);
    const user = await session(false);
    const deleted = await request('me/deletion-request', user.bearer, {});
    expect(deleted.status).toBe(202);
    expect(deletionResponseSchema.parse(await deleted.json()).status).toBe(
      'pending',
    );
    expect((await request('me', user.bearer)).status).toBe(401);
    expect(
      await database.deletionRequest.count({
        where: { userId: user.profile.userId },
      }),
    ).toBe(1);
    expect(
      await database.user.findUnique({ where: { id: user.profile.userId } }),
    ).not.toBeNull();
  });
});
