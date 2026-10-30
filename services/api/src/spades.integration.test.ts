import { beforeAll, afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { canonicalFaces } from '@deckforge/game-core';
import {
  spadesRoomViewSchema,
  spadesResumeResponseSchema,
  spadesReceiptSchema,
} from '@deckforge/contracts';
import { identityFixture } from '../test/auth-fixture';
import { initializeSpadesRoom, SpadesRoomService } from './rooms/spades';
import { createApp } from './app';
import { AuthService } from './auth/service';
import { createTokenVerifier } from './auth/token-verifier';
let f: Awaited<ReturnType<typeof identityFixture>>,
  other: Awaited<ReturnType<typeof createApp>>,
  base: string;
const sockets: Socket[] = [];
const rules = {
  version: 'SPADES_INTEGRATION_FIXTURE',
  nilEnabled: true,
  nilPoints: 100,
  contractPoints: 10,
  bagPoints: 1,
  bagThreshold: 10,
  bagPenalty: 100,
  failedNilCountsAsBags: true,
  failedNilBagPoints: 1,
  targetScore: 1,
};
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
  base = await other.getUrl();
});
afterAll(async () => {
  sockets.forEach((socket) => socket.disconnect());
  await other?.close();
  await f?.close();
});
async function connect(index: number, url = f.base) {
  const socket = io(url + '/rooms', {
    transports: ['websocket'],
    reconnection: false,
    autoConnect: false,
    auth: { token: f.players[index]!.bearer },
  });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
    socket.connect();
  });
  return socket;
}
const ack = (socket: Socket, event: string, body: unknown) =>
  socket.timeout(8000).emitWithAck(event, body) as Promise<unknown>;
const create = () =>
  initializeSpadesRoom(f.db, {
    players: f.players.map((player) => player.userId),
    dealer: 0,
    deck: canonicalFaces.map((face) => face.id),
    rules,
  });
it('four authenticated sockets complete 13 tricks across two servers, retry and reconnect safely', async () => {
  const gameId = await create(),
    clients = await Promise.all(
      f.players.map((_, index) => connect(index, index % 2 ? base : f.base)),
    );
  for (let index = 0; index < 4; index++) {
    const joined = spadesRoomViewSchema.parse(
      await ack(clients[index]!, 'room.join', { gameId }),
    );
    expect(joined.view.players.map((player) => player.hand === null)).toEqual(
      f.players.map((_, seat) => seat !== index),
    );
  }
  let current = await new SpadesRoomService(f.db).read(
    f.players[0]!.principal,
    gameId,
  );
  for (let action = 0; action < 56; action++) {
    const index = f.players.findIndex(
      (player) => player.userId === current.view.toAct,
    );
    expect(index).toBeGreaterThanOrEqual(0);
    const resumed = spadesResumeResponseSchema.parse(
      await ack(clients[index]!, 'room.resume', { gameId, afterVersion: 0 }),
    );
    const legal = resumed.view.legal!;
    const payload =
      legal.kind === 'BID'
        ? { kind: 'BID', tricks: 3 }
        : legal.kind === 'PLAY'
          ? { kind: 'PLAY', face: legal.cards[0]! }
          : null;
    expect(payload).not.toBe(null);
    const body = {
      gameId,
      commandId: randomUUID(),
      stateVersion: resumed.view.stateVersion,
      payload,
    };
    const receipt = spadesReceiptSchema.parse(
      await ack(clients[index]!, 'game.command', body),
    );
    current = receipt;
    expect(
      receipt.view.players
        .filter((player) => player.id !== f.players[index]!.userId)
        .every((player) => player.hand === null),
    ).toBe(true);
    if (action === 20) {
      clients[index]!.disconnect();
      clients[index] = await connect(index, base);
      const retry = spadesReceiptSchema.parse(
        await ack(clients[index]!, 'game.command', body),
      );
      expect(retry).toEqual(receipt);
      const recovered = spadesResumeResponseSchema.parse(
        await ack(clients[index]!, 'room.resume', { gameId, afterVersion: 0 }),
      );
      expect(recovered.view.stateVersion).toBe(receipt.stateVersion);
    }
  }
  expect(current.view.phase).toBe('MATCH_COMPLETE');
  expect(current.view.tricksCompleted).toBe(13);
  expect(
    current.view.players.reduce((sum, player) => sum + player.tricks, 0),
  ).toBe(13);
  expect(current.settled).toBe(true);
  expect(current.view.stateVersion).toBe(56);
  expect(await f.db.spadesEvent.count({ where: { roomId: gameId } })).toBe(57);
  expect(await f.db.spadesResult.count({ where: { roomId: gameId } })).toBe(1);
  const completed = await f.db.spadesResult.findUniqueOrThrow({
    where: { roomId: gameId },
  });
  await expect(
    f.db.spadesRoom.update({
      where: { id: completed.roomId },
      data: { stateVersion: completed.stateVersion + 1 },
    }),
  ).rejects.toThrow();
  await expect(
    f.db.spadesResult.update({
      where: { roomId: completed.roomId },
      data: { winner: 1 - completed.winner },
    }),
  ).rejects.toThrow();
  const restarted = await new SpadesRoomService(f.secondDb).read(
    f.players[0]!.principal,
    gameId,
  );
  expect(restarted.view.phase).toBe('MATCH_COMPLETE');
  clients.forEach((client) => client.disconnect());
}, 40000);
it('cross-process identical commands apply once; changed bodies conflict and stale requests resync safely', async () => {
  const gameId = await create(),
    player = f.players[1]!,
    a = new SpadesRoomService(f.db),
    b = new SpadesRoomService(f.secondDb),
    body = {
      gameId,
      commandId: randomUUID(),
      stateVersion: 0,
      payload: { kind: 'BID', tricks: 3 },
    };
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      (index % 2 ? a : b).command(player.principal, body),
    ),
  );
  results.forEach((result) => expect(result).toEqual(results[0]));
  expect(await f.db.spadesEvent.count({ where: { roomId: gameId } })).toBe(2);
  await expect(
    a.command(player.principal, {
      ...body,
      payload: { kind: 'BID', tricks: 4 },
    }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  await expect(
    a.command(player.principal, { ...body, commandId: randomUUID() }),
  ).rejects.toMatchObject({
    code: 'STALE_VERSION',
    resync: { view: { stateVersion: 1 } },
  });
  const outsider = await f.actor();
  await expect(a.read(outsider.principal, gameId)).rejects.toMatchObject({
    code: 'ROOM_UNAVAILABLE',
  });
  await expect(
    a.resume(player.principal, { gameId, afterVersion: 999 }),
  ).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
});
it('server continuation deals one fresh round and preserves prior team scores on retry', async () => {
  const { createSpadesMatch, applySpadesMatch, legalSpadesPlays } =
    await import('@deckforge/game-spades');
  const initial = {
    players: f.players.map((player) => player.userId),
    dealer: 0,
    deck: canonicalFaces.map((face) => face.id),
    rules: { ...rules, targetScore: 500 },
  };
  const gameId = await initializeSpadesRoom(f.db, initial),
    service = new SpadesRoomService(f.db);
  let state = createSpadesMatch(
    initial.players,
    0,
    initial.deck,
    initial.rules,
  );
  for (let i = 0; i < 56; i++) {
    const seat = state.phase === 'BIDDING' ? state.toBid : state.deal.toAct;
    const payload =
      state.phase === 'BIDDING'
        ? { kind: 'BID' as const, tricks: 3 }
        : { kind: 'PLAY' as const, face: legalSpadesPlays(state.deal)[0]! };
    await service.command(f.players[seat]!.principal, {
      gameId,
      commandId: randomUUID(),
      stateVersion: state.stateVersion,
      payload,
    });
    state = applySpadesMatch(state, {
      ...payload,
      playerId: initial.players[seat]!,
      expectedVersion: state.stateVersion,
    });
  }
  expect(state.phase).toBe('ROUND_COMPLETE');
  const body = {
    gameId,
    commandId: randomUUID(),
    stateVersion: 56,
    payload: { kind: 'CONTINUE' },
  };
  const next = await service.command(f.players[0]!.principal, body);
  expect(next.view.round).toBe(2);
  expect(next.view.stateVersion).toBe(57);
  expect(next.view.teams).toEqual(state.teams);
  expect(
    await new SpadesRoomService(f.secondDb).command(
      f.players[0]!.principal,
      body,
    ),
  ).toEqual(next);
  const persisted = await f.db.spadesRoom.findUniqueOrThrow({
    where: { id: gameId },
  });
  const snapshot = persisted.snapshot as { deal: { hands: string[][] } };
  expect(new Set(snapshot.deal.hands.flat()).size).toBe(52);
  expect(snapshot.deal.hands.map((hand) => hand.length)).toEqual([
    13, 13, 13, 13,
  ]);
  expect(await f.db.spadesResult.count({ where: { roomId: gameId } })).toBe(0);
}, 40000);
it('SQL prevents tampering and partial snapshots; revoked sessions cannot read', async () => {
  const gameId = await create(),
    service = new SpadesRoomService(f.db),
    player = f.players[3]!;
  await expect(
    f.db.spadesRoom.update({
      where: { id: gameId },
      data: { stateVersion: 1 },
    }),
  ).rejects.toThrow();
  const event = await f.db.spadesEvent.findFirstOrThrow({
    where: { roomId: gameId },
  });
  await expect(
    f.db.spadesEvent.update({
      where: { id: event.id },
      data: { snapshot: {} },
    }),
  ).rejects.toThrow();
  await f.db.authSession.update({
    where: { id: player.principal.sessionId },
    data: { revokedAt: new Date() },
  });
  await expect(service.read(player.principal, gameId)).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});
