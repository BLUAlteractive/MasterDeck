import { z } from 'zod';
const configSchema = z.object({
  AUTH_ISSUER: z.url().optional(),
  AUTH_AUDIENCE: z.string().min(1).default('authenticated'),
  AUTH_JWKS_URL: z.url().optional(),
  DATABASE_URL: z.string().optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().min(1).default('127.0.0.1'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:8081,http://localhost:3000'),
});
export function readConfig(env: Record<string, string | undefined>) {
  const result = configSchema.safeParse(env);
  if (!result.success)
    throw new Error(
      'Invalid API configuration. Check PORT, HOST and CORS_ORIGINS.',
    );
  const origins = result.data.CORS_ORIGINS.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    origins.some(
      (origin) =>
        !z.url().safeParse(origin).success || new URL(origin).origin !== origin,
    )
  ) {
    throw new Error('CORS_ORIGINS must contain exact URL origins.');
  }
  let auth: {
    issuer: string;
    audience: string;
    jwksUrl: string;
    databaseUrl: string;
  } | null = null;
  if (result.data.AUTH_ISSUER || result.data.AUTH_JWKS_URL) {
    const {
      AUTH_ISSUER: issuer,
      AUTH_JWKS_URL: jwksUrl,
      DATABASE_URL: databaseUrl,
    } = result.data;
    if (
      !issuer ||
      !jwksUrl ||
      !databaseUrl ||
      !issuer.startsWith('https://') ||
      !jwksUrl.startsWith('https://') ||
      new URL(issuer).origin !== new URL(jwksUrl).origin
    )
      throw new Error(
        'Invalid identity configuration; require trusted HTTPS issuer/JWKS and a database URL.',
      );
    auth = {
      issuer,
      jwksUrl,
      audience: result.data.AUTH_AUDIENCE,
      databaseUrl,
    };
  }
  return {
    auth,
    databaseUrl: result.data.DATABASE_URL ?? null,
    port: result.data.PORT,
    host: result.data.HOST,
    origins,
  };
}
