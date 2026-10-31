import { describe, it, expect, vi } from 'vitest';
import { createCollectionClient, CollectionError } from './client';
describe('session-bound collection transport', () => {
  it('reads a fresh token per request and never places it in URLs or bodies', async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(JSON.stringify({ items: [], nextCursor: null }), {
          status: 200,
        }),
    );
    const token = vi
      .fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');
    const client = createCollectionClient(
      'https://api.example.invalid',
      token,
      transport,
    );
    await client.list();
    await client.list();
    expect(transport.mock.calls[0]?.[1]?.headers).toEqual({
      Authorization: 'Bearer first',
    });
    expect(transport.mock.calls[1]?.[1]?.headers).toEqual({
      Authorization: 'Bearer second',
    });
    expect(String(transport.mock.calls[0]?.[0])).not.toContain('first');
  });
  it('validates responses, uses bounded pagination and propagates abort signals', async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(JSON.stringify({ items: [], nextCursor: null }), {
          status: 200,
        }),
    );
    const client = createCollectionClient(
      'https://api.example.invalid',
      async () => 'token',
      transport,
    );
    const controller = new AbortController();
    await client.list(undefined, controller.signal);
    expect(transport.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(String(transport.mock.calls[0]?.[0])).toContain('limit=100');
    transport.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ items: [{ ownerId: 'untrusted' }], nextCursor: null }),
        { status: 200 },
      ),
    );
    await expect(client.list()).rejects.toThrow();
  });
  it('cancels a pending transport on owner-view abort', async () => {
    const controller = new AbortController();
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const transport = vi.fn<typeof fetch>().mockImplementation(
      async (_url, options) =>
        new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new Error('Aborted')),
            { once: true },
          );
          started();
        }),
    );
    const pending = createCollectionClient(
      'https://api.example.invalid',
      async () => 'token',
      transport,
    ).list(undefined, controller.signal);
    const rejected = expect(pending).rejects.toThrow('Aborted');
    await ready;
    controller.abort();
    await rejected;
  });
  it('keeps tokens and server internals out of error messages, and rejects missing sessions/configuration', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('private server diagnostic', { status: 401 }),
      );
    await expect(
      createCollectionClient(
        'https://api.example.invalid',
        async () => 'token',
        transport,
      ).list(),
    ).rejects.toBeInstanceOf(CollectionError);
    await expect(
      createCollectionClient(
        'https://api.example.invalid',
        async () => '',
        transport,
      ).list(),
    ).rejects.toMatchObject({ status: 401 });
    expect(() =>
      createCollectionClient(
        'https://user:secret@example.invalid',
        async () => 'token',
      ),
    ).toThrow();
  });
});
it('rejects a pack receipt for another offer and never accepts a client draw or currency override', async () => {
  const id = '00000000-0000-4000-8000-000000000001',
    other = '00000000-0000-4000-8000-000000000002';
  const transport = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        openingId: id,
        packId: other,
        definitionHash: 'a'.repeat(64),
        currency: 'TRAIL_CREDITS',
        charged: '100',
        rngVersion: 'HMAC_SHA256_V1',
        seedCommitment: 'b'.repeat(64),
        outcomes: [{ kind: 'TRAIL_INK', units: 1 }],
      }),
    ),
  );
  const client = createCollectionClient(
    'https://api.example.invalid',
    async () => 'token',
    transport,
  );
  await expect(
    client.openPack(id, {
      commandId: id,
      expectedDefinitionHash: 'a'.repeat(64),
    }),
  ).rejects.toThrow('does not match');
  expect(JSON.parse(transport.mock.calls[0]![1]!.body as string)).toEqual({
    commandId: id,
    expectedDefinitionHash: 'a'.repeat(64),
  });
  expect(client.apiOrigin).toBe('https://api.example.invalid');
});
