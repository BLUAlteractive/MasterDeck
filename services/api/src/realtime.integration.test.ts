import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import {
  pokerRoomViewSchema,
  type PokerViewResponse,
} from '@deckforge/contracts';
import { identityFixture } from '../test/auth-fixture';
import { initializePokerRoom, PokerRoomService } from './rooms/service';
import { createApp } from './app';
import { AuthService } from './auth/service';
import { createTokenVerifier } from './auth/token-verifier';
let f: Awaited<ReturnType<typeof identityFixture>>,
  other: Awaited<ReturnType<typeof createApp>>,
  secondBase: string,
  service: PokerRoomService;
const clients: Socket[] = [];
beforeAll(async () => {
  f = await identityFixture();
  other = await createApp(
    [],
    new AuthService(
      f.secondDb,
      createTokenVerifier({
        issuer: f.issuer,
        audience: 'authenticated',
        jwksUrl: f.issuer + '/.well-known/jwks.json',
      }),
    ),
  );
  await other.listen(0, '127.0.0.1');
  secondBase = await other.getUrl();
  service = new PokerRoomService(f.secondDb);
});
afterAll(async () => {
  clients.forEach((c) => c.disconnect());
  await other?.close();
  await f?.close();
});
async function connect(bearer: string, base = f.base) {
  const c = io(base + '/rooms', {
    transports: ['websocket'],
    reconnection: false,
    autoConnect: false,
    auth: { token: bearer },
  });
  clients.push(c);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('connect timeout')), 5000);
    c.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    c.once('connect_error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    c.connect();
  });
  return c;
}
function state(c: Socket, version: number) {
  return new Promise<PokerViewResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      c.off('game.state', receive);
      reject(new Error('state timeout ' + version));
    }, 5000);
    const receive = (value: unknown) => {
      const result = pokerRoomViewSchema.parse(value);
      if (result.view.stateVersion >= version) {
        clearTimeout(timer);
        c.off('game.state', receive);
        resolve(result.view);
      }
    };
    c.on('game.state', receive);
  });
}
const command = (gameId: string, stateVersion: number, action: string) => ({
  gameId,
  stateVersion,
  commandId: randomUUID(),
  payload: { action },
});
it('broadcasts separately to clients on different API instances without pre-showdown holes or fold leaks', async () => {
  const players = f.players.slice(0, 3),
    gameId = await initializePokerRoom(f.db, {
      players: players.map((p) => ({ id: p.userId, stack: 100 })),
      dealer: 0,
      smallBlind: 1,
      bigBlind: 2,
    });
  const sockets = await Promise.all(
    players.map((p, i) => connect(p.bearer, i % 2 ? secondBase : f.base)),
  );
  for (const c of sockets) {
    const result = await c.timeout(5000).emitWithAck('room.join', { gameId });
    expect(pokerRoomViewSchema.safeParse(result).success).toBe(true);
  }
  let updates = sockets.map((c) => state(c, 1));
  await service.command(players[0]!.principal, command(gameId, 0, 'FOLD'));
  for (const [i, view] of (await Promise.all(updates)).entries()) {
    expect(
      view.players.filter((p) => p.hole !== null).map((p) => p.id),
    ).toEqual([players[i]!.userId]);
    expect(JSON.stringify(view)).not.toMatch(
      /"(?:deck|burned|cursor|seed|snapshot|initial)"/,
    );
  }
  updates = sockets.map((c) => state(c, 2));
  await service.command(players[1]!.principal, command(gameId, 1, 'FOLD'));
  for (const [i, view] of (await Promise.all(updates)).entries()) {
    expect(view.outcome!.reason).toBe('FOLD');
    expect(
      view.players.filter((p) => p.hole !== null).map((p) => p.id),
    ).toEqual([players[i]!.userId]);
  }
  sockets.forEach((c) => c.disconnect());
});
it('reveals live showdown cards only at terminal completion', async () => {
  const players = f.players.slice(0, 2),
    gameId = await initializePokerRoom(f.db, {
      players: players.map((p) => ({ id: p.userId, stack: 100 })),
      dealer: 0,
      smallBlind: 1,
      bigBlind: 2,
    });
  const c = await connect(players[1]!.bearer);
  await c.timeout(5000).emitWithAck('room.join', { gameId });
  let update = state(c, 1);
  await service.command(players[0]!.principal, command(gameId, 0, 'ALL_IN'));
  expect((await update).players[0]!.hole).toBe(null);
  update = state(c, 2);
  await service.command(players[1]!.principal, command(gameId, 1, 'CALL'));
  const result = await update;
  expect(result.outcome!.reason).toBe('SHOWDOWN');
  expect(result.players.every((p) => p.hole?.length === 2)).toBe(true);
  c.disconnect();
});
it('denies outsider subscriptions and disconnects a revoked recipient before new updates', async () => {
  const p = await f.actor(),
    q = f.players[1]!,
    gameId = await initializePokerRoom(f.db, {
      players: [
        { id: p.userId, stack: 100 },
        { id: q.userId, stack: 100 },
      ],
      dealer: 0,
      smallBlind: 1,
      bigBlind: 2,
    });
  const outsider = await connect(f.players[3]!.bearer);
  expect(
    (await outsider.timeout(5000).emitWithAck('room.join', { gameId })).error
      .code,
  ).toBe('ROOM_UNAVAILABLE');
  outsider.disconnect();
  const c = await connect(p.bearer);
  await c.timeout(5000).emitWithAck('room.join', { gameId });
  const next = state(c, 1);
  await service.command(p.principal, command(gameId, 0, 'CALL'));
  await next;
  await f.db.authSession.update({
    where: { id: p.principal.sessionId },
    data: { revokedAt: new Date() },
  });
  const denied = new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('revocation timeout')),
      5000,
    );
    c.once('auth.error', (v) => {
      clearTimeout(timer);
      resolve(v);
    });
  });
  let delivered = false;
  c.on('game.state', () => {
    delivered = true;
  });
  await service.command(q.principal, command(gameId, 1, 'CHECK'));
  expect(await denied).toEqual({ code: 'UNAUTHORIZED' });
  expect(delivered).toBe(false);
  c.disconnect();
});
