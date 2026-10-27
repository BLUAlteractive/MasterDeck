import { z } from 'zod';
const configSchema = z.object({
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
  return { port: result.data.PORT, host: result.data.HOST, origins };
}
