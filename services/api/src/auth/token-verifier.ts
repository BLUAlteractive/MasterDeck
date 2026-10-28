import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import { ApiFailure } from './errors';

const claimsSchema = z.object({
  iss: z.string(),
  sub: z.uuid(),
  session_id: z.uuid(),
  exp: z.number().int().positive(),
  iat: z.number().int().positive(),
  role: z.literal('authenticated'),
  is_anonymous: z.boolean(),
  aal: z.enum(['aal1', 'aal2']),
});
export type IdentityClaims = z.infer<typeof claimsSchema>;
export interface TokenVerifier {
  verify(token: string): Promise<IdentityClaims>;
}

/** The URL comes only from trusted server configuration, never a JWT header. */
export function createTokenVerifier(config: {
  issuer: string;
  audience: string;
  jwksUrl: string;
}): TokenVerifier {
  const keys = createRemoteJWKSet(new URL(config.jwksUrl), {
    timeoutDuration: 5000,
  });
  return {
    async verify(token) {
      try {
        if (!token || token.length > 16384)
          throw new Error('invalid token size');
        const { payload } = await jwtVerify(token, keys, {
          issuer: config.issuer,
          audience: config.audience,
          algorithms: ['ES256', 'RS256'],
          requiredClaims: [
            'iss',
            'sub',
            'aud',
            'exp',
            'iat',
            'session_id',
            'is_anonymous',
          ],
        });
        const claims = claimsSchema.parse(payload);
        if (claims.iat > Math.floor(Date.now() / 1000) + 5)
          throw new Error('future token');
        return claims;
      } catch {
        throw new ApiFailure('UNAUTHORIZED', 401);
      }
    },
  };
}
export function bearerToken(header: unknown): string {
  if (typeof header !== 'string' || header.length > 16400)
    throw new ApiFailure('UNAUTHORIZED', 401);
  const match = /^Bearer ([^\s]+)$/i.exec(header);
  if (!match?.[1]) throw new ApiFailure('UNAUTHORIZED', 401);
  return match[1];
}
