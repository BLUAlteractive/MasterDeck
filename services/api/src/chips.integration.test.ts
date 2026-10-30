import { beforeAll, afterAll, it, expect } from 'vitest';
import { io } from 'socket.io-client';
import { randomUUID } from 'node:crypto';
import { identityFixture } from '../test/auth-fixture';
import { fixtureLoadout } from '../test/funded';
import { issueEarnedChips, transferChips } from './rooms/chips';
import { LobbyService } from './rooms/lobby';
import {
  MatchSettlementService,
  type ClassicAdmissionPolicy,
} from './rooms/settlement';
import { PokerRoomService } from './rooms/service';
const policy: ClassicAdmissionPolicy = {
  version: 'ISOLATED_CLASSIC_TEST_V1',
  approvalReference: 'fixture-only-not-launch-approval',
  buyIn: 100,
  smallBlind: 1,
  bigBlind: 2,
  turnTimeoutMs: 30000,
};
let f: Awaited<ReturnType<typeof identityFixture>>,
  a: MatchSettlementService,
  b: MatchSettlementService,
  lobbies: LobbyService,
  rooms: PokerRoomService;
beforeAll(async () => {
  f = await identityFixture(policy);
  a = new MatchSettlementService(f.db, policy);
  b = new MatchSettlementService(f.secondDb, policy);
  lobbies = new LobbyService(f.db);
  rooms = new PokerRoomService(f.db);
  for (const p of f.players) await fixtureLoadout(f.db, p.userId);
  for (const p of f.players.slice(0, 2))
    await f.db.$transaction((tx) =>
      issueEarnedChips(tx, {
        userId: p.userId,
        amount: 500n,
        sourceKey: 'fixture-opening:' + p.userId,
        operatorId: 'test.earned-only-fixture',
      }),
    );
}, 30000);
afterAll(async () => {
  await f?.close();
});
async function lobby(offset = 0) {
  const [p, q] = f.players.slice(offset, offset + 2);
  const created = await lobbies.command(p!.principal, {
    action: 'CREATE_PRIVATE',
    capacity: 2,
    commandId: randomUUID(),
  });
  await lobbies.command(q!.principal, {
    action: 'JOIN_PRIVATE',
    invite: created.invite,
    commandId: randomUUID(),
  });
  for (const player of [p!, q!])
    await lobbies.command(player.principal, {
      action: 'READY',
      ready: true,
      commandId: randomUUID(),
    });
  return created.lobby!.id;
}
async function fold(gameId: string) {
  const state = await rooms.read(f.players[0]!.principal, gameId);
  const p = f.players.find((p) => p.userId === state.view.toAct)!;
  await rooms.command(p.principal, {
    gameId,
    stateVersion: state.view.stateVersion,
    commandId: randomUUID(),
    payload: { action: 'FOLD' },
  });
}
it('keeps earned issuance source-idempotent and reconciles signed accounts to zero', async () => {
  const p = f.players[0]!,
    input = {
      userId: p.userId,
      amount: 500n,
      sourceKey: 'fixture-opening:' + p.userId,
      operatorId: 'test.earned-only-fixture',
    };
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      f.db.$transaction((tx) => issueEarnedChips(tx, input)),
    ),
  );
  expect(new Set(results.map((r) => r.id)).size).toBe(1);
  expect((await a.balance(p.principal)).balance).toBe('500');
  await expect(
    f.db.$transaction((tx) => issueEarnedChips(tx, { ...input, amount: 501n })),
  ).rejects.toMatchObject({ code: 'LEDGER_SOURCE_CONFLICT' });
  expect(await a.audit()).toEqual({
    balanced: true,
    mismatches: 0,
    total: '0',
  });
});
it('reserves one funded hand despite concurrent start keys and snapshots exactly 52 cards each', async () => {
  const lobbyId = await lobby(),
    p = f.players[0]!,
    body = { lobbyId, commandId: randomUUID() };
  const starts = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      (i % 2 ? a : b).start(p.principal, body),
    ),
  );
  const gameId = starts[0]!.gameId;
  expect(starts.every((r) => r.gameId === gameId)).toBe(true);
  expect(await f.db.gameAdmission.count({ where: { lobbyId } })).toBe(1);
  expect(
    (await f.db.gameAdmission.findUniqueOrThrow({ where: { roomId: gameId } }))
      .policySnapshot,
  ).toEqual(policy);
  expect(
    (
      await f.db.playChipAccount.findUniqueOrThrow({
        where: { roomId: gameId },
      })
    ).balance,
  ).toBe(200n);
  const snapshots = await f.db.gameReservation.findMany({
    where: { roomId: gameId },
  });
  expect(snapshots).toHaveLength(2);
  for (const row of snapshots)
    expect(row.snapshot as unknown[]).toHaveLength(52);
  expect(
    await f.db.cardInstance.count({
      where: { lockToken: gameId, status: 'LOCKED' },
    }),
  ).toBe(104);
  await expect(
    lobbies.command(p.principal, { action: 'LEAVE', commandId: randomUUID() }),
  ).rejects.toMatchObject({ code: 'GAME_IN_PROGRESS' });
  await expect(a.finish(p.principal, { gameId })).rejects.toMatchObject({
    code: 'HAND_IN_PROGRESS',
  });
  await fold(gameId);
  await a.finish(p.principal, { gameId });
});
it('ten parallel finishes credit once, preserve conservation and restore card eligibility', async () => {
  const lobbyId = await lobby(),
    p = f.players[0]!,
    { gameId } = await a.start(p.principal, {
      lobbyId,
      commandId: randomUUID(),
    });
  const client = io(f.base + '/rooms', {
    transports: ['websocket'],
    reconnection: false,
    autoConnect: false,
    auth: { token: p.bearer },
  });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('socket timeout')), 5000);
    client.once('connect', () => {
      clearTimeout(t);
      resolve();
    });
    client.once('connect_error', (e) => {
      clearTimeout(t);
      reject(e);
    });
    client.connect();
  });
  await client.timeout(5000).emitWithAck('room.join', { gameId });
  const delivery = new Promise<{
    settled: boolean;
    view: { players: { id: string; hole: unknown }[] };
  }>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('settlement timeout')), 5000);
    client.once('game.settled', (value) => {
      clearTimeout(t);
      resolve(value);
    });
  });
  await fold(gameId);
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      (i % 2 ? a : b).finish(f.players[i % 2]!.principal, { gameId }),
    ),
  );
  for (const r of results) expect(r).toEqual(results[0]);
  expect(await f.db.gameResult.count({ where: { roomId: gameId } })).toBe(1);
  expect(
    await f.db.playChipTransfer.count({
      where: { sourceKey: 'game:' + gameId + ':settle' },
    }),
  ).toBe(1);
  expect(
    (
      await f.db.playChipAccount.findUniqueOrThrow({
        where: { roomId: gameId },
      })
    ).balance,
  ).toBe(0n);
  expect(await f.db.cardInstance.count({ where: { lockToken: gameId } })).toBe(
    0,
  );
  const balances = await Promise.all(
    f.players.slice(0, 2).map((p) => a.balance(p.principal)),
  );
  expect(balances.reduce((n, p) => n + BigInt(p.balance), 0n)).toBe(1000n);
  const delivered = await delivery;
  expect(delivered.settled).toBe(true);
  expect(
    delivered.view.players.find((player) => player.id === f.players[1]!.userId)!
      .hole,
  ).toBe(null);
  client.disconnect();
  expect(await a.audit()).toEqual({
    balanced: true,
    mismatches: 0,
    total: '0',
  });
});
it('rejects insufficient funds atomically without a room, reservation or locked card', async () => {
  const lobbyId = await lobby(2),
    p = f.players[2]!;
  await expect(
    a.start(p.principal, { lobbyId, commandId: randomUUID() }),
  ).rejects.toMatchObject({ code: 'INSUFFICIENT_PLAY_CHIPS' });
  expect(await f.db.gameAdmission.count({ where: { lobbyId } })).toBe(0);
  expect(
    await f.db.cardInstance.count({
      where: { ownerId: p.userId, status: 'LOCKED' },
    }),
  ).toBe(0);
  expect((await a.balance(p.principal)).balance).toBe('0');
  await lobbies.command(p.principal, {
    action: 'LEAVE',
    commandId: randomUUID(),
  });
});
it('enforces host/member permissions, server-selected stakes and no public chip-grant route', async () => {
  const lobbyId = await lobby();
  await expect(
    a.start(f.players[1]!.principal, { lobbyId, commandId: randomUUID() }),
  ).rejects.toMatchObject({ code: 'LOBBY_UNAVAILABLE' });
  await expect(
    a.start(f.players[0]!.principal, {
      lobbyId,
      commandId: randomUUID(),
      buyIn: 1,
    }),
  ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  expect((await f.request('play-chips')).status).toBe(401);
  expect(
    (
      await f.request('play-chips/grant', f.players[0]!.bearer, {
        amount: '999',
      })
    ).status,
  ).toBe(404);
  const response = await f.request('games/start', f.players[0]!.bearer, {
    lobbyId,
    commandId: randomUUID(),
  });
  expect(response.status).toBe(200);
  const { gameId } = (await response.json()) as { gameId: string };
  await expect(
    a.finish(f.players[3]!.principal, { gameId }),
  ).rejects.toMatchObject({ code: 'ROOM_UNAVAILABLE' });
  await fold(gameId);
  expect(
    (await f.request('games/finish', f.players[0]!.bearer, { gameId })).status,
  ).toBe(200);
});
it('rolls every payout, card unlock and result back if final result persistence fails', async () => {
  const lobbyId = await lobby(),
    p = f.players[0]!,
    { gameId } = await a.start(p.principal, {
      lobbyId,
      commandId: randomUUID(),
    });
  await f.db.$executeRawUnsafe(
    `CREATE FUNCTION fixture_result_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."roomId"='${gameId}'::uuid THEN RAISE EXCEPTION 'fixture';END IF;RETURN NEW;END $$`,
  );
  await f.db.$executeRawUnsafe(
    'CREATE TRIGGER fixture_result_failure BEFORE INSERT ON "GameResult" FOR EACH ROW EXECUTE FUNCTION fixture_result_failure()',
  );
  await fold(gameId);
  try {
    await expect(a.finish(p.principal, { gameId })).rejects.toThrow();
    expect(
      (
        await f.db.playChipAccount.findUniqueOrThrow({
          where: { roomId: gameId },
        })
      ).balance,
    ).toBe(200n);
    expect(
      await f.db.cardInstance.count({
        where: { lockToken: gameId, status: 'LOCKED' },
      }),
    ).toBe(104);
    expect(await f.db.gameResult.count({ where: { roomId: gameId } })).toBe(0);
  } finally {
    await f.db.$executeRawUnsafe(
      'DROP TRIGGER fixture_result_failure ON "GameResult"',
    );
    await f.db.$executeRawUnsafe('DROP FUNCTION fixture_result_failure()');
  }
  await b.finish(p.principal, { gameId });
  expect(await a.audit()).toEqual({
    balanced: true,
    mismatches: 0,
    total: '0',
  });
});
it('recovers a disconnected completed match from durable state after service restart', async () => {
  const lobbyId = await lobby(),
    p = f.players[0]!,
    { gameId } = await a.start(p.principal, {
      lobbyId,
      commandId: randomUUID(),
    });
  await fold(gameId);
  await new MatchSettlementService(f.secondDb).recover();
  const result = await b.finish(p.principal, { gameId });
  expect(result.stateVersion).toBe(1);
  expect(result.allocation.players.reduce((n, p) => n + p.finalStack, 0)).toBe(
    200,
  );
  expect(
    await f.db.playChipTransfer.count({
      where: { sourceKey: 'game:' + gameId + ':settle' },
    }),
  ).toBe(1);
});
it('protects immutable ledger/results and rejects balance changes without ledger entries', async () => {
  const p = f.players[0]!,
    account = await f.db.playChipAccount.findUniqueOrThrow({
      where: { userId: p.userId },
    }),
    transfer = await f.db.playChipTransfer.findFirstOrThrow();
  await expect(
    f.db.playChipAccount.update({
      where: { id: account.id },
      data: { balance: { increment: 1n } },
    }),
  ).rejects.toThrow();
  await expect(
    f.db.playChipTransfer.update({
      where: { id: transfer.id },
      data: { operatorId: 'tampered' },
    }),
  ).rejects.toThrow();
  const entry = await f.db.playChipEntry.findFirstOrThrow();
  await expect(
    f.db.playChipEntry.delete({
      where: {
        transferId_accountId: {
          transferId: entry.transferId,
          accountId: entry.accountId,
        },
      },
    }),
  ).rejects.toThrow();
  await expect(
    f.db.playChipTransfer.create({
      data: {
        id: randomUUID(),
        sourceKey: randomUUID(),
        requestHash: '0'.repeat(64),
        kind: 'SETTLE',
        operatorId: 'test.unbalanced',
      },
    }),
  ).rejects.toThrow();
  const result = await f.db.gameResult.findFirstOrThrow();
  await expect(
    f.db.gameResult.update({
      where: { roomId: result.roomId },
      data: { allocation: { tampered: true } },
    }),
  ).rejects.toThrow();
  expect(await a.audit()).toEqual({
    balanced: true,
    mismatches: 0,
    total: '0',
  });
});

it('preserves exact balances and idempotency across 100 generated earned-only fixture grants', async () => {
  const user = f.players[2]!,
    before = BigInt((await a.balance(user.principal)).balance);
  let seed = 18227,
    total = 0n;
  for (let i = 0; i < 100; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const amount = BigInt(1 + (seed % 1000)),
      input = {
        userId: user.userId,
        amount,
        sourceKey: 'fixture-property:' + user.userId + ':' + i,
        operatorId: 'test.generated-earned-fixture',
      };
    const first = await f.db.$transaction((tx) => issueEarnedChips(tx, input));
    const replay = await f.db.$transaction((tx) => issueEarnedChips(tx, input));
    expect(replay.id).toBe(first.id);
    total += amount;
  }
  expect(BigInt((await a.balance(user.principal)).balance)).toBe(
    before + total,
  );
  expect(await a.audit()).toEqual({
    balanced: true,
    mismatches: 0,
    total: '0',
  });
  const first = await f.db.playChipAccount.findUniqueOrThrow({
      where: { userId: f.players[0]!.userId },
    }),
    second = await f.db.playChipAccount.findUniqueOrThrow({
      where: { userId: f.players[1]!.userId },
    });
  await expect(
    f.db.$transaction((tx) =>
      transferChips(tx, {
        kind: 'EARNED_GRANT',
        sourceKey: randomUUID(),
        operatorId: 'test.invalid-player-transfer',
        entries: [
          { accountId: first.id, amount: -1n },
          { accountId: second.id, amount: 1n },
        ],
      }),
    ),
  ).rejects.toThrow();
  expect(await a.audit()).toEqual({
    balanced: true,
    mismatches: 0,
    total: '0',
  });
}, 30000);
