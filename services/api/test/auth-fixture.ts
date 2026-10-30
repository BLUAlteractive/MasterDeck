import type { FusionPolicy, SpadesPolicy } from '@deckforge/contracts';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { ClassicAdmissionPolicy } from '../src/rooms/settlement';
import { expect } from 'vitest';
import { createDatabase, type PrismaClient } from '@deckforge/database';
import { createApp } from '../src/app';
import { AuthService } from '../src/auth/service';
import { createTokenVerifier } from '../src/auth/token-verifier';
const apiRequire = createRequire(
  fileURLToPath(new URL('../package.json', import.meta.url)),
);
const { generateKeyPair, exportJWK, SignJWT } = (await import(
  apiRequire.resolve('jose')
)) as typeof import('jose');
export async function identityFixture(
  policy: ClassicAdmissionPolicy | null = null,
  spadesPolicy: SpadesPolicy | null = null,
  fusionPolicy: FusionPolicy | null = null,
  features: NonNullable<Parameters<typeof createApp>[6]> = {},
) {
  let db!: PrismaClient;
  let app!: Awaited<ReturnType<typeof createApp>>;
  let jwks!: Server;
  let base!: string;
  let issuer!: string;
  let keys!: Awaited<ReturnType<typeof generateKeyPair>>;
  let auth!: AuthService;
  let secondDb!: PrismaClient;
  let players!: Awaited<ReturnType<typeof actor>>[];
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
    return {
      sub,
      sid,
      bearer,
      userId: profile.userId,
      principal: await auth.authenticate('Bearer ' + bearer),
    };
  }
  async function setup() {
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
    if (!address || typeof address === 'string')
      throw new Error('Missing port');
    issuer = `http://127.0.0.1:${address.port}/auth/v1`;
    auth = new AuthService(
      db,
      createTokenVerifier({
        issuer,
        audience: 'authenticated',
        jwksUrl: issuer + '/.well-known/jwks.json',
      }),
    );
    app = await createApp(
      [],
      auth,
      undefined,
      policy,
      spadesPolicy,
      fusionPolicy,
      features,
    );
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    secondDb = createDatabase(url.toString());
    players = [];
    for (let i = 0; i < 4; i++) players.push(await actor());
  }
  async function close() {
    await app?.close();
    if (jwks) await new Promise<void>((resolve) => jwks.close(() => resolve()));
    await db?.$disconnect();
    await secondDb?.$disconnect();
  }

  await setup();
  return {
    db,
    secondDb,
    app,
    auth,
    base,
    issuer,
    players,
    actor,
    request,
    close,
  };
}
