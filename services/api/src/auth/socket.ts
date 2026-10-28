import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { z } from 'zod';
import type { AuthService } from './service';

const handshakeSchema = z
  .object({ token: z.string().min(1).max(16384) })
  .strict();
const joinSchema = z.object({ gameId: z.uuid() }).strict();
export function attachAuthSocket(
  server: HttpServer,
  auth: AuthService | null,
  origins: string[],
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
    socket.on('room.join', (input: unknown, ack: unknown) => {
      if (typeof ack !== 'function') return;
      // Room membership/actors arrive in B018; no room access is granted by this scaffold.
      ack({
        error: {
          code: joinSchema.safeParse(input).success
            ? 'ROOM_UNAVAILABLE'
            : 'INVALID_REQUEST',
        },
      });
    });
    socket.on('game.command', (_input: unknown, ack: unknown) => {
      if (typeof ack === 'function')
        ack({ error: { code: 'ROOM_UNAVAILABLE' } });
    });
  });
  return () => {
    clearInterval(cleanup);
    io.disconnectSockets(true);
    io.engine.close();
  };
}
