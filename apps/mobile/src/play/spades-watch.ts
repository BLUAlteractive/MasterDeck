import {
  spadesRoomViewSchema,
  spadesResumeResponseSchema,
  type SpadesRoomView,
} from '@deckforge/contracts';
import { watchRoom, type RoomConnector } from './room-watch';
export type SpadesConnector = RoomConnector;
export function watchSpades(
  apiUrl: string,
  getAccessToken: () => Promise<string>,
  gameId: string,
  receive: (view: SpadesRoomView) => void,
  status: (connected: boolean) => void,
  connect?: SpadesConnector,
) {
  return watchRoom(
    apiUrl,
    getAccessToken,
    gameId,
    receive,
    status,
    (input, resume) => {
      if (!resume) return spadesRoomViewSchema.parse(input);
      const r = spadesResumeResponseSchema.parse(input);
      return spadesRoomViewSchema.parse({
        gameId: r.gameId,
        view: r.view,
        settled: r.settled,
        turnDeadline: null,
      });
    },
    connect,
  );
}
