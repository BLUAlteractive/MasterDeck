import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { cpus, platform, arch } from 'node:os';
import { io, type Socket } from 'socket.io-client';
import { identityFixture } from '../test/auth-fixture';
import { initializePokerRoom, PokerRoomService } from './rooms/service';
import {
  pokerRoomViewSchema,
  pokerResumeResponseSchema,
  pokerCommandReceiptSchema,
} from '@deckforge/contracts';
import { issueEarnedChips } from './rooms/chips';
let f: Awaited<ReturnType<typeof identityFixture>>;
const enabled = process.env.DECKFORGE_LOAD_GAMES === '500';
beforeAll(async () => {
  f = await identityFixture(
    null,
    null,
    null,
    enabled
      ? {
          socketAdmissionPolicy: {
            approvalReference: 'OWNED_FIXTURE_LOAD_ONLY_NOT_PRODUCTION',
            handshakesPerMinute: 2000,
          },
        }
      : {},
  );
});
afterAll(async () => {
  await f?.close();
});
it('cancels an owned in-flight journal transaction without partial credit, then source-retries exactly once', async () => {
  const p = f.players[0]!,
    sourceKey = 'chaos-owned:' + randomUUID();
  let notify!: (pid: number) => void;
  const started = new Promise<number>((resolve) => {
    notify = resolve;
  });
  const interrupted = f.db
    .$transaction(
      async (tx) => {
        const [row] = await tx.$queryRaw<
          { pid: number }[]
        >`SELECT pg_backend_pid() AS pid`;
        await issueEarnedChips(tx, {
          userId: p.userId,
          amount: 10n,
          sourceKey,
          operatorId: 'test.owned-chaos',
        });
        notify(row!.pid);
        await tx.$queryRaw`SELECT pg_sleep(10)::text`;
      },
      { timeout: 20000 },
    )
    .then(
      () => true,
      () => false,
    );
  const pid = await started;
  await new Promise((resolve) => setTimeout(resolve, 80));
  const [cancelled] = await f.secondDb.$queryRaw<
    { ok: boolean }[]
  >`SELECT pg_cancel_backend(${pid}::int) AS ok`;
  expect(cancelled!.ok).toBe(true);
  expect(await interrupted).toBe(false);
  expect(await f.db.playChipTransfer.count({ where: { sourceKey } })).toBe(0);
  expect(
    await f.db.playChipAccount.findUnique({ where: { userId: p.userId } }),
  ).toBeNull();
  await Promise.all(
    Array.from({ length: 10 }, () =>
      f.db.$transaction((tx) =>
        issueEarnedChips(tx, {
          userId: p.userId,
          amount: 10n,
          sourceKey,
          operatorId: 'test.owned-chaos',
        }),
      ),
    ),
  );
  expect(await f.db.playChipTransfer.count({ where: { sourceKey } })).toBe(1);
  expect(
    (
      await f.db.playChipAccount.findUniqueOrThrow({
        where: { userId: p.userId },
      })
    ).balance,
  ).toBe(10n);
}, 30000);
it('recovers a committed command after losing its acknowledgement without applying it twice', async () => {
  const [p, q] = f.players,
    id = await initializePokerRoom(f.db, {
      players: [
        { id: p!.userId, stack: 100 },
        { id: q!.userId, stack: 100 },
      ],
      dealer: 0,
      smallBlind: 1,
      bigBlind: 2,
    }),
    rooms = new PokerRoomService(f.db),
    command = {
      gameId: id,
      commandId: randomUUID(),
      stateVersion: 0,
      payload: { action: 'FOLD' },
    };
  await rooms.command(p!.principal, command); // Simulated lost response: deliberately discard the receipt.
  const restarted = new PokerRoomService(f.secondDb),
    retries = await Promise.all(
      Array.from({ length: 10 }, () =>
        restarted.command(p!.principal, command),
      ),
    );
  expect(retries.every((r) => r.stateVersion === 1)).toBe(true);
  expect(await f.db.gameEvent.count({ where: { roomId: id } })).toBe(2);
  const state = await restarted.read(q!.principal, id);
  expect(
    state.view.outcome!.allocation.players.reduce(
      (sum, p) => sum + p.finalStack,
      0,
    ),
  ).toBe(200);
});
it.skipIf(!enabled)(
  'observes 500 simultaneous private rooms with 1000 distinct signed fixture clients',
  async () => {
    const sockets: Socket[] = [],
      durations: number[] = [],
      commands: number[] = [];
    let leaks = 0;
    const setupStarted = performance.now();
    const actors: Awaited<ReturnType<typeof f.actor>>[] = [];
    for (let i = 0; i < 1000; i++)
      actors.push(await f.actor(true, 'aal1', false));
    const rooms: {
      id: string;
      left: (typeof actors)[number];
      right: (typeof actors)[number];
      socket?: Socket;
    }[] = [];
    for (let i = 0; i < 500; i += 10)
      rooms.push(
        ...(await Promise.all(
          Array.from({ length: 10 }, async (_, offset) => {
            const index = i + offset,
              left = actors[index * 2]!,
              right = actors[index * 2 + 1]!;
            return {
              id: await initializePokerRoom(
                f.db,
                {
                  players: [
                    { id: left.userId, stack: 100 },
                    { id: right.userId, stack: 100 },
                  ],
                  dealer: 0,
                  smallBlind: 1,
                  bigBlind: 2,
                },
                300000,
              ),
              left,
              right,
            };
          }),
        )),
      );
    const setupMs = performance.now() - setupStarted;
    function verify(input: unknown, viewer: string) {
      const parsed = pokerRoomViewSchema.safeParse(input);
      if (!parsed.success) {
        leaks++;
        return;
      }
      if (
        parsed.data.view.players.some((p) => p.id !== viewer && p.hole !== null)
      )
        leaks++;
    }
    async function connect(
      room: (typeof rooms)[number],
      actor: (typeof actors)[number],
    ) {
      const started = performance.now(),
        socket = io(f.base + '/rooms', {
          auth: { token: actor.bearer },
          transports: ['websocket'],
          forceNew: true,
          multiplex: false,
          reconnection: false,
          timeout: 10000,
        });
      sockets.push(socket);
      socket.on('game.state', (input) => verify(input, actor.userId));
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', () => resolve());
        socket.once('connect_error', reject);
      });
      const input = await new Promise<unknown>((resolve, reject) =>
        socket
          .timeout(15000)
          .emit(
            'room.resume',
            { gameId: room.id, afterVersion: 0 },
            (error: unknown, result: unknown) =>
              error ? reject(error) : resolve(result),
          ),
      );
      const resumed = pokerResumeResponseSchema.parse(input);
      verify(
        {
          gameId: resumed.gameId,
          view: resumed.view,
          turnDeadline: resumed.turnDeadline,
          settled: resumed.settled,
        },
        actor.userId,
      );
      durations.push(performance.now() - started);
      if (actor.userId === room.left.userId) room.socket = socket;
    }
    try {
      const connectionStart = performance.now();
      for (let i = 0; i < rooms.length; i += 10)
        await Promise.all(
          rooms
            .slice(i, i + 10)
            .flatMap((r) => [connect(r, r.left), connect(r, r.right)]),
        );
      expect(sockets.filter((s) => s.connected)).toHaveLength(1000);
      const connectedMs = performance.now() - connectionStart;
      for (let i = 0; i < rooms.length; i += 10)
        await Promise.all(
          rooms.slice(i, i + 10).map(async (r) => {
            const start = performance.now(),
              command = {
                gameId: r.id,
                commandId: randomUUID(),
                stateVersion: 0,
                payload: { action: 'FOLD' },
              };
            const input = await new Promise<unknown>((resolve, reject) =>
              r
                .socket!.timeout(15000)
                .emit(
                  'game.command',
                  command,
                  (error: unknown, result: unknown) =>
                    error ? reject(error) : resolve(result),
                ),
            );
            const receipt = pokerCommandReceiptSchema.parse(input);
            expect(receipt.view.street).toBe('COMPLETE');
            expect(
              receipt.view.outcome!.allocation.players.reduce(
                (sum, p) => sum + p.finalStack,
                0,
              ),
            ).toBe(200);
            commands.push(performance.now() - start);
          }),
        );
      expect(leaks).toBe(0);
      expect(
        await f.db.gameRoom.count({
          where: {
            id: { in: rooms.map((r) => r.id) },
            status: 'COMPLETE',
            stateVersion: 1,
          },
        }),
      ).toBe(500);
      const percentile = (xs: number[], p: number) =>
        [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * p) - 1]!;
      process.stdout.write(
        JSON.stringify({
          event: 'load.baseline',
          fixture: true,
          node: process.version,
          platform: platform(),
          arch: arch(),
          cpus: cpus().length,
          rooms: 500,
          distinctUsers: 1000,
          connectedClients: 1000,
          setupMs: Math.round(setupMs),
          connectedMs: Math.round(connectedMs),
          joinP50Ms: Math.round(percentile(durations, 0.5)),
          joinP95Ms: Math.round(percentile(durations, 0.95)),
          commandP50Ms: Math.round(percentile(commands, 0.5)),
          commandP95Ms: Math.round(percentile(commands, 0.95)),
          privacyFailures: leaks,
          completedHands: 500,
          financialCapacityAt500FundedTables: 'NOT_MEASURED',
          heapMiB: Math.round(process.memoryUsage().heapUsed / 1048576),
        }) + '\n',
      );
    } finally {
      for (const socket of sockets) {
        socket.removeAllListeners();
        socket.disconnect();
      }
    }
  },
  180000,
);
