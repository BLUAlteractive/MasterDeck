import { pokerViewSchema } from '@deckforge/contracts';
import { it, expect, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Socket } from 'socket.io-client';
import { canonicalFaces } from '@deckforge/game-core';
import {
  createPokerHand,
  projectPokerHand,
  reducePokerHand,
} from '../../../../packages/game-poker/src';
import { PokerBoard } from './PokerTable';
import { watchPoker } from './poker-watch';
import type { RoomConnector } from './room-watch';
const gameId = '00000000-0000-4000-8000-000000000001';
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
const frame = () => ({
  gameId,
  view: pokerViewSchema.parse(projectPokerHand(initial(), 'a')),
  turnDeadline: null,
  settled: false,
});
it('shows only projected cards and legal controls, earned stake labels and accessible bounded raises', () => {
  const view = frame().view,
    html = renderToStaticMarkup(
      <PokerBoard
        view={view}
        connected
        busy={false}
        pending={false}
        onCommand={() => {}}
        onRetry={() => {}}
      />,
    );
  expect(html).toContain('Hidden cards');
  expect(html).toContain('Your turn.');
  expect(html).toContain('Call 1 earned Play Chips');
  expect(html).toContain('Raise to total earned Play Chips');
  expect(html).toContain('Confirm raise to 4');
  expect(html).not.toContain('Waiting for the other player.');
  const observer = renderToStaticMarkup(
    <PokerBoard
      view={pokerViewSchema.parse(projectPokerHand(initial(), 'b'))}
      connected
      busy={false}
      pending={false}
      onCommand={() => {}}
      onRetry={() => {}}
    />,
  );
  expect(observer).not.toContain('Confirm raise');
  expect(observer).toContain('Waiting for the other player.');
});
it('pauses commands on disconnect, preserves a retry control and labels final stacks as server results', () => {
  const disconnected = renderToStaticMarkup(
    <PokerBoard
      view={frame().view}
      connected={false}
      busy={false}
      pending
      onCommand={() => {}}
      onRetry={() => {}}
    />,
  );
  expect(disconnected).toContain('Reconnecting. Commands are paused.');
  expect(disconnected).toContain('Retry unconfirmed poker command');
  expect(disconnected).toContain('aria-disabled="true"');
  const ended = reducePokerHand(initial(), {
      playerId: 'a',
      expectedVersion: 0,
      action: 'FOLD',
    }),
    html = renderToStaticMarkup(
      <PokerBoard
        view={pokerViewSchema.parse(projectPokerHand(ended, 'a'))}
        connected
        busy={false}
        pending={false}
        onCommand={() => {}}
        onRetry={() => {}}
      />,
    );
  expect(html).toContain('Server result: FOLD');
  expect(html).toContain('Tournament advancement is confirmed separately');
  expect(html).not.toContain('Confirm raise');
});
afterEach(() => vi.useRealTimers());
it('refreshes bearer tokens, resumes the latest version, rejects wrong/private frames and cleans up sockets', async () => {
  vi.useFakeTimers();
  const sockets: {
    handlers: Map<string, (...args: unknown[]) => void>;
    socket: Socket;
    emit: ReturnType<typeof vi.fn>;
  }[] = [];
  const connect = vi.fn<RoomConnector>().mockImplementation(() => {
    const handlers = new Map<string, (...args: unknown[]) => void>(),
      socket = {
        on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
          handlers.set(event, fn);
          return socket;
        }),
        timeout: vi.fn(() => socket),
        emit: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        removeAllListeners: vi.fn(),
      } as unknown as Socket;
    sockets.push({
      handlers,
      socket,
      emit: socket.emit as unknown as ReturnType<typeof vi.fn>,
    });
    return socket;
  });
  const token = vi
      .fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second'),
    receive = vi.fn(),
    status = vi.fn(),
    stop = watchPoker(
      'https://api.example.invalid',
      token,
      gameId,
      receive,
      status,
      connect,
    );
  await Promise.resolve();
  sockets[0]!.handlers.get('connect')!();
  let ack = sockets[0]!.emit.mock.calls[0]![2] as (
    error: unknown,
    input: unknown,
  ) => void;
  ack(null, { ...frame(), continuity: 'SNAPSHOT' });
  expect(status).toHaveBeenLastCalledWith(true);
  expect(receive).toHaveBeenCalledTimes(1);
  sockets[0]!.handlers.get('game.state')!({
    ...frame(),
    view: { ...frame().view, stateVersion: 3 },
  });
  sockets[0]!.handlers.get('game.state')!({
    ...frame(),
    view: { ...frame().view, stateVersion: 1 },
  });
  expect(receive).toHaveBeenCalledTimes(2);
  sockets[0]!.handlers.get('game.state')!({ ...frame(), deck: ['forbidden'] });
  expect(sockets[0]!.socket.disconnect).toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1000);
  expect(token).toHaveBeenCalledTimes(2);
  expect(connect.mock.calls[1]![1].auth).toEqual({ token: 'second' });
  sockets[1]!.handlers.get('connect')!();
  expect(sockets[1]!.emit.mock.calls[0]![1]).toEqual({
    gameId,
    afterVersion: 3,
  });
  ack = sockets[1]!.emit.mock.calls[0]![2] as typeof ack;
  ack(null, {
    ...frame(),
    gameId: '00000000-0000-4000-8000-000000000002',
    continuity: 'SNAPSHOT',
  });
  expect(status).toHaveBeenLastCalledWith(false);
  stop();
  await vi.advanceTimersByTimeAsync(30000);
  expect(connect).toHaveBeenCalledTimes(2);
  expect(sockets[1]!.socket.removeAllListeners).toHaveBeenCalled();
});
it('does not create a socket when an owner view ends during token refresh', async () => {
  let finish!: (token: string) => void;
  const token = new Promise<string>((resolve) => {
      finish = resolve;
    }),
    connect = vi.fn<RoomConnector>();
  const stop = watchPoker(
    'https://api.example.invalid',
    () => token,
    gameId,
    () => {},
    () => {},
    connect,
  );
  stop();
  finish('late');
  await Promise.resolve();
  expect(connect).not.toHaveBeenCalled();
});
