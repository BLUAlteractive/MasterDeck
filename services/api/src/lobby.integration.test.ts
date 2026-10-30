import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { identityFixture } from '../test/auth-fixture';
import { createCardWithOrigin } from '@deckforge/database';
import { developmentCatalog } from '@deckforge/card-domain';
import { LobbyService } from './rooms/lobby';
let fixture: Awaited<ReturnType<typeof identityFixture>>,
  a: LobbyService,
  b: LobbyService;
beforeAll(async () => {
  fixture = await identityFixture();
  a = new LobbyService(fixture.db);
  b = new LobbyService(fixture.secondDb);
});
afterAll(async () => {
  await fixture?.close();
});
const key = () => randomUUID();
async function leaveAll() {
  for (const p of fixture.players)
    await a.command(p.principal, { action: 'LEAVE', commandId: key() });
}
it('two independent clients join one public lobby without duplicate seats and leave safely', async () => {
  const [p, q] = fixture.players;
  const result = await Promise.all([
    a.command(p!.principal, { action: 'QUEUE', commandId: key() }),
    b.command(q!.principal, { action: 'QUEUE', commandId: key() }),
  ]);
  expect(result[0]!.lobby!.id).toBe(result[1]!.lobby!.id);
  const view = await a.read(p!.principal);
  expect(view.lobby!.members.map((s) => s.seat)).toEqual([0, 1]);
  expect(view.lobby!.canStart).toBe(false);
  await leaveAll();
  expect((await a.read(q!.principal)).lobby).toBe(null);
});
it('same-key queue retries have one effect and changed bodies conflict', async () => {
  const p = fixture.players[0]!,
    commandId = key();
  const body = { action: 'QUEUE', commandId };
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      (i % 2 ? a : b).command(p.principal, body),
    ),
  );
  for (const r of results) expect(r).toEqual(results[0]);
  expect(
    await fixture.db.lobbySeat.count({ where: { userId: p.userId } }),
  ).toBe(1);
  await expect(
    a.command(p.principal, { action: 'LEAVE', commandId }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  await leaveAll();
});
it('parallel unique joins never assign the same user to multiple seats', async () => {
  const p = fixture.players[0]!;
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, (_, i) =>
      (i % 2 ? a : b).command(p.principal, {
        action: 'QUEUE',
        commandId: key(),
      }),
    ),
  );
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(
    await fixture.db.lobbySeat.count({ where: { userId: p.userId } }),
  ).toBe(1);
  await leaveAll();
});
it('private invitation is unguessable, stored hashed, capacity bounded and visible only on creation receipt', async () => {
  const [p, q, r] = fixture.players;
  const own = await a.command(p!.principal, {
    action: 'CREATE_PRIVATE',
    commandId: key(),
    capacity: 2,
  });
  expect(own.invite).toMatch(/^[a-f0-9]{64}$/);
  const row = await fixture.db.lobby.findUniqueOrThrow({
    where: { id: own.lobby!.id },
  });
  expect(row.inviteHash).not.toBe(own.invite);
  await expect(
    a.command(q!.principal, {
      action: 'JOIN_PRIVATE',
      commandId: key(),
      invite: '0'.repeat(64),
    }),
  ).rejects.toMatchObject({ code: 'LOBBY_UNAVAILABLE' });
  const joined = await b.command(q!.principal, {
    action: 'JOIN_PRIVATE',
    commandId: key(),
    invite: own.invite,
  });
  expect(joined.invite).toBe(null);
  await expect(
    a.command(r!.principal, {
      action: 'JOIN_PRIVATE',
      commandId: key(),
      invite: own.invite,
    }),
  ).rejects.toMatchObject({ code: 'LOBBY_FULL' });
  expect((await a.read(r!.principal)).lobby).toBe(null);
  await leaveAll();
});
it('ready requires own valid loadout and rejects spoofed identity/seat fields', async () => {
  const p = fixture.players[0]!;
  await a.command(p.principal, { action: 'QUEUE', commandId: key() });
  await expect(
    a.command(p.principal, { action: 'READY', commandId: key(), ready: true }),
  ).rejects.toMatchObject({ code: 'INVALID_LOADOUT' });
  await expect(
    a.command(p.principal, {
      action: 'READY',
      commandId: key(),
      ready: false,
      userId: fixture.players[1]!.userId,
    }),
  ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  await a.command(p.principal, {
    action: 'READY',
    commandId: key(),
    ready: false,
  });
  await fixture.db.$transaction(async (tx) => {
    const templates = await tx.cardTemplate.findMany({
      where: { seriesId: developmentCatalog.seriesId, version: 1 },
    });
    expect(templates).toHaveLength(52);
    const selected = [];
    for (const template of templates) {
      const card = await createCardWithOrigin(
        tx,
        {
          ownerId: p.userId,
          templateId: template.id,
          seriesId: template.seriesId,
          faceId: template.faceId,
        },
        {
          operatorId: 'test.lobby',
          sourceKey: randomUUID(),
          reason: 'ISOLATED_TEST',
        },
      );
      selected.push(card);
    }
    const loadoutId = randomUUID();
    await tx.loadout.create({ data: { id: loadoutId, userId: p.userId } });
    await tx.loadoutCard.createMany({
      data: selected.map((c) => ({
        loadoutId,
        userId: p.userId,
        loadoutVersion: 1,
        faceId: c.faceId,
        instanceId: c.id,
      })),
    });
  });
  const ready = await a.command(p.principal, {
    action: 'READY',
    commandId: key(),
    ready: true,
  });
  expect(ready.lobby!.members[0]!.ready).toBe(true);
  await b.command(fixture.players[1]!.principal, {
    action: 'QUEUE',
    commandId: key(),
  });
  expect(
    (await a.read(p.principal)).lobby!.members.every((m) => !m.ready),
  ).toBe(true);

  await leaveAll();
});
it('HTTP authenticates membership and SQL enforces one active seat', async () => {
  const [host, guest] = fixture.players.slice(2);
  const created = await fixture.request('lobby/commands', host!.bearer, {
    action: 'CREATE_PRIVATE',
    commandId: key(),
    capacity: 2,
  });
  expect(created.status).toBe(200);
  const invitation = (await created.json()) as { invite: string };
  expect(
    (
      await fixture.request('lobby/commands', guest!.bearer, {
        action: 'JOIN_PRIVATE',
        commandId: key(),
        invite: invitation.invite,
      })
    ).status,
  ).toBe(200);
  const current = await fixture.request('lobby', guest!.bearer);
  expect(
    ((await current.json()) as { lobby: { members: unknown[] } }).lobby.members,
  ).toHaveLength(2);
  for (const player of [guest!, host!])
    expect(
      (
        await fixture.request('lobby/commands', player.bearer, {
          action: 'LEAVE',
          commandId: key(),
        })
      ).status,
    ).toBe(200);

  expect((await fixture.request('lobby')).status).toBe(401);
  const p = fixture.players[0]!;
  await a.command(p.principal, { action: 'QUEUE', commandId: key() });
  const view = await a.read(p.principal);
  await expect(
    fixture.db.lobbySeat.create({
      data: { userId: p.userId, lobbyId: view.lobby!.id, seat: 1 },
    }),
  ).rejects.toThrow();
  await fixture.db.authSession.update({
    where: { id: p.principal.sessionId },
    data: { revokedAt: new Date() },
  });
  await expect(a.read(p.principal)).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});
