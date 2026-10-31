import { z } from 'zod';
const configSchema = z.object({
  DEPLOYMENT_ENV: z.enum(['local', 'staging', 'production']).default('local'),
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
  const deploymentEnvironment = result.data.DEPLOYMENT_ENV;
  if (env.NODE_ENV === 'production' && deploymentEnvironment === 'local')
    throw new Error(
      'Production process requires explicit staging or production environment',
    );
  if (deploymentEnvironment !== 'local') {
    let database: URL;
    try {
      database = new URL(result.data.DATABASE_URL ?? '');
    } catch {
      throw new Error('Deployed database configuration required');
    }
    const local = (host: string) =>
      ['localhost', '0.0.0.0', '[::]', '[::1]'].includes(host) ||
      host.startsWith('127.') ||
      host.startsWith('[::ffff:7f') ||
      host.endsWith('.localhost');
    if (
      !auth ||
      !origins.length ||
      origins.length > 10 ||
      new Set(origins).size !== origins.length ||
      origins.some(
        (o) => new URL(o).protocol !== 'https:' || local(new URL(o).hostname),
      ) ||
      database.protocol !== 'postgresql:' ||
      local(database.hostname) ||
      database.searchParams.getAll('sslmode').length !== 1 ||
      database.searchParams.get('sslmode') !== 'verify-full' ||
      database.searchParams.has('ssl')
    )
      throw new Error(
        'Deployed API requires managed identity, exact HTTPS origins and verified database TLS',
      );
  }
  return {
    deploymentEnvironment,
    auth,
    databaseUrl: result.data.DATABASE_URL ?? null,
    port: result.data.PORT,
    host: result.data.HOST,
    origins,
  };
}
