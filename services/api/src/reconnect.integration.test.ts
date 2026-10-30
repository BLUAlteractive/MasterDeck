import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { pokerResumeResponseSchema } from '@deckforge/contracts';
import { identityFixture } from '../test/auth-fixture';
import { initializePokerRoom, PokerRoomService } from './rooms/service';
let f: Awaited<ReturnType<typeof identityFixture>>,
  a: PokerRoomService,
  b: PokerRoomService;
const clients: Socket[] = [];
beforeAll(async () => {
  f = await identityFixture();
  a = new PokerRoomService(f.db);
  b = new PokerRoomService(f.secondDb);
});
afterAll(async () => {
  clients.forEach((c) => c.disconnect());
  await f?.close();
});
async function room(timeout = 30000) {
  return initializePokerRoom(
    f.db,
    {
      players: f.players.slice(0, 2).map((p) => ({ id: p.userId, stack: 100 })),
      dealer: 0,
      smallBlind: 1,
      bigBlind: 2,
    },
    timeout,
  );
}
async function socket(index = 0) {
  const c = io(f.base + '/rooms', {
    transports: ['websocket'],
    reconnection: false,
    autoConnect: false,
    auth: { token: f.players[index]!.bearer },
  });
  clients.push(c);
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('connect timeout')), 5000);
    c.once('connect', () => {
      clearTimeout(t);
      resolve();
    });
    c.once('connect_error', (e) => {
      clearTimeout(t);
      reject(e);
    });
    c.connect();
  });
  return c;
}
it('recovers a lost acknowledgement with an unchanged deadline and exactly one command event', async () => {
  const gameId = await room(),
    p = f.players[0]!,
    c = await socket();
  await c.timeout(5000).emitWithAck('room.join', { gameId });
  const body = {
    gameId,
    commandId: randomUUID(),
    stateVersion: 0,
    payload: { action: 'CALL' },
  };
  // Commit independently, then disconnect before consuming the original receipt.
  const committed = await a.command(p.principal, body);
  c.disconnect();
  const recovered = await socket();
  const resume = await recovered
    .timeout(5000)
    .emitWithAck('room.resume', { gameId, afterVersion: 0 });
  expect(pokerResumeResponseSchema.safeParse(resume).success).toBe(true);
  expect(resume.view.stateVersion).toBe(1);
  expect(resume.turnDeadline).toBe(committed.turnDeadline);
  expect(
    await recovered.timeout(5000).emitWithAck('game.command', body),
  ).toEqual(committed);
  expect(await f.db.gameEvent.count({ where: { roomId: gameId } })).toBe(2);
  recovered.disconnect();
});
it('safe resume survives service restart and rejects outsiders, future cursors and unknown fields', async () => {
  const gameId = await room(),
    p = f.players[0]!;
  const before = await a.read(p.principal, gameId);
  const resumed = await new PokerRoomService(f.secondDb).resume(p.principal, {
    gameId,
    afterVersion: 0,
  });
  expect(resumed.turnDeadline).toBe(before.turnDeadline);
  expect(resumed.view.players[1]!.hole).toBe(null);
  await expect(
    a.resume(f.players[3]!.principal, { gameId, afterVersion: 0 }),
  ).rejects.toMatchObject({ code: 'ROOM_UNAVAILABLE' });
  await expect(
    a.resume(p.principal, { gameId, afterVersion: 1 }),
  ).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
  await expect(
    a.resume(p.principal, { gameId, afterVersion: 0, deadline: 'tomorrow' }),
  ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
});
it('competing timeout workers fold an expired debt once and replay the terminal hand', async () => {
  const gameId = await room(1000);
  expect(await a.expire(gameId)).toBe(false);
  await new Promise((r) => setTimeout(r, 1100));
  await Promise.all(
    Array.from({ length: 8 }, (_, i) => (i % 2 ? a : b).expire(gameId)),
  );
  const events = await f.db.gameEvent.findMany({
    where: { roomId: gameId },
    orderBy: { stateVersion: 'asc' },
  });
  expect(events).toHaveLength(2);
  expect(events[1]!.source).toBe('TIMEOUT');
  expect(
    (events[1]!.command as { payload: { action: string } }).payload.action,
  ).toBe('FOLD');
  const resumed = await b.resume(f.players[1]!.principal, {
    gameId,
    afterVersion: 0,
  });
  expect(resumed.view.outcome!.reason).toBe('FOLD');
  expect(resumed.turnDeadline).toBe(null);
  expect(await b.expire(gameId)).toBe(false);
});
it('checks rather than folds when an expired turn owes no call', async () => {
  const gameId = await room(1000);
  await a.command(f.players[0]!.principal, {
    gameId,
    commandId: randomUUID(),
    stateVersion: 0,
    payload: { action: 'CALL' },
  });
  await new Promise((r) => setTimeout(r, 1100));
  await b.expire(gameId);
  const event = await f.db.gameEvent.findUniqueOrThrow({
    where: { roomId_stateVersion: { roomId: gameId, stateVersion: 2 } },
  });
  expect(event.source).toBe('TIMEOUT');
  expect(
    (event.command as { payload: { action: string } }).payload.action,
  ).toBe('CHECK');
  expect((await b.read(f.players[0]!.principal, gameId)).view.street).toBe(
    'FLOP',
  );
});
it('enforces immutable timeout policy in SQL', async () => {
  const id = await room();
  await expect(
    f.db.gameRoom.update({ where: { id }, data: { turnTimeoutMs: 1000 } }),
  ).rejects.toThrow();
});
