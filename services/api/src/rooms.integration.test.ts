import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { createDatabase, type PrismaClient } from '@deckforge/database';
import {
  pokerRoomViewSchema,
  pokerCommandReceiptSchema,
} from '@deckforge/contracts';
import { io } from 'socket.io-client';
import {
  initializePokerRoom,
  PokerRoomService,
  StaleRoomVersion,
} from './rooms/service';
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
let secondDb: PrismaClient;
let service: PokerRoomService;
let second: PokerRoomService;
let players: Awaited<ReturnType<typeof actor>>[];
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
  secondDb = createDatabase(url.toString());
  service = new PokerRoomService(db);
  second = new PokerRoomService(secondDb);
  players = [];
  for (let i = 0; i < 4; i++) players.push(await actor());
});
afterAll(async () => {
  await app?.close();
  if (jwks) await new Promise<void>((resolve) => jwks.close(() => resolve()));
  await db?.$disconnect();
  await secondDb?.$disconnect();
});

async function room(count = 2) {
  return initializePokerRoom(db, {
    players: players.slice(0, count).map((p) => ({ id: p.userId, stack: 100 })),
    dealer: 0,
    smallBlind: 1,
    bigBlind: 2,
  });
}
function command(
  gameId: string,
  index = 0,
  stateVersion = 0,
  payload: unknown = { action: 'CALL' },
) {
  return {
    gameId,
    commandId: 'command_' + randomUUID() + '_' + index,
    stateVersion,
    payload,
  };
}
it('persists one CSPRNG deck, commitment and genesis before any recipient sees holes', async () => {
  const id = await room(),
    other = await room();
  const first = await db.gameRoom.findUniqueOrThrow({ where: { id } }),
    next = await db.gameRoom.findUniqueOrThrow({ where: { id: other } });
  expect(first.commitment).toMatch(/^[a-f0-9]{64}$/);
  expect(first.initial).not.toEqual(next.initial);
  expect(await db.gameEvent.count({ where: { roomId: id } })).toBe(1);
  const view = await service.read(players[0]!.principal, id);
  expect(pokerRoomViewSchema.safeParse(view).success).toBe(true);
  expect(view.view.players[1]!.hole).toBe(null);
  expect(JSON.stringify(view)).not.toMatch(
    /"(?:deck|burned|initial|snapshot|commitment|cursor)"/,
  );
});
it('authenticates HTTP and refuses nonmembers and client authority fields', async () => {
  const id = await room();
  expect((await request('games/' + id)).status).toBe(401);
  expect((await request('games/' + id, players[3]!.bearer)).status).toBe(404);
  expect(
    (await request('games/' + randomUUID(), players[3]!.bearer)).status,
  ).toBe(404);
  for (const extra of [
    { playerId: players[1]!.userId },
    { stack: 999 },
    { winner: players[0]!.userId },
    { seed: 1 },
  ]) {
    expect(
      (
        await request('games/commands', players[0]!.bearer, {
          ...command(id),
          ...extra,
        })
      ).status,
    ).toBe(400);
  }
  expect(await db.gameEvent.count({ where: { roomId: id } })).toBe(1);
});
it('serializes ten parallel unique-key commands across independent actor instances', async () => {
  const id = await room();
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, (_, i) =>
      (i % 2 ? service : second).command(players[0]!.principal, command(id, i)),
    ),
  );
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(
    results.filter(
      (r) => r.status === 'rejected' && r.reason instanceof StaleRoomVersion,
    ),
  ).toHaveLength(9);
  expect(
    (await db.gameRoom.findUniqueOrThrow({ where: { id } })).stateVersion,
  ).toBe(1);
  expect(await db.gameEvent.count({ where: { roomId: id } })).toBe(2);
});
it('locks the room for different users and processes, not only a per-user in-memory queue', async () => {
  const id = await room();
  let unlock!: () => void, locked!: () => void;
  const ready = new Promise<void>((r) => {
      locked = r;
    }),
    release = new Promise<void>((r) => {
      unlock = r;
    });
  const holding = db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "GameRoom" WHERE "id"=${id}::uuid FOR UPDATE`;
    locked();
    await release;
  });
  await ready;
  let finished = 0;
  const reads = [
    service.read(players[0]!.principal, id),
    second.read(players[1]!.principal, id),
  ].map((p) =>
    p.then((v) => {
      finished++;
      return v;
    }),
  );
  try {
    let waiting = 0;
    const deadline = Date.now() + 3000;
    while (waiting < 2 && Date.now() < deadline) {
      const rows = await db.$queryRaw<
        { count: number }[]
      >`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%"GameRoom"%'`;
      waiting = rows[0]!.count;
      if (waiting < 2) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(waiting).toBe(2);
    expect(finished).toBe(0);
  } finally {
    unlock();
  }
  await holding;
  expect((await Promise.all(reads)).map((r) => r.view.stateVersion)).toEqual([
    0, 0,
  ]);
});
it('replays ten same-key requests once and preserves the original receipt after later commands', async () => {
  const id = await room(),
    body = command(id);
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      (i % 2 ? service : second).command(players[0]!.principal, body),
    ),
  );
  for (const result of results) expect(result).toEqual(results[0]);
  await second.command(
    players[1]!.principal,
    command(id, 1, 1, { action: 'CHECK' }),
  );
  expect(
    await new PokerRoomService(secondDb).command(players[0]!.principal, body),
  ).toEqual(results[0]);
  expect(await db.gameEvent.count({ where: { roomId: id } })).toBe(3);
  await expect(
    service.command(players[0]!.principal, {
      ...body,
      payload: { action: 'FOLD' },
    }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  const other = await room();
  await expect(
    service.command(players[0]!.principal, { ...body, gameId: other }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
});
it('returns safe resync on stale HTTP commands and rejects illegal wagers without a write', async () => {
  const id = await room();
  for (const [p, payload] of [
    [players[1]!, { action: 'CALL' }],
    [players[0]!, { action: 'BET_TO', target: 3 }],
  ] as const) {
    expect(
      (await request('games/commands', p.bearer, command(id, 0, 0, payload)))
        .status,
    ).toBe(422);
  }
  const result = await request(
    'games/commands',
    players[0]!.bearer,
    command(id),
  );
  expect(result.status).toBe(200);
  expect(pokerCommandReceiptSchema.safeParse(await result.json()).success).toBe(
    true,
  );
  const stale = await request(
    'games/commands',
    players[0]!.bearer,
    command(id),
  );
  expect(stale.status).toBe(409);
  const conflict = (await stale.json()) as {
    error: { code: string };
    resync: unknown;
  };
  expect(conflict.error.code).toBe('STALE_VERSION');
  expect(pokerRoomViewSchema.safeParse(conflict.resync).success).toBe(true);
  expect(await db.gameEvent.count({ where: { roomId: id } })).toBe(2);
});
it('replays a completed hand after service restart using durable private events only', async () => {
  const id = await room(3);
  let view = (await service.read(players[0]!.principal, id)).view;
  while (view.toAct !== null) {
    const player = players.find((p) => p.userId === view.toAct)!;
    const own = (await service.read(player.principal, id)).view;
    const result = await second.command(
      player.principal,
      command(id, 0, own.stateVersion, {
        action: own.legal!.canCheck ? 'CHECK' : 'CALL',
      }),
    );
    view = result.view;
  }
  const restarted = await new PokerRoomService(secondDb).read(
    players[0]!.principal,
    id,
  );
  expect(restarted.view.outcome!.reason).toBe('SHOWDOWN');
  expect(restarted.view.players.every((p) => p.hole !== null)).toBe(true);
  expect(await db.gameEvent.count({ where: { roomId: id } })).toBe(
    view.stateVersion + 1,
  );
  await expect(
    service.command(
      players[0]!.principal,
      command(id, 0, view.stateVersion, { action: 'CHECK' }),
    ),
  ).rejects.toMatchObject({ code: 'ILLEGAL_ACTION' });
});
it('rolls back the state update if event insertion fails', async () => {
  const id = await room();
  await db.$executeRawUnsafe(
    `CREATE FUNCTION fixture_event_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."roomId"='${id}'::uuid THEN RAISE EXCEPTION 'fixture failure'; END IF; RETURN NEW; END $$`,
  );
  await db.$executeRawUnsafe(
    'CREATE TRIGGER fixture_event_failure BEFORE INSERT ON "GameEvent" FOR EACH ROW EXECUTE FUNCTION fixture_event_failure()',
  );
  try {
    await expect(
      service.command(players[0]!.principal, command(id)),
    ).rejects.toThrow();
  } finally {
    await db.$executeRawUnsafe(
      'DROP TRIGGER fixture_event_failure ON "GameEvent"',
    );
    await db.$executeRawUnsafe('DROP FUNCTION fixture_event_failure()');
  }
  expect(
    (await db.gameRoom.findUniqueOrThrow({ where: { id } })).stateVersion,
  ).toBe(0);
  expect(await db.gameEvent.count({ where: { roomId: id } })).toBe(1);
});
it('guards event history, membership, immutable rules and snapshot/event atomicity in SQL', async () => {
  const id = await room(),
    event = await db.gameEvent.findFirstOrThrow({ where: { roomId: id } });
  await expect(
    db.gameEvent.update({
      where: { id: event.id },
      data: { command: { tampered: true } },
    }),
  ).rejects.toThrow();
  await expect(
    db.gameEvent.delete({ where: { id: event.id } }),
  ).rejects.toThrow();
  await expect(
    db.gameParticipant.delete({
      where: { roomId_userId: { roomId: id, userId: players[0]!.userId } },
    }),
  ).rejects.toThrow();
  await expect(
    db.gameRoom.update({ where: { id }, data: { rulesetVersion: 'EVOLVED' } }),
  ).rejects.toThrow();
  const row = await db.gameRoom.findUniqueOrThrow({ where: { id } });
  await expect(
    db.gameRoom.update({
      where: { id },
      data: {
        stateVersion: 1,
        snapshot: { ...(row.snapshot as object), stateVersion: 1 },
      },
    }),
  ).rejects.toThrow();
  expect(
    (await db.gameRoom.findUniqueOrThrow({ where: { id } })).stateVersion,
  ).toBe(0);
});
it('rechecks revocation and expiry under database locks even for an earlier principal', async () => {
  const p = await actor(),
    peer = players[0]!;
  const id = await initializePokerRoom(db, {
    players: [
      { id: p.userId, stack: 100 },
      { id: peer.userId, stack: 100 },
    ],
    dealer: 0,
    smallBlind: 1,
    bigBlind: 2,
  });
  await expect(
    service.command(
      { ...p.principal, claims: { ...p.principal.claims, exp: 0 } },
      command(id),
    ),
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  await db.authSession.update({
    where: { id: p.principal.sessionId },
    data: { revokedAt: new Date() },
  });
  await expect(service.command(p.principal, command(id))).rejects.toMatchObject(
    { code: 'UNAUTHORIZED' },
  );
  expect((await request('games/' + id, p.bearer)).status).toBe(401);
  expect(await db.gameEvent.count({ where: { roomId: id } })).toBe(1);
});
it('gates socket joins and commands and acknowledges only the recipient-safe projection', async () => {
  const id = await room();
  const client = io(base + '/rooms', {
    transports: ['websocket'],
    reconnection: false,
    autoConnect: false,
    auth: { token: players[0]!.bearer },
  });
  try {
    const connected = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Socket connect timeout')),
        5000,
      );
      client.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      client.once('connect_error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    client.connect();
    await connected;
    const join = await client
      .timeout(5000)
      .emitWithAck('room.join', { gameId: id });
    expect(pokerRoomViewSchema.safeParse(join).success).toBe(true);
    expect(join.view.players[1].hole).toBe(null);
    const denied = await client
      .timeout(5000)
      .emitWithAck('room.join', { gameId: randomUUID() });
    expect(denied.error.code).toBe('ROOM_UNAVAILABLE');
    const accepted = await client
      .timeout(5000)
      .emitWithAck('game.command', command(id));
    expect(pokerCommandReceiptSchema.safeParse(accepted).success).toBe(true);
    expect(accepted.view.players[1].hole).toBe(null);
    const stale = await client
      .timeout(5000)
      .emitWithAck('game.command', command(id));
    expect(stale.error.code).toBe('STALE_VERSION');
    expect(pokerRoomViewSchema.safeParse(stale.resync).success).toBe(true);
  } finally {
    client.disconnect();
  }
});
