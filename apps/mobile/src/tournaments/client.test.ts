import { it, expect, vi } from 'vitest';
import { createCollectionClient } from '../collection/client';
const id = '00000000-0000-4000-8000-000000000001';
it('binds registration and rematch readiness to strict IDs/attempts with a fresh bearer and bounded lists', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [], nextCursor: null })),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({ seed: 1 })))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ recorded: true, gameId: null })),
    );
  const token = vi
      .fn()
      .mockResolvedValueOnce('one')
      .mockResolvedValueOnce('two')
      .mockResolvedValueOnce('three'),
    client = createCollectionClient(
      'https://api.example.invalid',
      token,
      transport,
    );
  await client.tournaments();
  await client.registerTournament(id, id);
  await client.readyTournament(id, 2, id);
  expect(String(transport.mock.calls[0]![0])).toContain('limit=10');
  expect(JSON.parse(String(transport.mock.calls[2]![1]!.body))).toEqual({
    commandId: id,
    attempt: 2,
  });
  expect(transport.mock.calls[2]![1]!.headers).toMatchObject({
    Authorization: 'Bearer three',
  });
  await expect(client.readyTournament(id, 0, id)).rejects.toThrow();
  await expect(client.tournament('../private')).rejects.toThrow();
  expect(transport).toHaveBeenCalledTimes(3);
});
it('sends only a scoped result report and rejects response fields that could fabricate rewards', async () => {
  const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id, recorded: true })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ items: [], nextCursor: null, winner: 'forged' }),
        ),
      ),
    client = createCollectionClient(
      'https://api.example.invalid',
      async () => 'private-token',
      transport,
    );
  expect(
    await client.reportTournament(id, {
      commandId: id,
      matchId: id,
      code: 'CONNECTION_FAILURE',
    }),
  ).toEqual({ id, recorded: true });
  expect(JSON.parse(String(transport.mock.calls[0]![1]!.body))).toEqual({
    commandId: id,
    matchId: id,
    code: 'CONNECTION_FAILURE',
  });
  await expect(client.tournaments()).rejects.toThrow();
  expect(String(transport.mock.calls[0]![0])).not.toContain('private-token');
});
