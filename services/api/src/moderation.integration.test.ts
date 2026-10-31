import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { identityFixture } from '../test/auth-fixture';
import { fixtureAdmin } from '../test/admin-fixture';
import { ModerationService } from './admin/moderation';
import { LobbyService } from './rooms/lobby';
import { initializePokerRoom, PokerRoomService } from './rooms/service';
let f: Awaited<ReturnType<typeof identityFixture>>,
  s: ModerationService,
  staff: Awaited<ReturnType<typeof fixtureAdmin>>,
  gameId: string;
const key = () => ({ commandId: randomUUID() }),
  audit = () => ({ ...key(), reason: 'Isolated moderation acceptance' });
beforeAll(async () => {
  f = await identityFixture();
  s = new ModerationService(f.auth);
  staff = await fixtureAdmin(f, ['SUPPORT']);
  gameId = await initializePokerRoom(f.db, {
    players: f.players.slice(0, 2).map((p) => ({ id: p.userId, stack: 100 })),
    dealer: 0,
    smallBlind: 1,
    bigBlind: 2,
  });
}, 30000);
afterAll(async () => {
  await f?.close();
});
it('allows only participants to report a versioned match and replay the same immutable receipt concurrently', async () => {
  const p = f.players[0]!,
    input = {
      ...key(),
      game: 'POKER',
      gameId,
      action: 'REPORT',
      code: 'RESULT_INCONSISTENT',
    };
  const receipts = await Promise.all(
    Array.from({ length: 10 }, () => s.command(p.principal, input)),
  );
  for (const r of receipts) expect(r).toEqual(receipts[0]);
  expect(await f.db.gameReport.count({ where: { gameId } })).toBe(1);
  await expect(
    s.command(f.players[2]!.principal, { ...input, ...key() }),
  ).rejects.toMatchObject({ code: 'ROOM_UNAVAILABLE' });
  await expect(
    s.command(p.principal, { ...input, code: 'COLLUSION' }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  expect((await s.context(p.principal, 'POKER', gameId)).reports).toHaveLength(
    1,
  );
  await expect(
    f.db.gameReport.deleteMany({ where: { gameId } }),
  ).rejects.toThrow();
});
it('blocks future private/public admissions without changing a current hand and supports explicit unblock', async () => {
  const [p, q] = f.players,
    rooms = new PokerRoomService(f.db),
    before = await rooms.read(p!.principal, gameId),
    input = {
      ...key(),
      action: 'SET_BLOCK',
      game: 'POKER',
      gameId,
      targetUserId: q!.userId,
      blocked: true,
    };
  await Promise.all(
    Array.from({ length: 10 }, () => s.command(p!.principal, input)),
  );
  expect(
    await f.db.userBlock.findUnique({
      where: {
        userId_targetUserId: { userId: p!.userId, targetUserId: q!.userId },
      },
    }),
  ).toMatchObject({ active: true, version: 1 });
  expect((await rooms.read(p!.principal, gameId)).view).toEqual(before.view);
  const lobbies = new LobbyService(f.db),
    privateLobby = await lobbies.command(p!.principal, {
      ...key(),
      action: 'CREATE_PRIVATE',
      capacity: 2,
    });
  await expect(
    lobbies.command(q!.principal, {
      ...key(),
      action: 'JOIN_PRIVATE',
      invite: privateLobby.invite,
    }),
  ).rejects.toMatchObject({ code: 'GROUP_UNAVAILABLE' });
  await lobbies.command(p!.principal, { ...key(), action: 'LEAVE' });
  const queued = await lobbies.command(p!.principal, {
      ...key(),
      action: 'QUEUE',
    }),
    other = await lobbies.command(q!.principal, { ...key(), action: 'QUEUE' });
  expect(other.lobby!.id).not.toBe(queued.lobby!.id);
  for (const player of [p!, q!])
    await lobbies.command(player.principal, { ...key(), action: 'LEAVE' });
  await expect(
    f.db.userBlock.update({
      where: {
        userId_targetUserId: { userId: p!.userId, targetUserId: q!.userId },
      },
      data: { active: false, version: { increment: 1 } },
    }),
  ).rejects.toThrow();
  await s.command(p!.principal, { ...input, ...key(), blocked: false });
  expect(
    (await s.context(p!.principal, 'POKER', gameId)).participants[0]!.blocked,
  ).toBe(false);
  await expect(
    s.command(p!.principal, {
      ...input,
      ...key(),
      targetUserId: f.players[2]!.userId,
    }),
  ).rejects.toMatchObject({ code: 'PARTICIPANT_UNAVAILABLE' });
}, 30000);
it('reconstructs disputes behind current scoped MFA with immutable read audit and no hidden-card payload', async () => {
  const command = { ...audit(), action: 'INSPECT', game: 'POKER', gameId };
  await expect(s.admin(f.players[0]!.principal, command)).rejects.toMatchObject(
    { code: 'FORBIDDEN' },
  );
  const result = (await s.admin(staff.principal, command)) as {
    consistent: boolean;
    stateVersion: number;
    eventCount: number;
  };
  expect(result).toMatchObject({
    consistent: true,
    stateVersion: 0,
    eventCount: 1,
  });
  const text = JSON.stringify(result);
  for (const field of ['"deck"', '"hole"', '"snapshot"', '"token"'])
    expect(text).not.toContain(field);
  expect(await s.admin(staff.principal, command)).toEqual(result);
  expect(
    await f.db.adminAction.count({
      where: { scope: gameId, action: 'INSPECT' },
    }),
  ).toBe(1);
  const report = await f.db.gameReport.findFirstOrThrow({ where: { gameId } });
  expect(
    await s.admin(staff.principal, {
      ...audit(),
      action: 'REVIEW_REPORT',
      reportId: report.id,
      decision: 'ESCALATE',
    }),
  ).toEqual({ reportId: report.id, decision: 'ESCALATE' });
});
it('suspends and removes queued users, revokes sessions and preserves match evidence; reinstatement cannot revive old tokens', async () => {
  const [p, q] = f.players,
    lobbies = new LobbyService(f.db),
    created = await lobbies.command(p!.principal, {
      ...key(),
      action: 'CREATE_PRIVATE',
      capacity: 2,
    });
  await lobbies.command(q!.principal, {
    ...key(),
    action: 'JOIN_PRIVATE',
    invite: created.invite,
  });
  await s.admin(staff.principal, {
    ...audit(),
    action: 'SUSPEND',
    targetUserId: p!.userId,
  });
  expect(
    await f.db.lobbySeat.count({ where: { lobbyId: created.lobby!.id } }),
  ).toBe(0);
  expect((await f.request('me', p!.bearer)).status).toBe(401);
  await expect(
    lobbies.command(p!.principal, { ...key(), action: 'QUEUE' }),
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  expect(await f.db.gameEvent.count({ where: { roomId: gameId } })).toBe(1);
  await s.admin(staff.principal, {
    ...audit(),
    action: 'REINSTATE',
    targetUserId: p!.userId,
  });
  expect(
    (await f.db.user.findUniqueOrThrow({ where: { id: p!.userId } })).status,
  ).toBe('ACTIVE');
  expect((await f.request('me', p!.bearer)).status).toBe(401);
});
