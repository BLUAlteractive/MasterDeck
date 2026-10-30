import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { identityFixture } from '../test/auth-fixture';
import { fixtureLoadout } from '../test/funded';
import { issueEarnedChips } from './rooms/chips';
import {
  MatchSettlementService,
  type ClassicAdmissionPolicy,
} from './rooms/settlement';
import { PokerRoomService } from './rooms/service';
import { TournamentService } from './events/tournaments';
import type { TournamentPolicy } from '@deckforge/contracts';
const admission: ClassicAdmissionPolicy = {
  version: 'TEST_TOURNAMENT_CLASSIC',
  approvalReference: 'isolated-test-only',
  buyIn: 100,
  smallBlind: 1,
  bigBlind: 2,
  turnTimeoutMs: 300000,
};
const policy: TournamentPolicy = {
  version: 'TEST_TOURNAMENT_V1',
  approvalReference: 'isolated-test-only',
  format: 'CLASSIC_HEADS_UP_SINGLE_HAND_V1',
  prize: 'PRESTIGE_TITLE',
  workers: false,
  disputeWindowHours: 24,
};
let f: Awaited<ReturnType<typeof identityFixture>>,
  a: TournamentService,
  b: TournamentService,
  admin: Awaited<
    ReturnType<Awaited<ReturnType<typeof identityFixture>>['actor']>
  >,
  players: (typeof admin)[],
  tournamentId: string;
beforeAll(async () => {
  f = await identityFixture(admission, null, null, {
    tournamentPolicy: policy,
  });
  a = new TournamentService(f.db, policy, admission);
  b = new TournamentService(f.secondDb, policy, admission);
  admin = await f.actor(false, 'aal2');
  await f.db.user.update({
    where: { id: admin.userId },
    data: { role: 'ADMIN' },
  });
  players = [];
  for (let i = 0; i < 4; i++) {
    const p = await f.actor(false);
    players.push(p);
    await fixtureLoadout(f.db, p.userId);
    await f.db.$transaction((tx) =>
      issueEarnedChips(tx, {
        userId: p.userId,
        amount: 1000n,
        sourceKey: 'tournament-fixture:' + p.userId,
        operatorId: 'test.only',
      }),
    );
  }
}, 30000);
afterAll(async () => {
  await f?.close();
});
const key = () => ({ commandId: randomUUID() });
async function create(capacity: 2 | 4 = 4, delay = 1500) {
  const input = {
    ...key(),
    reason: 'Isolated tournament acceptance',
    name: 'Fixture free bracket',
    capacity,
    startsAt: new Date(Date.now() + delay).toISOString(),
    title: 'Fixture Champion',
  };
  const created = (await a.create(admin.principal, input)) as { id: string };
  return { id: created.id, input };
}
async function finishMatch(matchId: string) {
  const match = await f.db.tournamentMatch.findUniqueOrThrow({
      where: { id: matchId },
    }),
    entries = await f.db.tournamentEntry.findMany({
      where: { id: { in: [match.leftEntryId!, match.rightEntryId!] } },
    }),
    members = entries.map((e) => players.find((p) => p.userId === e.userId)!);
  await expect(
    a.ready(members[0]!.principal, matchId, {
      ...key(),
      attempt: match.attempt + 1,
    }),
  ).rejects.toMatchObject({ code: 'STALE_TOURNAMENT_ATTEMPT' });
  await a.ready(members[0]!.principal, matchId, {
    ...key(),
    attempt: match.attempt,
  });
  const starts = await Promise.all(
    Array.from({ length: 4 }, (_, i) =>
      (i % 2 ? a : b).ready(members[1]!.principal, matchId, {
        ...key(),
        attempt: match.attempt,
      }),
    ),
  );
  const ids = new Set(starts.map((s) => s.gameId));
  expect(ids.size).toBe(1);
  const gameId = starts[0]!.gameId!;
  expect(gameId).toBeTruthy();
  const rooms = new PokerRoomService(f.db),
    view = await rooms.read(members[0]!.principal, gameId),
    actor = members.find((p) => p.userId === view.view.toAct)!;
  await rooms.command(actor.principal, {
    gameId,
    stateVersion: view.view.stateVersion,
    ...key(),
    payload: { action: 'FOLD' },
  });
  await new MatchSettlementService(f.db, admission).complete(gameId);
  await Promise.all(
    Array.from({ length: 10 }, (_, i) => (i % 2 ? a : b).ingest(gameId)),
  );
  expect(await f.db.tournamentResult.count({ where: { roomId: gameId } })).toBe(
    1,
  );
  return gameId;
}
it('requires fresh admin MFA, permanent membership and strict commands; registers once under concurrent replay', async () => {
  const guest = f.players[0]!;
  const forbidden = await f.request('tournaments', players[0]!.bearer, {
    ...key(),
    reason: 'Not authorized',
    name: 'No authority',
    capacity: 2,
    startsAt: new Date(Date.now() + 10000).toISOString(),
    title: 'No prize',
  });
  expect(forbidden.status).toBe(403);
  const { id, input } = await create();
  tournamentId = id;
  expect(await a.create(admin.principal, input)).toEqual({ id });
  await expect(
    a.create(admin.principal, { ...input, title: 'Altered title' }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  await expect(a.register(guest.principal, id, key())).rejects.toMatchObject({
    code: 'PERMANENT_ACCOUNT_REQUIRED',
  });
  await expect(
    a.register(players[0]!.principal, id, {
      ...key(),
      winner: players[0]!.userId,
    }),
  ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  const registrations = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      (i % 2 ? a : b).register(players[0]!.principal, id, key()),
    ),
  );
  expect(registrations.every((r) => r.seed === 1)).toBe(true);
  for (const p of players.slice(1)) await a.register(p.principal, id, key());
  expect(
    await f.db.tournamentEntry.count({ where: { tournamentId: id } }),
  ).toBe(4);
  await a.startDue(id);
  expect(
    (await f.db.tournament.findUniqueOrThrow({ where: { id } })).status,
  ).toBe('REGISTRATION');
}, 30000);
it('runs a real funded four-player bracket, advances verified winners and grants exactly one title after retries/restart', async () => {
  const t = await f.db.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
  });
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, t.startsAt.getTime() - Date.now() + 30)),
  );
  await Promise.all([a.startDue(t.id), b.startDue(t.id)]);
  const matches = await f.db.tournamentMatch.findMany({
    where: { tournamentId: t.id, round: 0 },
    orderBy: { slot: 'asc' },
  });
  expect(matches).toHaveLength(2);
  const seeds = await f.db.tournamentEntry.findMany({
    where: { tournamentId: t.id },
    orderBy: { seed: 'asc' },
  });
  expect(matches[0]!.leftEntryId).toBe(seeds[0]!.id);
  expect(matches[0]!.rightEntryId).toBe(seeds[3]!.id);
  await finishMatch(matches[0]!.id);
  await finishMatch(matches[1]!.id);
  expect(
    await f.db.tournamentAward.count({ where: { tournamentId: t.id } }),
  ).toBe(0);
  const final = await f.db.tournamentMatch.findUniqueOrThrow({
    where: {
      tournamentId_round_slot: { tournamentId: t.id, round: 1, slot: 0 },
    },
  });
  await finishMatch(final.id);
  await b.recover();
  const ended = await a.read(players[0]!.principal, t.id);
  expect(ended.status).toBe('COMPLETED');
  expect(ended.championSeed).not.toBeNull();
  expect(ended.standings[0]!.wins).toBe(2);
  expect(
    await f.db.tournamentAward.count({ where: { tournamentId: t.id } }),
  ).toBe(1);
  expect(
    await f.db.gameReservation.count({
      where: { userId: { in: players.map((p) => p.userId) } },
    }),
  ).toBe(6);
  expect(
    await f.db.cardInstance.count({
      where: {
        ownerId: { in: players.map((p) => p.userId) },
        lockToken: { not: null },
      },
    }),
  ).toBe(0);
  expect(
    (await new MatchSettlementService(f.db, admission).audit()).balanced,
  ).toBe(true);
  const replay = { ...key(), reason: 'Review immutable bracket results' };
  expect(await a.replay(admin.principal, t.id, replay)).toEqual({
    consistent: true,
    reports: [],
    checkedResults: 3,
    awards: 1,
  });
  expect(await b.replay(admin.principal, t.id, replay)).toEqual({
    consistent: true,
    reports: [],
    checkedResults: 3,
    awards: 1,
  });
  expect(
    await f.db.tournamentAudit.count({
      where: { tournamentId: t.id, action: 'REPLAY' },
    }),
  ).toBe(1);
}, 60000);
it('keeps hidden state/account IDs out of brackets and enforces membership and audited immutable results', async () => {
  const outsider = f.players[0]!,
    view = await a.read(outsider.principal, tournamentId),
    text = JSON.stringify(view);
  for (const p of players) expect(text).not.toContain(p.userId);
  expect(text).not.toContain('hole');
  expect(view.matches.every((m) => m.gameId === null)).toBe(true);
  await expect(
    a.ready(outsider.principal, view.matches[0]!.id, { ...key(), attempt: 1 }),
  ).rejects.toMatchObject({ code: 'MATCH_UNAVAILABLE' });
  await expect(
    a.replay(players[0]!.principal, tournamentId, {
      ...key(),
      reason: 'Not admin replay',
    }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  const award = await f.db.tournamentAward.findUniqueOrThrow({
    where: { tournamentId },
  });
  await expect(
    f.db.tournamentAward.update({
      where: { tournamentId },
      data: { title: 'Forged' },
    }),
  ).rejects.toThrow();
  await expect(
    f.db.tournament.update({
      where: { id: tournamentId },
      data: { championEntryId: randomUUID() },
    }),
  ).rejects.toThrow();
  await expect(
    f.db.tournamentResult.deleteMany({ where: { match: { tournamentId } } }),
  ).rejects.toThrow();
  expect(award.title).toBe('Fixture Champion');
  const response = await f.request(
    'tournaments/' + tournamentId,
    outsider.bearer,
  );
  expect(response.status).toBe(200);
  expect(
    (await f.request('tournaments?limit=999', outsider.bearer)).status,
  ).toBe(400);
  const weak = await f.actor(false);
  await f.db.user.update({
    where: { id: weak.userId },
    data: { role: 'ADMIN' },
  });
  await expect(
    a.replay(weak.principal, tournamentId, {
      ...key(),
      reason: 'Requires elevated session',
    }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await f.db.user.update({
    where: { id: admin.userId },
    data: { role: 'PLAYER' },
  });
  await expect(
    a.replay(admin.principal, tournamentId, {
      ...key(),
      reason: 'Revoked role test',
    }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await f.db.user.update({
    where: { id: admin.userId },
    data: { role: 'ADMIN' },
  });
});
it('cancels an underfilled scheduled field without charging a fee and pauses mismatched configuration', async () => {
  const { id } = await create(2, 500);
  await a.register(players[0]!.principal, id, key());
  const before = await new MatchSettlementService(f.db, admission).balance(
    players[0]!.principal,
  );
  await new Promise((resolve) => setTimeout(resolve, 550));
  const changed = new TournamentService(
    f.db,
    { ...policy, version: 'DIFFERENT' },
    admission,
  );
  await changed.startDue(id);
  expect(
    (await f.db.tournament.findUniqueOrThrow({ where: { id } })).status,
  ).toBe('REGISTRATION');
  await a.startDue(id);
  expect((await a.read(players[0]!.principal, id)).status).toBe('CANCELLED');
  expect(
    await new MatchSettlementService(f.db, admission).balance(
      players[0]!.principal,
    ),
  ).toEqual(before);
  expect(
    await f.db.tournamentAward.count({ where: { tournamentId: id } }),
  ).toBe(0);
  await expect(
    a.register(players[1]!.principal, id, key()),
  ).rejects.toMatchObject({ code: 'REGISTRATION_CLOSED' });
});

it('records private result reports once and exposes them only through audited admin replay', async () => {
  const view = await a.read(players[0]!.principal, tournamentId),
    own = await f.db.tournamentEntry.findUniqueOrThrow({
      where: {
        tournamentId_userId: { tournamentId, userId: players[0]!.userId },
      },
    }),
    m = await f.db.tournamentMatch.findFirstOrThrow({
      where: {
        tournamentId,
        OR: [{ leftEntryId: own.id }, { rightEntryId: own.id }],
      },
    }),
    input = { ...key(), matchId: m.id, code: 'RESULT_INCONSISTENT' };
  expect(view.reportUntil).not.toBeNull();
  const receipts = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      (i % 2 ? a : b).report(players[0]!.principal, tournamentId, input),
    ),
  );
  expect(new Set(receipts.map((r) => r.id)).size).toBe(1);
  await expect(
    a.report(f.players[0]!.principal, tournamentId, { ...input, ...key() }),
  ).rejects.toMatchObject({ code: 'MATCH_UNAVAILABLE' });
  await expect(
    a.report(players[0]!.principal, tournamentId, {
      ...input,
      code: 'COLLUSION',
    }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  const replay = (await a.replay(admin.principal, tournamentId, {
    ...key(),
    reason: 'Review participant result report',
  })) as { reports: unknown[] };
  expect(replay.reports).toHaveLength(1);
  expect(
    JSON.stringify(await a.read(f.players[0]!.principal, tournamentId)),
  ).not.toContain('RESULT_INCONSISTENT');
  await expect(
    f.db.tournamentDispute.deleteMany({ where: { tournamentId } }),
  ).rejects.toThrow();
});
