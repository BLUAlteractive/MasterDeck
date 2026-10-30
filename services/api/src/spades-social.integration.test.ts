import { beforeAll, afterAll, afterEach, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import {
  spadesRoomViewSchema,
  spadesReceiptSchema,
  spadesPolicyResponseSchema,
} from '@deckforge/contracts';
import { writeCardTransition } from '@deckforge/database';
import { identityFixture } from '../test/auth-fixture';
import { fixtureLoadout } from '../test/funded';
import { LobbyService } from './rooms/lobby';
import { SpadesAdmissionService } from './rooms/spades-admission';
import { SpadesRoomService } from './rooms/spades';
const policy = {
  approvalReference: 'TEST_ONLY_NOT_LAUNCH',
  rules: {
    version: 'SPADES_SOCIAL_FIXTURE',
    nilEnabled: true,
    nilPoints: 100,
    contractPoints: 10,
    bagPoints: 1,
    bagThreshold: 10,
    bagPenalty: 100,
    failedNilCountsAsBags: true,
    failedNilBagPoints: 1,
    targetScore: 1,
  },
};
let f: Awaited<ReturnType<typeof identityFixture>>,
  lobby: LobbyService,
  start: SpadesAdmissionService;
const sockets: Socket[] = [];
const key = () => randomUUID();
beforeAll(async () => {
  f = await identityFixture(null, policy);
  lobby = new LobbyService(f.db, null, policy);
  start = new SpadesAdmissionService(f.db, policy);
  for (const player of f.players) await fixtureLoadout(f.db, player.userId);
});
afterAll(async () => {
  sockets.forEach((socket) => socket.disconnect());
  await f?.close();
});
afterEach(async () => {
  for (const player of f.players)
    await lobby.command(player.principal, {
      action: 'LEAVE',
      commandId: key(),
    });
});
async function setup() {
  const created = await lobby.command(f.players[0]!.principal, {
    action: 'CREATE_PRIVATE',
    mode: 'SPADES',
    capacity: 4,
    commandId: key(),
  });
  for (const player of f.players.slice(1))
    await lobby.command(player.principal, {
      action: 'JOIN_PRIVATE',
      invite: created.invite!,
      commandId: key(),
    });
  for (const player of f.players)
    await lobby.command(player.principal, {
      action: 'READY',
      ready: true,
      commandId: key(),
    });
  return created.lobby!.id;
}
const ack = (socket: Socket, event: string, body: unknown) =>
  socket.timeout(8000).emitWithAck(event, body) as Promise<unknown>;
async function finish(gameId: string, network = false) {
  const rooms = new SpadesRoomService(f.db);
  const clients: Socket[] = [];
  if (network)
    for (const player of f.players) {
      const socket = io(f.base + '/rooms', {
        auth: { token: player.bearer },
        transports: ['websocket'],
        reconnection: false,
        autoConnect: false,
      });
      sockets.push(socket);
      clients.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', () => resolve());
        socket.once('connect_error', reject);
        socket.connect();
      });
      await ack(socket, 'room.join', { gameId });
    }
  let current = await rooms.read(f.players[0]!.principal, gameId);
  for (let i = 0; i < 56; i++) {
    const index = f.players.findIndex(
        (player) => player.userId === current.view.toAct,
      ),
      p = f.players[index]!;
    const own = network
      ? spadesRoomViewSchema.parse(
          await ack(clients[index]!, 'room.join', { gameId }),
        )
      : await rooms.read(p.principal, gameId);
    const legal = own.view.legal!;
    const payload =
      legal.kind === 'BID'
        ? { kind: 'BID', tricks: 3 }
        : legal.kind === 'PLAY'
          ? { kind: 'PLAY', face: legal.cards[0]! }
          : null;
    const command = {
      gameId,
      commandId: key(),
      stateVersion: own.view.stateVersion,
      payload,
    };
    current = network
      ? spadesReceiptSchema.parse(
          await ack(clients[index]!, 'game.command', command),
        )
      : await rooms.command(p.principal, command);
  }
  clients.forEach((client) => client.disconnect());
  expect(current.view.phase).toBe('MATCH_COMPLETE');
  return current;
}
it('same four invited players finish two successive matches with fresh four-way consent and once-only reservations', async () => {
  const published = await f.request('spades/policy', f.players[0]!.bearer);
  expect(
    spadesPolicyResponseSchema.parse(await published.json()).policy,
  ).toEqual(policy);
  const lobbyId = await setup(),
    body = { lobbyId, commandId: key() };
  const response = await f.request('spades/start', f.players[0]!.bearer, body);
  expect(response.status).toBe(200);
  const first = (await response.json()) as { gameId: string };
  expect(
    await f.db.cardInstance.count({
      where: {
        ownerId: { in: f.players.map((player) => player.userId) },
        lockToken: first.gameId,
      },
    }),
  ).toBe(208);
  await finish(first.gameId, true);
  const completed = await lobby.read(f.players[0]!.principal);
  expect(completed.lobby).toMatchObject({
    status: 'OPEN',
    gameId: first.gameId,
  });
  expect(completed.lobby!.members.every((member) => !member.ready)).toBe(true);
  await expect(
    start.start(f.players[0]!.principal, {
      lobbyId,
      commandId: key(),
      rematchOf: first.gameId,
    }),
  ).rejects.toMatchObject({ code: 'LOBBY_NOT_READY' });
  for (const player of f.players)
    await lobby.command(player.principal, {
      action: 'READY',
      ready: true,
      commandId: key(),
    });
  const nextBody = { lobbyId, commandId: key(), rematchOf: first.gameId };
  const other = new SpadesAdmissionService(f.secondDb, policy);
  const retries = await Promise.all(
    Array.from({ length: 5 }, (_, index) =>
      (index % 2 ? start : other).start(f.players[0]!.principal, nextBody),
    ),
  );
  expect(new Set(retries.map((result) => result.gameId)).size).toBe(1);
  expect(retries[0]!.gameId).not.toBe(first.gameId);
  await finish(retries[0]!.gameId, true);
  expect(await f.db.spadesAdmission.count({ where: { lobbyId } })).toBe(2);
  expect(
    await f.db.spadesReservation.count({
      where: { roomId: { in: [first.gameId, retries[0]!.gameId] } },
    }),
  ).toBe(8);
  const cards = await f.db.cardInstance.findMany({
    where: { ownerId: { in: f.players.map((player) => player.userId) } },
  });
  expect(cards).toHaveLength(208);
  expect(
    cards.every(
      (card) =>
        card.status === 'OWNED' &&
        card.stateVersion === 5 &&
        card.lockToken === null,
    ),
  ).toBe(true);
  expect(
    await f.db.spadesResult.count({
      where: { roomId: { in: [first.gameId, retries[0]!.gameId] } },
    }),
  ).toBe(2);
}, 60000);
it('revalidates eligibility atomically and rejects client policy/deck/identity and nonhost starts', async () => {
  const lobbyId = await setup(),
    player = f.players[0]!,
    card = await f.db.cardInstance.findFirstOrThrow({
      where: { ownerId: player.userId },
    }),
    token = key();
  await f.db.$transaction((tx) =>
    writeCardTransition(tx, {
      instanceId: card.id,
      ownerId: player.userId,
      expectedVersion: card.stateVersion,
      command: {
        action: 'LOCK',
        lockToken: token,
        lockReason: 'TEST_CONFLICT',
      },
      operatorId: 'test.spades',
      sourceKey: key(),
      reason: 'ISOLATED_TEST',
    }),
  );
  await expect(
    start.start(player.principal, { lobbyId, commandId: key() }),
  ).rejects.toMatchObject({ code: 'INVALID_LOADOUT' });
  expect(await f.db.spadesAdmission.count({ where: { lobbyId } })).toBe(0);
  await f.db.$transaction((tx) =>
    writeCardTransition(tx, {
      instanceId: card.id,
      ownerId: player.userId,
      expectedVersion: card.stateVersion + 1,
      command: { action: 'UNLOCK', lockToken: token },
      operatorId: 'test.spades',
      sourceKey: key(),
      reason: 'ISOLATED_TEST',
    }),
  );
  await expect(
    start.start(f.players[1]!.principal, { lobbyId, commandId: key() }),
  ).rejects.toMatchObject({ code: 'LOBBY_UNAVAILABLE' });
  await expect(
    start.start(player.principal, { lobbyId, commandId: key(), deck: [] }),
  ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  await expect(
    new SpadesAdmissionService(f.db).start(player.principal, {
      lobbyId,
      commandId: key(),
    }),
  ).rejects.toMatchObject({ code: 'SPADES_POLICY_NOT_CONFIGURED' });
});
it('safe table messages are preset-only, idempotent, rate limited and paused during play; active reservations cannot be unlocked', async () => {
  const lobbyId = await setup(),
    p = f.players[2]!,
    body = { action: 'SAY', commandId: key(), code: 'HELLO' };
  const values = await Promise.all(
    Array.from({ length: 5 }, () => lobby.command(p.principal, body)),
  );
  values.forEach((value) => expect(value).toEqual(values[0]));
  expect(await f.db.tableMessage.count({ where: { lobbyId } })).toBe(1);
  await expect(
    lobby.command(p.principal, {
      action: 'SAY',
      commandId: key(),
      code: 'THANKS',
    }),
  ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  await expect(
    lobby.command(p.principal, {
      action: 'SAY',
      commandId: key(),
      code: 'HELLO',
      text: 'free text',
    }),
  ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  const game = await start.start(f.players[0]!.principal, {
    lobbyId,
    commandId: key(),
  });
  await expect(
    lobby.command(f.players[1]!.principal, {
      action: 'SAY',
      commandId: key(),
      code: 'GOOD_GAME',
    }),
  ).rejects.toMatchObject({ code: 'TABLE_MESSAGES_PAUSED' });
  const card = await f.db.cardInstance.findFirstOrThrow({
    where: { lockToken: game.gameId },
  });
  await expect(
    f.db.$transaction((tx) =>
      writeCardTransition(tx, {
        instanceId: card.id,
        ownerId: card.ownerId,
        expectedVersion: card.stateVersion,
        command: { action: 'UNLOCK', lockToken: game.gameId },
        operatorId: 'test.spades',
        sourceKey: key(),
        reason: 'SHOULD_FAIL',
      }),
    ),
  ).rejects.toThrow();
  await expect(
    f.db.lobby.update({ where: { id: lobbyId }, data: { status: 'OPEN' } }),
  ).rejects.toThrow();
  await finish(game.gameId);
  const message = await f.db.tableMessage.findFirstOrThrow({
    where: { lobbyId },
  });
  await expect(
    f.db.tableMessage.update({
      where: { id: message.id },
      data: { code: 'THANKS' },
    }),
  ).rejects.toThrow();
}, 40000);
it('frozen policy snapshot prevents same-version retuning before start and SQL rejects changing it', async () => {
  const lobbyId = await setup();
  const altered = { ...policy, rules: { ...policy.rules, targetScore: 2 } };
  await expect(
    new SpadesAdmissionService(f.db, altered).start(f.players[0]!.principal, {
      lobbyId,
      commandId: key(),
    }),
  ).rejects.toMatchObject({ code: 'SPADES_POLICY_CHANGED' });
  await expect(
    f.db.lobby.update({
      where: { id: lobbyId },
      data: { rulesConfig: altered },
    }),
  ).rejects.toThrow();
  expect(
    (await lobby.read(f.players[0]!.principal)).lobby!.spadesRules,
  ).toEqual(policy.rules);
});
