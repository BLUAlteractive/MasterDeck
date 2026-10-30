import {
  io,
  type Socket,
  type ManagerOptions,
  type SocketOptions,
} from 'socket.io-client';
import {
  pokerRoomJoinSchema,
  spadesRoomViewSchema,
  spadesResumeResponseSchema,
  type SpadesRoomView,
} from '@deckforge/contracts';
export type SpadesConnector = (
  url: string,
  options: Partial<ManagerOptions & SocketOptions>,
) => Socket;
export function watchSpades(
  apiUrl: string,
  getAccessToken: () => Promise<string>,
  gameId: string,
  receive: (view: SpadesRoomView) => void,
  status: (connected: boolean) => void,
  connect: SpadesConnector = io,
) {
  pokerRoomJoinSchema.parse({ gameId });
  let stopped = false,
    socket: Socket | null = null,
    timer: ReturnType<typeof setTimeout> | undefined,
    attempt = 0,
    version = 0;
  function schedule() {
    if (stopped || timer) return;
    status(false);
    timer = setTimeout(
      () => {
        timer = undefined;
        void start();
      },
      Math.min(1000 * 2 ** attempt++, 15000),
    );
  }
  function accept(input: unknown) {
    const parsed = spadesRoomViewSchema.safeParse(input);
    if (!parsed.success || parsed.data.gameId !== gameId)
      throw new Error('INVALID_ROOM_VIEW');
    if (parsed.data.view.stateVersion >= version) {
      version = parsed.data.view.stateVersion;
      receive(parsed.data);
    }
  }
  async function start() {
    try {
      const token = await getAccessToken();
      if (stopped) return;
      if (!token) throw new Error('NO_SESSION');
      socket?.removeAllListeners();
      socket?.disconnect();
      const current = connect(apiUrl.replace(/\/$/, '') + '/rooms', {
        auth: { token },
        transports: ['websocket'],
        reconnection: false,
        autoConnect: false,
      });
      socket = current;
      current.on('connect', () => {
        current
          .timeout(8000)
          .emit(
            'room.resume',
            { gameId, afterVersion: version },
            (error: unknown, input: unknown) => {
              if (stopped || current !== socket) return;
              try {
                if (error) throw error;
                const resumed = spadesResumeResponseSchema.parse(input);
                accept({
                  gameId: resumed.gameId,
                  view: resumed.view,
                  turnDeadline: null,
                  settled: resumed.settled,
                });
                attempt = 0;
                status(true);
              } catch {
                current.disconnect();
                schedule();
              }
            },
          );
      });
      current.on('game.state', (input: unknown) => {
        if (stopped || current !== socket) return;
        try {
          accept(input);
        } catch {
          current.disconnect();
          schedule();
        }
      });
      current.on('connect_error', schedule);
      current.on('disconnect', schedule);
      current.on('auth.error', () => {
        current.disconnect();
        schedule();
      });
      current.connect();
    } catch {
      schedule();
    }
  }
  status(false);
  void start();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    socket?.removeAllListeners();
    socket?.disconnect();
  };
}
