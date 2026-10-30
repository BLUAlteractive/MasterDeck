import { renderToStaticMarkup } from 'react-dom/server';
import { it, expect, vi } from 'vitest';
import { canonicalFaces } from '@deckforge/game-core';
import { spadesViewSchema, spadesRoomViewSchema } from '@deckforge/contracts';
import {
  createSpadesMatch,
  applySpadesMatch,
  projectSpadesMatch,
} from '../../../../packages/game-spades/src';
import { SpadesBoard } from './SpadesTable';
import {
  acceptSpades,
  receiptSpades,
  stageSpades,
  type SpadesReplica,
} from './spades-replica';
import { watchSpades, type SpadesConnector } from './spades-watch';
const rules = {
  version: 'SPADES_UI_FIXTURE',
  nilEnabled: true,
  nilPoints: 100,
  contractPoints: 10,
  bagPoints: 1,
  bagThreshold: 10,
  bagPenalty: 100,
  failedNilCountsAsBags: true,
  failedNilBagPoints: 1,
  targetScore: 500,
};
const initial = () =>
  createSpadesMatch(
    ['a', 'b', 'c', 'd'],
    0,
    canonicalFaces.map((face) => face.id),
    rules,
  );
const gameId = '00000000-0000-4000-8000-000000000001';
it('labels partners, nil confirmation, rule/target and status for screen readers', () => {
  const view = spadesViewSchema.parse(projectSpadesMatch(initial(), 'b'));
  const html = renderToStaticMarkup(
    <SpadesBoard view={view} connected busy={false} onCommand={() => {}} />,
  );
  expect(html).toContain('Spades — fixed partnerships');
  expect(html).toContain('Seat 4 (partner)');
  expect(html).toContain('Nil (zero tricks)');
  expect(html).toContain('Confirm bid of 3 tricks');
  expect(html).toContain('Your turn.');
  expect(html).toContain('Target 500');
});
it('marks legal plays explicitly, disables other cards and pauses controls on disconnect', () => {
  let state = initial();
  for (let i = 0; i < 4; i++)
    state = applySpadesMatch(state, {
      kind: 'BID',
      tricks: 3,
      playerId: state.deal.players[state.toBid]!,
      expectedVersion: state.stateVersion,
    });
  const view = spadesViewSchema.parse(projectSpadesMatch(state, 'b'));
  const html = renderToStaticMarkup(
    <SpadesBoard view={view} connected busy={false} onCommand={() => {}} />,
  );
  expect(html).toContain('legal play');
  expect(html).toContain('not playable now');
  expect(html).toContain('aria-disabled="true"');
  expect(html).toContain('rarity never changes a trick');
  const disconnected = renderToStaticMarkup(
    <SpadesBoard
      view={view}
      connected={false}
      busy={false}
      onCommand={() => {}}
    />,
  );
  expect(disconnected).toContain('Reconnecting. Commands are paused.');
});
it('labels the exact last trick winner and public cards without interpreting rarity', () => {
  let state = initial();
  for (let i = 0; i < 4; i++)
    state = applySpadesMatch(state, {
      kind: 'BID',
      tricks: 3,
      playerId: state.deal.players[state.toBid]!,
      expectedVersion: state.stateVersion,
    });
  for (let i = 0; i < 4; i++) {
    const view = projectSpadesMatch(
      state,
      state.deal.players[state.deal.toAct]!,
    );
    if (view.legal?.kind !== 'PLAY') throw new Error('Expected legal plays');
    state = applySpadesMatch(state, {
      kind: 'PLAY',
      face: view.legal.cards[0]!,
      playerId: state.deal.players[state.deal.toAct]!,
      expectedVersion: state.stateVersion,
    });
  }
  const view = spadesViewSchema.parse(projectSpadesMatch(state, 'b')),
    winner = view.lastTrick!.winner;
  const html = renderToStaticMarkup(
    <SpadesBoard view={view} connected busy={false} onCommand={() => {}} />,
  );
  expect(html).toContain(`Last trick: Seat ${winner + 1}`);
  expect(html).toContain('won.');
  expect(html).toContain('played');
});
it('keeps a pending ID across newer snapshots and clears its old receipt without rollback', () => {
  let state = initial();
  const snapshot = spadesRoomViewSchema.parse({
    gameId,
    view: projectSpadesMatch(state, 'b'),
    settled: false,
    turnDeadline: null,
  });
  let replica: SpadesReplica = { gameId, snapshot: null, pending: null };
  replica = stageSpades(acceptSpades(replica, snapshot), 'same-command-0001', {
    kind: 'BID',
    tricks: 3,
  });
  state = applySpadesMatch(state, {
    kind: 'BID',
    playerId: 'b',
    expectedVersion: 0,
    tricks: 3,
  });
  const receipt = {
    ...snapshot,
    view: projectSpadesMatch(state, 'b'),
    commandId: 'same-command-0001',
    stateVersion: 1,
  };
  state = applySpadesMatch(state, {
    kind: 'BID',
    playerId: 'c',
    expectedVersion: 1,
    tricks: 3,
  });
  replica = acceptSpades(replica, {
    ...snapshot,
    view: projectSpadesMatch(state, 'b'),
  });
  expect(replica.pending!.commandId).toBe('same-command-0001');
  replica = receiptSpades(replica, receipt);
  expect(replica.pending).toBe(null);
  expect(replica.snapshot!.view.stateVersion).toBe(2);
  expect(() =>
    acceptSpades(replica, {
      ...snapshot,
      gameId: '00000000-0000-4000-8000-000000000002',
    }),
  ).toThrow('WRONG_ROOM');
});
it('stopping while token refresh is pending never opens a late socket', async () => {
  let resolve!: (value: string) => void;
  const token = new Promise<string>((done) => {
      resolve = done;
    }),
    connect = vi.fn<SpadesConnector>(),
    status = vi.fn();
  const stop = watchSpades(
    'https://api.example.invalid',
    () => token,
    gameId,
    () => {},
    status,
    connect,
  );
  stop();
  resolve('secret-test-token');
  await Promise.resolve();
  await Promise.resolve();
  expect(connect).not.toHaveBeenCalled();
  expect(status).toHaveBeenCalledWith(false);
});
it('fails closed if a payload accidentally includes another player hand', () => {
  const view = projectSpadesMatch(initial(), 'b');
  expect(
    spadesViewSchema.safeParse({
      ...view,
      players: view.players.map((player) => ({
        ...player,
        hand: initial().deal.hands[player.seat],
      })),
    }).success,
  ).toBe(false);
});
