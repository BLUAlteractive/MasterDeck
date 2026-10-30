import { z } from 'zod';
import type { Principal } from '../auth/service';
import { ApiFailure } from '../auth/errors';
import type { PrismaClient } from '@deckforge/database';
import { PokerRoomService } from './service';
import { SpadesRoomService } from './spades';
export type RoomEnvelope = {
  gameId: string;
  view: { stateVersion: number };
  settled: boolean;
  turnDeadline: string | null;
};
export interface RoomProtocol {
  read(p: Principal, id: string): Promise<RoomEnvelope>;
  resume(p: Principal, body: unknown): Promise<RoomEnvelope>;
  command(p: Principal, body: unknown): Promise<unknown>;
}
export class GameRooms implements RoomProtocol {
  readonly poker: PokerRoomService;
  readonly spades: SpadesRoomService;
  constructor(readonly database: PrismaClient) {
    this.poker = new PokerRoomService(database);
    this.spades = new SpadesRoomService(database);
  }
  private async service(id: string) {
    if (!z.uuid().safeParse(id).success)
      throw new ApiFailure('INVALID_REQUEST', 400);
    return (await this.database.spadesRoom.findUnique({
      where: { id: id.toLowerCase() },
      select: { id: true },
    }))
      ? this.spades
      : this.poker;
  }
  async read(p: Principal, id: string) {
    return (await this.service(id)).read(p, id);
  }
  async resume(p: Principal, body: unknown) {
    const parsed = z.object({ gameId: z.uuid() }).passthrough().safeParse(body);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    return (await this.service(parsed.data.gameId)).resume(p, body);
  }
  async command(p: Principal, body: unknown) {
    const parsed = z.object({ gameId: z.uuid() }).passthrough().safeParse(body);
    if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 400);
    return (await this.service(parsed.data.gameId)).command(p, body);
  }
}
