import { it, expect } from 'vitest';
import { readConfig } from './config';
const deployment = {
  DEPLOYMENT_ENV: 'staging',
  NODE_ENV: 'production',
  HOST: '0.0.0.0',
  CORS_ORIGINS: 'https://admin.example.invalid',
  AUTH_ISSUER: 'https://identity.example.invalid/auth/v1',
  AUTH_JWKS_URL:
    'https://identity.example.invalid/auth/v1/.well-known/jwks.json',
  DATABASE_URL:
    'postgresql://TEST_ONLY:TEST_ONLY@db.example.invalid/deckforge?sslmode=verify-full',
};
it('keeps local setup available but requires explicitly separated deployed identity/origins/TLS', () => {
  expect(readConfig({}).deploymentEnvironment).toBe('local');
  expect(readConfig(deployment).deploymentEnvironment).toBe('staging');
  expect(
    readConfig({ ...deployment, DEPLOYMENT_ENV: 'production' })
      .deploymentEnvironment,
  ).toBe('production');
  expect(() => readConfig({ NODE_ENV: 'production' })).toThrow('explicit');
});
it('rejects deployed local/wildcard/plaintext/duplicate origins and database TLS downgrade without echoing secrets', () => {
  for (const changes of [
    { CORS_ORIGINS: 'http://localhost:8081' },
    { CORS_ORIGINS: 'https://127.8.1.2' },
    { CORS_ORIGINS: 'https://[::ffff:127.0.0.1]' },
    { CORS_ORIGINS: '*' },
    {
      CORS_ORIGINS:
        'https://admin.example.invalid,https://admin.example.invalid',
    },
    {
      DATABASE_URL:
        'postgresql://TEST_ONLY:DO_NOT_ECHO@db.example.invalid/db?sslmode=disable',
    },
    {
      DATABASE_URL:
        'postgresql://TEST_ONLY:DO_NOT_ECHO@db.example.invalid/db?sslmode=verify-full&sslmode=disable',
    },
    {
      DATABASE_URL:
        'postgresql://TEST_ONLY:DO_NOT_ECHO@db.example.invalid/db?sslmode=verify-full&ssl=false',
    },
    { AUTH_ISSUER: undefined, AUTH_JWKS_URL: undefined },
  ]) {
    try {
      readConfig({ ...deployment, ...changes });
      throw new Error('Unexpectedly accepted unsafe deployment');
    } catch (error) {
      expect(String(error)).not.toContain('DO_NOT_ECHO');
      expect(String(error)).not.toContain('Unexpectedly accepted');
    }
  }
});
