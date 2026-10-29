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
import { currentLoadoutSchema, managerViewSchema } from '@deckforge/contracts';
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

async function deck(ownerId: string, count = 52) {
  return db.$transaction(
    async (tx) => {
      const cards = [];
      for (let index = 0; index < count; index++) {
        const template = developmentCatalog.templates[index % 52]!;
        cards.push(
          await createCardWithOrigin(
            tx,
            {
              ownerId,
              templateId: template.id,
              seriesId,
              faceId: template.faceId,
            },
            {
              operatorId: 'test.loadout',
              actorUserId: ownerId,
              sourceKey: randomUUID(),
              reason: 'ISOLATED_FIXTURE',
            },
          ),
        );
      }
      return cards;
    },
    { timeout: 15000 },
  );
}
function selection(cards: { id: string; faceId: string }[]) {
  return Object.fromEntries(
    cards.slice(0, 52).map((card) => [card.faceId, card.id]),
  );
}
async function put(path: string, bearer: string, body: unknown) {
  return fetch(base + '/v1/' + path, {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer ' + bearer,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}
function command(
  cards: { id: string; faceId: string }[],
  expectedVersion = 0,
  key: string = randomUUID(),
) {
  return {
    faceToInstanceIds: selection(cards),
    expectedVersion,
    idempotencyKey: key,
  };
}
describe('owned face loadouts and non-destructive 100-slot management', () => {
  it('keeps empty reads private and non-mutating', async () => {
    expect((await request('loadouts/current')).status).toBe(401);
    expect((await request('collection/manager')).status).toBe(401);
    const owner = await actor();
    expect(
      await (await request('loadouts/current', owner.bearer)).json(),
    ).toEqual({ loadout: null });
    expect(
      managerViewSchema.parse(
        await (await request('collection/manager', owner.bearer)).json(),
      ),
    ).toMatchObject({
      version: 0,
      maxSlots: 100,
      slots: [],
      activeInventoryCount: 0,
    });
    expect(
      (await request('loadouts/current?ownerId=' + randomUUID(), owner.bearer))
        .status,
    ).toBe(400);
    expect(
      (
        await request(
          'collection/manager?ownerId=' + randomUUID(),
          owner.bearer,
        )
      ).status,
    ).toBe(400);
    expect(
      await db.collectionManager.count({ where: { userId: owner.userId } }),
    ).toBe(0);
  });
  it('rejects missing, repeated, mismatched, foreign and client-attributed selections', async () => {
    const owner = await actor(),
      other = await actor();
    const cards = await deck(owner.userId);
    const foreign = await deck(other.userId, 1);
    const id = randomUUID();
    const body = command(cards);
    const missing = { ...body.faceToInstanceIds };
    delete missing[cards[0]!.faceId];
    expect(
      (
        await put('loadouts/' + id, owner.bearer, {
          ...body,
          faceToInstanceIds: missing,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await put('loadouts/' + id, owner.bearer, {
          ...body,
          faceToInstanceIds: {
            ...body.faceToInstanceIds,
            [cards[0]!.faceId]: cards[1]!.id,
          },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await put('loadouts/' + id, owner.bearer, {
          ...body,
          faceToInstanceIds: {
            ...body.faceToInstanceIds,
            [cards[0]!.faceId]: cards[1]!.id,
            [cards[1]!.faceId]: cards[0]!.id,
          },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await put('loadouts/' + id, owner.bearer, {
          ...body,
          faceToInstanceIds: {
            ...body.faceToInstanceIds,
            [cards[0]!.faceId]: foreign[0]!.id,
          },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await put('loadouts/' + id, owner.bearer, {
          ...body,
          userId: other.userId,
        })
      ).status,
    ).toBe(400);
    expect(await db.loadout.count({ where: { userId: owner.userId } })).toBe(0);
  });
  it('replays normalized requests and permits one of ten competing versioned replacements', async () => {
    const owner = await actor();
    const cards = await deck(owner.userId, 53);
    const id = randomUUID(),
      body = command(cards);
    const created = await put('loadouts/' + id, owner.bearer, body);
    expect(created.status).toBe(200);
    const receipt = await created.json();
    const reordered = {
      ...body,
      faceToInstanceIds: Object.fromEntries(
        Object.entries(body.faceToInstanceIds)
          .reverse()
          .map(([face, id]) => [face, id.toUpperCase()]),
      ),
    };
    expect(
      await (
        await put('loadouts/' + id.toUpperCase(), owner.bearer, reordered)
      ).json(),
    ).toEqual(receipt);
    expect(
      (
        await put('loadouts/' + id, owner.bearer, {
          ...body,
          expectedVersion: 1,
        })
      ).status,
    ).toBe(409);
    const replacement = {
      ...body.faceToInstanceIds,
      [cards[0]!.faceId]: cards[52]!.id,
    };
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        put('loadouts/' + id, owner.bearer, {
          expectedVersion: 1,
          idempotencyKey: randomUUID(),
          faceToInstanceIds: replacement,
        }),
      ),
    );
    expect(
      responses.filter((response) => response.status === 200),
    ).toHaveLength(1);
    expect(
      responses.filter((response) => response.status === 409),
    ).toHaveLength(9);
    expect(
      await (await put('loadouts/' + id, owner.bearer, body)).json(),
    ).toEqual(receipt);
    const current = currentLoadoutSchema.parse(
      await (await request('loadouts/current', owner.bearer)).json(),
    );
    expect(current.loadout).toMatchObject({
      version: 2,
      validation: { valid: true },
      faceToInstanceIds: replacement,
    });
    expect(await db.loadoutCard.count({ where: { loadoutId: id } })).toBe(52);
    expect(
      await db.cardInstance.count({ where: { ownerId: owner.userId } }),
    ).toBe(53);
    expect(
      await db.operationRecord.count({
        where: { userId: owner.userId, operation: 'collection.loadout' },
      }),
    ).toBe(2);
    const other = await actor();
    const others = await deck(other.userId);
    expect(
      (await put('loadouts/' + id, other.bearer, command(others))).status,
    ).toBe(404);
  });
  it('reports stale/inactive saved choices without repairing or deleting ownership', async () => {
    const owner = await actor();
    const cards = await deck(owner.userId);
    const id = randomUUID();
    expect(
      (await put('loadouts/' + id, owner.bearer, command(cards))).status,
    ).toBe(200);
    const card = cards[0]!,
      token = randomUUID();
    const change = async (
      expectedVersion: number,
      command: Parameters<typeof writeCardTransition>[1]['command'],
    ) =>
      db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${owner.userId}::uuid FOR UPDATE`;
        return writeCardTransition(tx, {
          instanceId: card.id,
          ownerId: owner.userId,
          expectedVersion,
          command,
          operatorId: 'test.loadout',
          sourceKey: randomUUID(),
          reason: 'TEST_RESERVATION',
        });
      });
    await change(1, {
      action: 'LOCK',
      lockToken: token,
      lockReason: 'TEST_MATCH',
    });
    expect(
      currentLoadoutSchema.parse(
        await (await request('loadouts/current', owner.bearer)).json(),
      ).loadout?.validation.valid,
    ).toBe(false);
    await change(2, { action: 'UNLOCK', lockToken: token });
    await change(3, { action: 'FUSION_CONSUME' });
    const current = currentLoadoutSchema.parse(
      await (await request('loadouts/current', owner.bearer)).json(),
    );
    expect(current.loadout?.validation.valid).toBe(false);
    expect(current.loadout?.faceToInstanceIds[card.faceId]).toBe(card.id);
    expect(
      (await put('loadouts/' + id, owner.bearer, command(cards, 1))).status,
    ).toBe(409);
    expect(
      await db.cardInstance.count({ where: { ownerId: owner.userId } }),
    ).toBe(52);
    expect(
      await db.ownershipEvent.count({ where: { instanceId: card.id } }),
    ).toBe(4);
    await auth.logout(await auth.authenticate('Bearer ' + owner.bearer));
    expect(
      (await put('loadouts/' + id, owner.bearer, command(cards, 1))).status,
    ).toBe(401);
    expect(
      (await db.loadout.findUniqueOrThrow({ where: { id } })).version,
    ).toBe(1);
  });
  it('holds 100 display references while retaining 125 cards, their origins and an independent 52-face loadout', async () => {
    const owner = await actor();
    const cards = await deck(owner.userId, 125);
    const slots = cards
      .slice(0, 100)
      .map((card, index) => ({ slot: index + 1, instanceId: card.id }));
    const body = { expectedVersion: 0, idempotencyKey: randomUUID(), slots };
    expect((await put('collection/manager', owner.bearer, body)).status).toBe(
      200,
    );
    expect(
      (await put('loadouts/' + randomUUID(), owner.bearer, command(cards)))
        .status,
    ).toBe(200);
    const view = managerViewSchema.parse(
      await (await request('collection/manager', owner.bearer)).json(),
    );
    expect(view).toMatchObject({
      version: 1,
      maxSlots: 100,
      activeInventoryCount: 125,
      unmanagedCount: 25,
    });
    expect(view.slots).toHaveLength(100);
    expect(
      (
        await put('collection/manager', owner.bearer, {
          expectedVersion: 1,
          idempotencyKey: randomUUID(),
          slots: [...slots, { slot: 101, instanceId: cards[100]!.id }],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await put('collection/manager', owner.bearer, {
          expectedVersion: 1,
          idempotencyKey: randomUUID(),
          slots: [slots[0], slots[0]],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await put('collection/manager', owner.bearer, {
          expectedVersion: 0,
          idempotencyKey: randomUUID(),
          slots: [],
        })
      ).status,
    ).toBe(409);
    // Test-only DB fault after old references have been removed inside the save transaction.
    await db.$executeRawUnsafe(
      `CREATE FUNCTION fail_manager_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test fault'; END; $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER fail_manager_test BEFORE INSERT ON "CollectionManagerSlot" FOR EACH ROW EXECUTE FUNCTION fail_manager_test()`,
    );
    try {
      expect(
        (
          await put('collection/manager', owner.bearer, {
            expectedVersion: 1,
            idempotencyKey: randomUUID(),
            slots: slots.slice(0, 99),
          })
        ).status,
      ).toBe(503);
      expect(
        await db.collectionManagerSlot.count({
          where: { userId: owner.userId },
        }),
      ).toBe(100);
      expect(
        (
          await db.collectionManager.findUniqueOrThrow({
            where: { userId: owner.userId },
          })
        ).version,
      ).toBe(1);
    } finally {
      await db.$executeRawUnsafe(
        'DROP TRIGGER fail_manager_test ON "CollectionManagerSlot"',
      );
      await db.$executeRawUnsafe('DROP FUNCTION fail_manager_test()');
    }
    const clears = await Promise.all(
      Array.from({ length: 2 }, () =>
        put('collection/manager', owner.bearer, {
          expectedVersion: 1,
          idempotencyKey: randomUUID(),
          slots: [],
        }),
      ),
    );
    expect(clears.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const empty = managerViewSchema.parse(
      await (await request('collection/manager', owner.bearer)).json(),
    );
    expect(empty).toMatchObject({
      version: 2,
      slots: [],
      activeInventoryCount: 125,
      unmanagedCount: 125,
    });
    expect(
      await db.cardInstance.count({ where: { ownerId: owner.userId } }),
    ).toBe(125);
    expect(
      await db.ownershipEvent.count({ where: { actorUserId: owner.userId } }),
    ).toBe(125);
    const page = (await (
      await request('cards?limit=100', owner.bearer)
    ).json()) as { items: unknown[]; nextCursor: string };
    expect(page.items).toHaveLength(100);
    const next = (await (
      await request('cards?limit=100&cursor=' + page.nextCursor, owner.bearer)
    ).json()) as { items: unknown[] };
    expect(next.items).toHaveLength(25);
    // An old idempotency receipt does not restore the old manager selection.
    expect((await put('collection/manager', owner.bearer, body)).status).toBe(
      200,
    );
    expect(
      (
        await db.collectionManager.findUniqueOrThrow({
          where: { userId: owner.userId },
        })
      ).version,
    ).toBe(2);
  });
  it('enforces face/owner/completeness and slot bounds in PostgreSQL and rolls back selection failures', async () => {
    const owner = await db.user.create({ data: {} });
    const cards = await deck(owner.id);
    const id = randomUUID();
    await expect(
      db.loadout.create({ data: { id, userId: owner.id, version: 1 } }),
    ).rejects.toThrow();
    await db.collectionManager.create({
      data: { userId: owner.id, version: 1 },
    });
    await expect(
      db.collectionManagerSlot.create({
        data: {
          userId: owner.id,
          managerVersion: 1,
          slot: 101,
          instanceId: cards[0]!.id,
        },
      }),
    ).rejects.toThrow();
    const foreign = await db.user.create({ data: {} });
    await db.collectionManager.create({
      data: { userId: foreign.id, version: 1 },
    });
    await expect(
      db.collectionManagerSlot.create({
        data: {
          userId: foreign.id,
          managerVersion: 1,
          slot: 1,
          instanceId: cards[0]!.id,
        },
      }),
    ).rejects.toThrow();
    expect(await db.cardInstance.count({ where: { ownerId: owner.id } })).toBe(
      52,
    );
  });
});
