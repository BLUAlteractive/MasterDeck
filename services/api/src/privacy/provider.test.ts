import { it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { supabaseDeletionProvider } from './provider';
import { privacySubjectHash } from './key';
const issuer = 'https://identity.example.invalid/auth/v1';
const key = 'TEST_ONLY_SERVICE_KEY_00000000000';
it('requires successful hard deletion and independently verified absence, with no redirect following', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response('{}'))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'user_not_found' }), { status: 404 }),
    );
  const result = await supabaseDeletionProvider(
    { issuer, serviceRoleKey: key },
    transport,
  ).deleteIdentity(issuer, randomUUID(), randomUUID());
  expect(result).toMatchObject({
    confirmed: true,
    referenceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  expect(transport.mock.calls.map((c) => c[1]?.method)).toEqual([
    'DELETE',
    'GET',
  ]);
  expect(transport.mock.calls[0]![1]).toMatchObject({
    redirect: 'error',
    body: '{"should_soft_delete":false}',
  });
});
it('never treats ambiguous provider success or an unapproved issuer as deletion evidence', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
  const provider = supabaseDeletionProvider(
    { issuer, serviceRoleKey: key },
    transport,
  );
  await expect(
    provider.deleteIdentity(issuer, randomUUID(), randomUUID()),
  ).rejects.toThrow('unconfirmed');
  await expect(
    provider.deleteIdentity(
      'https://wrong.invalid',
      randomUUID(),
      randomUUID(),
    ),
  ).rejects.toThrow('Unapproved');
  expect(() =>
    supabaseDeletionProvider({
      issuer: 'http://bad.invalid/auth/v1',
      serviceRoleKey: key,
    }),
  ).toThrow();
});
it('uses a keyed issuer-scoped tombstone rather than a reversible subject or unkeyed hash', () => {
  const subject = randomUUID(),
    secret = Buffer.alloc(32, 1);
  const a = privacySubjectHash(secret, issuer, subject);
  expect(a).not.toContain(subject);
  expect(a).not.toBe(privacySubjectHash(secret, issuer + '/other', subject));
  expect(a).not.toBe(privacySubjectHash(Buffer.alloc(32, 2), issuer, subject));
});
