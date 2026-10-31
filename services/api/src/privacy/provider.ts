import { z } from 'zod';
import { hash } from '../rooms/shared';
export interface DeletionProvider {
  deleteIdentity(
    issuer: string,
    subject: string,
    requestId: string,
  ): Promise<{ confirmed: true; referenceHash: string }>;
}
/** Trusted server config only. Never pass a client issuer, service role key or success flag. */
export function supabaseDeletionProvider(
  config: { issuer: string; serviceRoleKey: string },
  transport: typeof fetch = fetch,
): DeletionProvider {
  const issuer = new URL(config.issuer);
  if (
    issuer.protocol !== 'https:' ||
    issuer.pathname !== '/auth/v1' ||
    issuer.username ||
    issuer.password ||
    issuer.search ||
    issuer.hash ||
    config.serviceRoleKey.length < 20
  )
    throw new Error('Invalid protected deletion provider configuration');
  async function request(subject: string, method: 'DELETE' | 'GET') {
    return transport(issuer.href + '/admin/users/' + z.uuid().parse(subject), {
      method,
      redirect: 'error',
      headers: {
        Authorization: 'Bearer ' + config.serviceRoleKey,
        apikey: config.serviceRoleKey,
        ...(method === 'DELETE' ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(method === 'DELETE'
        ? { body: JSON.stringify({ should_soft_delete: false }) }
        : {}),
      signal: AbortSignal.timeout(10000),
    });
  }
  async function absent(response: Response) {
    if (response.status !== 404) return false;
    return z
      .object({ code: z.literal('user_not_found') })
      .passthrough()
      .safeParse(await response.json()).success;
  }
  return {
    async deleteIdentity(actualIssuer, subject, requestId) {
      if (actualIssuer !== issuer.href)
        throw new Error('Unapproved identity issuer');
      const deleted = await request(subject, 'DELETE');
      if (!deleted.ok && !(await absent(deleted)))
        throw new Error('Provider deletion unconfirmed');
      const checked = await request(subject, 'GET');
      if (!(await absent(checked)))
        throw new Error('Provider identity still present or unconfirmed');
      return {
        confirmed: true,
        referenceHash: hash({ issuer: actualIssuer, subject, requestId }),
      };
    },
  };
}
