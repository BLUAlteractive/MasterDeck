import { beforeAll, afterAll, afterEach, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { identityFixture } from '../test/auth-fixture';
import { fixtureLoadout } from '../test/funded';
import { LobbyService } from './rooms/lobby';
import { MatchSettlementService } from './rooms/settlement';
import { issueEarnedChips } from './rooms/chips';
import { hash, json } from './rooms/shared';
const policy = {
  version: 'MODES_FIXTURE_ONLY',
  approvalReference: 'TEST_ONLY_NOT_LAUNCH',
  buyIn: 100,
  smallBlind: 1,
  bigBlind: 2,
  turnTimeoutMs: 30000,
};
let fixture: Awaited<ReturnType<typeof identityFixture>>, lobbies: LobbyService;
beforeAll(async () => {
  fixture = await identityFixture(policy);
  lobbies = new LobbyService(fixture.db, policy);
  for (const player of fixture.players.slice(0, 2)) {
    await fixtureLoadout(fixture.db, player.userId);
    await fixture.db.$transaction((tx) =>
      issueEarnedChips(tx, {
        userId: player.userId,
        amount: 500n,
        sourceKey: 'modes-fixture-' + player.userId,
        operatorId: 'test.modes',
      }),
    );
  }
});
afterAll(async () => {
  await fixture?.close();
});
const key = () => randomUUID();
async function clear() {
  for (const player of fixture.players)
    await lobbies.command(player.principal, {
      action: 'LEAVE',
      commandId: key(),
    });
}
afterEach(clear);
it('concurrent public queues separate modes and immutable selected versions across servers', async () => {
  const other = new LobbyService(fixture.secondDb, policy);
  const joined = await Promise.all(
    fixture.players.map((player, index) =>
      (index % 2 ? other : lobbies).command(player.principal, {
        action: 'QUEUE',
        mode: index < 2 ? 'CLASSIC' : 'EVOLVED',
        commandId: key(),
      }),
    ),
  );
  // Earlier auth fixtures may leave an open Classic seat; each Classic join may fill a different valid table.
  expect(joined[0]!.lobby!.mode).toBe('CLASSIC');
  expect(joined[1]!.lobby!.mode).toBe('CLASSIC');
  expect(joined[1]!.lobby!.id).not.toBe(joined[2]!.lobby!.id);
  expect(joined[2]!.lobby!.id).toBe(joined[3]!.lobby!.id);
  expect(joined[0]!.lobby!.id).not.toBe(joined[2]!.lobby!.id);
  expect(joined[0]!.lobby!.rulesetVersion).toBe('CLASSIC_NLHE_V1');
  expect(joined[2]!.lobby).toMatchObject({
    mode: 'EVOLVED',
    rulesetVersion: 'EVOLVED_A_EXPERIMENTAL_V1',
    canStart: false,
    admission: 'BALANCE_REVIEW_REQUIRED',
  });
  await expect(
    fixture.db.lobby.update({
      where: { id: joined[0]!.lobby!.id },
      data: { mode: 'EVOLVED', rulesetVersion: 'EVOLVED_A_EXPERIMENTAL_V1' },
    }),
  ).rejects.toThrow();
});
it('private invite inherits host mode; HTTP rejects spoofed versions and extra join mode', async () => {
  const [host, guest] = fixture.players;
  const response = await fixture.request('lobby/commands', host!.bearer, {
    action: 'CREATE_PRIVATE',
    mode: 'EVOLVED',
    capacity: 2,
    commandId: key(),
  });
  expect(response.status).toBe(200);
  const created = (await response.json()) as {
    invite: string;
    lobby: { id: string };
  };
  const joined = await fixture.request('lobby/commands', guest!.bearer, {
    action: 'JOIN_PRIVATE',
    invite: created.invite,
    commandId: key(),
  });
  expect(joined.status).toBe(200);
  expect(
    ((await joined.json()) as { lobby: { mode: string } }).lobby.mode,
  ).toBe('EVOLVED');
  expect(
    (
      await fixture.request('lobby/commands', fixture.players[2]!.bearer, {
        action: 'QUEUE',
        mode: 'CLASSIC',
        rulesetVersion: 'EVOLVED_A_EXPERIMENTAL_V1',
        commandId: key(),
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await fixture.request('lobby/commands', fixture.players[2]!.bearer, {
        action: 'JOIN_PRIVATE',
        mode: 'CLASSIC',
        invite: created.invite,
        commandId: key(),
      })
    ).status,
  ).toBe(400);
  await expect(
    fixture.db.lobby.update({
      where: { id: created.lobby.id },
      data: { status: 'STARTED' },
    }),
  ).rejects.toThrow();
});
it('funded ready Evolved seats cannot enter Classic admission or reserve balances/cards', async () => {
  const [a, b] = fixture.players;
  for (const player of [a!, b!]) {
    await lobbies.command(player.principal, {
      action: 'QUEUE',
      mode: 'EVOLVED',
      commandId: key(),
    });
  }
  for (const player of [a!, b!])
    await lobbies.command(player.principal, {
      action: 'READY',
      ready: true,
      commandId: key(),
    });
  const view = await lobbies.read(a!.principal);
  expect(view.lobby!.canStart).toBe(false);
  expect(view.lobby!.members.every((member) => member.ready)).toBe(true);
  const host = fixture.players.find(
    (player) => player.userId === view.lobby!.hostId,
  )!;
  await expect(
    new MatchSettlementService(fixture.db, policy).start(host.principal, {
      lobbyId: view.lobby!.id,
      commandId: key(),
    }),
  ).rejects.toMatchObject({ code: 'LOBBY_NOT_READY' });
  expect(
    await fixture.db.gameAdmission.count({
      where: { lobbyId: view.lobby!.id },
    }),
  ).toBe(0);
  expect(
    await fixture.db.cardInstance.count({
      where: { ownerId: { in: [a!.userId, b!.userId] }, status: 'LOCKED' },
    }),
  ).toBe(0);
});
it('legacy no-mode command hashes and receipts still retry as Classic', async () => {
  const player = fixture.players[0]!,
    body = { action: 'QUEUE', commandId: key() };
  const receipt = await lobbies.command(player.principal, body);
  const oldLobby = { ...receipt.lobby! } as Record<string, unknown>;
  delete oldLobby.rulesetVersion;
  delete oldLobby.admission;
  delete oldLobby.status;
  const legacy = { action: 'QUEUE', commandId: key() };
  await fixture.db.operationRecord.create({
    data: {
      userId: player.userId,
      operation: 'LOBBY',
      key: legacy.commandId,
      requestHash: hash(legacy),
      result: json({ lobby: oldLobby, invite: null }),
    },
  });
  const retried = await lobbies.command(player.principal, legacy);
  expect(retried.lobby!.mode).toBe('CLASSIC');
  expect(retried.lobby!.rulesetVersion).toBe('CLASSIC_NLHE_V1');
});
it('SQL rejects a mismatched mode/version pair on insertion', async () => {
  await expect(
    fixture.db.lobby.create({
      data: {
        id: randomUUID(),
        kind: 'PUBLIC',
        mode: 'CLASSIC',
        rulesetVersion: 'EVOLVED_A_EXPERIMENTAL_V1',
        capacity: 2,
        hostId: fixture.players[0]!.userId,
      },
    }),
  ).rejects.toThrow();
});
it('started Classic lobby exposes its actual status and authorized game ID with fixed rules', async () => {
  const [a, b] = fixture.players;
  for (const player of [a!, b!])
    if (
      !(await fixture.db.loadout.findUnique({
        where: { userId: player.userId },
      }))
    )
      await fixtureLoadout(fixture.db, player.userId);
  const created = await lobbies.command(a!.principal, {
    action: 'CREATE_PRIVATE',
    mode: 'CLASSIC',
    capacity: 2,
    commandId: key(),
  });
  await lobbies.command(b!.principal, {
    action: 'JOIN_PRIVATE',
    invite: created.invite!,
    commandId: key(),
  });
  for (const player of [a!, b!])
    await lobbies.command(player.principal, {
      action: 'READY',
      ready: true,
      commandId: key(),
    });
  const settlement = new MatchSettlementService(fixture.db, policy),
    started = await settlement.start(a!.principal, {
      lobbyId: created.lobby!.id,
      commandId: key(),
    });
  const current = await lobbies.read(a!.principal);
  expect(current.lobby).toMatchObject({
    status: 'STARTED',
    gameId: started.gameId,
    mode: 'CLASSIC',
    rulesetVersion: 'CLASSIC_NLHE_V1',
    canStart: false,
  });
  const { PokerRoomService } = await import('./rooms/service');
  const rooms = new PokerRoomService(fixture.db);
  const state = await rooms.read(a!.principal, started.gameId);
  const actor = fixture.players.find(
    (player) => player.userId === state.view.toAct,
  )!;
  await rooms.command(actor.principal, {
    gameId: started.gameId,
    commandId: key(),
    stateVersion: state.view.stateVersion,
    payload: { action: 'FOLD' },
  });
  await settlement.complete(started.gameId);
});
