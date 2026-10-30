import {
  pokerRoomViewSchema,
  pokerResumeResponseSchema,
} from '@deckforge/contracts';
import { watchRoom, type RoomConnector } from './room-watch';
export function watchPoker(
  apiUrl: string,
  getAccessToken: () => Promise<string>,
  gameId: string,
  receive: (view: ReturnType<typeof pokerRoomViewSchema.parse>) => void,
  status: (connected: boolean) => void,
  connect?: RoomConnector,
) {
  return watchRoom(
    apiUrl,
    getAccessToken,
    gameId,
    receive,
    status,
    (input, resume) => {
      if (!resume) return pokerRoomViewSchema.parse(input);
      const r = pokerResumeResponseSchema.parse(input);
      return pokerRoomViewSchema.parse({
        gameId: r.gameId,
        view: r.view,
        settled: r.settled,
        turnDeadline: r.turnDeadline,
      });
    },
    connect,
  );
}
