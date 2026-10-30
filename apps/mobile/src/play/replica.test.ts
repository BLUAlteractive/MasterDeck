import { expect, it } from 'vitest';
import { canonicalFaces } from '../../../../packages/game-core/src';
import {
  createPokerHand,
  reducePokerHand,
  projectPokerHand,
} from '../../../../packages/game-poker/src';
import {
  createReplica,
  acceptSnapshot,
  stageCommand,
  acceptReceipt,
  rejectCommand,
  acceptResume,
} from './replica';
const gameId = '55555555-5555-4555-8555-555555555555';
const initial = () =>
  createPokerHand(
    {
      players: [
        { id: 'a', stack: 100 },
        { id: 'b', stack: 100 },
      ],
      dealer: 0,
      smallBlind: 1,
      bigBlind: 2,
    },
    canonicalFaces.map((f) => f.id),
  );
const snapshot = (s = initial()) => ({
  gameId,
  view: projectPokerHand(s, 'a'),
  turnDeadline: null,
});
it('keeps the same pending command key through disconnect snapshots', () => {
  let replica = acceptSnapshot(createReplica(gameId), snapshot());
  replica = stageCommand(replica, 'stable_command_1', { action: 'CALL' });
  const pending = replica.pending;
  replica = acceptSnapshot(replica, snapshot());
  expect(replica.pending).toBe(pending);
  expect(() =>
    stageCommand(replica, 'different_key_1', { action: 'CALL' }),
  ).toThrow('COMMAND_PENDING');
});
it('accepts an original retry receipt without rolling a newer snapshot back', () => {
  const s1 = reducePokerHand(initial(), {
      playerId: 'a',
      expectedVersion: 0,
      action: 'CALL',
    }),
    s2 = reducePokerHand(s1, {
      playerId: 'b',
      expectedVersion: 1,
      action: 'CHECK',
    });
  let replica = stageCommand(
    acceptSnapshot(createReplica(gameId), snapshot()),
    'stable_command_1',
    { action: 'CALL' },
  );
  replica = acceptSnapshot(replica, snapshot(s2));
  replica = acceptReceipt(replica, {
    ...snapshot(s1),
    commandId: 'stable_command_1',
    stateVersion: 1,
  });
  expect(replica.snapshot!.view.stateVersion).toBe(2);
  expect(replica.pending).toBe(null);
});
it('rejects wrong rooms and ignores old/duplicate deliveries', () => {
  const r = acceptSnapshot(createReplica(gameId), snapshot());
  expect(acceptSnapshot(r, snapshot())).toBe(r);
  expect(() =>
    acceptSnapshot(r, {
      ...snapshot(),
      gameId: '66666666-6666-4666-8666-666666666666',
    }),
  ).toThrow('WRONG_ROOM');
});
it('clears only the matching rejected command and resets private state for a new session', () => {
  const r = stageCommand(
    acceptSnapshot(createReplica(gameId), snapshot()),
    'stable_command_1',
    { action: 'CALL' },
  );
  expect(rejectCommand(r, 'other')).toBe(r);
  expect(rejectCommand(r, 'stable_command_1').pending).toBe(null);
  expect(createReplica(gameId)).toEqual({
    gameId,
    snapshot: null,
    pending: null,
  });
});

it('accepts an explicit safe resume envelope without discarding the pending key', () => {
  const r = stageCommand(
    acceptSnapshot(createReplica(gameId), snapshot()),
    'stable_command_1',
    { action: 'CALL' },
  );
  expect(
    acceptResume(r, { ...snapshot(), continuity: 'SNAPSHOT' }).pending,
  ).toBe(r.pending);
});
