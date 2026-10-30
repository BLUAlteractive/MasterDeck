import { Server } from 'socket.io';
import { listenGameChanges } from '@deckforge/database';
import type { Server as HttpServer } from 'node:http';
import { z } from 'zod';
import type { AuthService } from './service';
import { pokerRoomJoinSchema, pokerResumeSchema } from '@deckforge/contracts';
import { ApiFailure } from './errors';
import { PokerRoomService, StaleRoomVersion } from '../rooms/service';

const handshakeSchema = z
  .object({ token: z.string().min(1).max(16384) })
  .strict();
const joinSchema = pokerRoomJoinSchema;
export async function attachAuthSocket(
  server: HttpServer,
  auth: AuthService | null,
  origins: string[],
  roomService: PokerRoomService | null = null,
) {
  const attempts = new Map<string, { count: number; started: number }>();
  const cleanup = setInterval(() => {
    for (const [ip, value] of attempts)
      if (Date.now() - value.started >= 60000) attempts.delete(ip);
  }, 60000);
  cleanup.unref();
  const io = new Server(server, {
    allowRequest: (req, accept) => {
      const ip = req.socket.remoteAddress ?? 'unknown';
      const origin = req.headers.origin;
      if (origin && !origins.includes(origin))
        return accept('FORBIDDEN', false);
      let bucket = attempts.get(ip);
      if (!bucket || Date.now() - bucket.started >= 60000) {
        if (attempts.size >= 10000 && !bucket)
          return accept('RATE_LIMITED', false);
        bucket = { count: 0, started: Date.now() };
        attempts.set(ip, bucket);
      }
      accept(null, ++bucket.count <= 60);
    },
    cors: { origin: origins },
    maxHttpBufferSize: 16384,
  });
  const rooms = io.of('/rooms');
  rooms.use(async (socket, next) => {
    const parsed = handshakeSchema.safeParse(socket.handshake.auth);
    if (
      !auth ||
      !parsed.success ||
      socket.handshake.query.token ||
      socket.handshake.query.access_token
    )
      return next(new Error('UNAUTHORIZED'));
    try {
      const principal = await auth.authenticate(`Bearer ${parsed.data.token}`);
      socket.data.expiresAt = principal.claims.exp * 1000;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });
  const refreshers = new Set<(roomId: string | null) => void>();
  const stopNotifications =
    auth && roomService
      ? await listenGameChanges(auth.database, (id) => {
          for (const refresh of refreshers) refresh(id);
        })
      : async () => {};
  rooms.on('connection', (socket) => {
    let expiryTimer: ReturnType<typeof setTimeout>;
    const checkExpiry = () => {
      const remaining = Number(socket.data.expiresAt) - Date.now();
      if (remaining <= 0) {
        socket.emit('auth.error', { code: 'UNAUTHORIZED' });
        socket.disconnect(true);
        return;
      }
      expiryTimer = setTimeout(checkExpiry, Math.min(remaining, 2147483647));
      expiryTimer.unref();
    };
    checkExpiry();
    socket.once('disconnect', () => clearTimeout(expiryTimer));
    let packetCount = 0;
    let windowStart = Date.now();
    const token = handshakeSchema.parse(socket.handshake.auth).token;
    socket.use(async (_packet, next) => {
      if (Date.now() - windowStart >= 60000) {
        windowStart = Date.now();
        packetCount = 0;
      }
      if (++packetCount > 60) {
        socket.emit('auth.error', { code: 'RATE_LIMITED' });
        socket.disconnect(true);
        return;
      }
      try {
        await auth!.authenticate(`Bearer ${token}`);
        next();
      } catch {
        socket.emit('auth.error', { code: 'UNAUTHORIZED' });
        socket.disconnect(true);
      }
    });
    let joined: string | null = null,
      lastVersion = -1,
      refreshing = false,
      pending = false;
    const refresh = async () => {
      if (refreshing) {
        pending = true;
        return;
      }
      refreshing = true;
      try {
        do {
          pending = false;
          const gameId = joined;
          if (!gameId || !socket.connected || !auth || !roomService) break;
          const principal = await auth.authenticate(`Bearer ${token}`);
          const result = await roomService.read(principal, gameId);
          if (
            joined === gameId &&
            socket.connected &&
            result.view.stateVersion > lastVersion
          ) {
            lastVersion = result.view.stateVersion;
            socket.emit('game.state', result);
          }
        } while (pending);
      } catch {
        joined = null;
        socket.emit('auth.error', { code: 'UNAUTHORIZED' });
        socket.disconnect(true);
      } finally {
        refreshing = false;
      }
    };
    const notify = (id: string | null) => {
      if (joined && (id === null || id === joined)) void refresh();
    };
    refreshers.add(notify);
    socket.once('disconnect', () => {
      joined = null;
      refreshers.delete(notify);
    });
    const handle = async (
      kind: 'join' | 'command' | 'resume',
      input: unknown,
      ack: unknown,
    ) => {
      if (typeof ack !== 'function') return;
      try {
        if (!roomService || !auth) {
          ack({
            error: {
              code:
                kind === 'join' && !joinSchema.safeParse(input).success
                  ? 'INVALID_REQUEST'
                  : 'ROOM_UNAVAILABLE',
            },
          });
          return;
        }
        // Recheck in the handler as well as packet middleware; the DB service rechecks under locks.
        const principal = await auth.authenticate(`Bearer ${token}`);
        if (kind === 'resume') {
          const parsed = pokerResumeSchema.safeParse(input);
          if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
          const result = await roomService.resume(principal, parsed.data);
          joined = parsed.data.gameId;
          lastVersion = result.view.stateVersion;
          ack(result);
          void refresh();
        } else if (kind === 'join') {
          const parsed = joinSchema.safeParse(input);
          if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
          const result = await roomService.read(principal, parsed.data.gameId);
          joined = parsed.data.gameId;
          lastVersion = result.view.stateVersion;
          ack(result);
          // Close the read/subscribe race by fetching once more after membership is registered.
          void refresh();
        } else ack(await roomService.command(principal, input));
      } catch (error) {
        ack({
          error: {
            code:
              error instanceof ApiFailure ? error.code : 'SERVICE_UNAVAILABLE',
          },
          ...(error instanceof StaleRoomVersion
            ? { resync: error.resync }
            : {}),
        });
      }
    };
    socket.on('room.join', (input: unknown, ack: unknown) => {
      void handle('join', input, ack);
    });
    socket.on('room.resume', (input: unknown, ack: unknown) => {
      void handle('resume', input, ack);
    });
    socket.on('game.command', (input: unknown, ack: unknown) => {
      void handle('command', input, ack);
    });
  });
  return async () => {
    await stopNotifications();
    clearInterval(cleanup);
    io.disconnectSockets(true);
    io.engine.close();
  };
}
