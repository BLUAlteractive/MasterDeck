import { beforeAll, afterAll, it, expect } from 'vitest';
import { identityFixture } from '../test/auth-fixture';
let f: Awaited<ReturnType<typeof identityFixture>>;
beforeAll(async () => {
  f = await identityFixture();
});
afterAll(async () => {
  await f?.close();
});
it('sets noncacheable, non-sniffable, nonframed API responses and conceals framework identification', async () => {
  const response = await f.request('me', f.players[0]!.bearer);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('content-security-policy')).toContain(
    "frame-ancestors 'none'",
  );
  expect(response.headers.get('x-powered-by')).toBeNull();
});
it('rejects oversized/unknown requests and unauthorized admin surfaces without secret diagnostics', async () => {
  const unauthorized = await f.request('admin/operations/snapshot', undefined, {
    commandId: crypto.randomUUID(),
    reason: 'No authority supplied',
  });
  expect(unauthorized.status).toBe(401);
  const large = await f.request('safety/commands', f.players[0]!.bearer, {
    payload: 'x'.repeat(17000),
  });
  expect(large.status).toBe(413);
  const text = await large.text();
  expect(text).not.toContain('payload');
  expect(text).not.toContain('stack');
  const injection = await f.request(
    'cards?ownerId=' + f.players[1]!.userId,
    f.players[0]!.bearer,
  );
  expect(injection.status).toBe(400);
});
