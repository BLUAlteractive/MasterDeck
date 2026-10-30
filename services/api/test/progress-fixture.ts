import { randomUUID } from 'node:crypto';
import { canonicalFaces, type FaceId } from '@deckforge/game-core';
import {
  createPokerHand,
  reducePokerHand,
  legalPokerActions,
  allocatePokerPots,
} from '@deckforge/game-poker';
import type { PrismaClient } from '@deckforge/database';
import { hash, json } from '../src/rooms/shared';
/** Private isolated settled-result fixture, complete replay chain; never imported by runtime. */
export async function fullHouseFixture(db: PrismaClient, ids: string[]) {
  const front = [
    '2-C',
    'K-H',
    '3-D',
    'Q-H',
    '4-C',
    'K-D',
    'K-C',
    'Q-D',
    '5-C',
    '6-H',
    '7-C',
    '8-H',
  ] as FaceId[];
  const deck = [
    ...front,
    ...canonicalFaces.map((f) => f.id).filter((id) => !front.includes(id)),
  ];
  const config = {
    players: ids.map((id) => ({ id, stack: 100 })),
    dealer: 0,
    smallBlind: 1,
    bigBlind: 2,
  };
  const id = randomUUID(),
    initial = { config, deck };
  let state = createPokerHand(config, deck);
  const events = [
    {
      id: randomUUID(),
      roomId: id,
      stateVersion: 0,
      source: 'GENESIS',
      command: json({ type: 'INITIALIZED' }),
      snapshot: json(state),
      actorUserId: null as string | null,
      commandId: null as string | null,
      requestHash: null as string | null,
    },
  ];
  while (state.street !== 'COMPLETE') {
    const playerId = state.players[state.toAct!]!.id,
      legal = legalPokerActions(state, playerId)!;
    const payload = {
        action: legal.canCheck ? ('CHECK' as const) : ('CALL' as const),
      },
      command = {
        gameId: id,
        commandId: randomUUID(),
        stateVersion: state.stateVersion,
        payload,
      };
    state = reducePokerHand(state, {
      playerId,
      expectedVersion: state.stateVersion,
      ...payload,
    });
    events.push({
      id: randomUUID(),
      roomId: id,
      stateVersion: state.stateVersion,
      source: 'PLAYER',
      command: json(command),
      snapshot: json(state),
      actorUserId: playerId,
      commandId: command.commandId,
      requestHash: hash({
        gameId: id,
        stateVersion: command.stateVersion,
        payload,
      }),
    });
  }
  await db.$transaction(async (tx) => {
    await tx.gameRoom.create({
      data: {
        id,
        rulesetVersion: state.rulesetVersion,
        stateVersion: state.stateVersion,
        status: 'COMPLETE',
        initial: json(initial),
        snapshot: json(state),
        commitment: hash(initial),
      },
    });
    await tx.gameParticipant.createMany({
      data: ids.map((userId, seat) => ({ roomId: id, userId, seat })),
    });
    await tx.gameEvent.createMany({ data: events });
    await tx.playChipAccount.create({
      data: { id: randomUUID(), kind: 'ESCROW', roomId: id },
    });
    await tx.gameResult.create({
      data: {
        roomId: id,
        stateVersion: state.stateVersion,
        rulesetVersion: state.rulesetVersion,
        allocation: json(allocatePokerPots(state)),
      },
    });
  });
  return id;
}
