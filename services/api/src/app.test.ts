import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@deckforge/contracts';
import { createApp } from './app';
import { readConfig } from './config';

describe('API shell over HTTP', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let base: string;
  beforeAll(async () => {
    app = await createApp(['http://localhost:8081']);
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
  });
  it('serves only a validated public health response', async () => {
    const response = await fetch(`${base}/health`, {
      headers: { Origin: 'http://localhost:8081' },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:8081',
    );
    expect(healthResponseSchema.parse(await response.json())).toEqual({
      service: 'deckforge-api',
      status: 'ok',
    });
  });
  it('fails closed when identity is not configured', async () => {
    const response = await fetch(`${base}/v1/me`);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: 'AUTH_NOT_CONFIGURED' },
    });
  });
  it.each(['collection/archive', 'collection/album'])(
    'fails closed for unconfigured private %s',
    async (path) => {
      const response = await fetch(`${base}/v1/${path}`);
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        error: { code: 'AUTH_NOT_CONFIGURED' },
      });
    },
  );
  it('bounds JSON requests before auth processing', async () => {
    const response = await fetch(`${base}/v1/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oversized: 'x'.repeat(20000) }),
    });
    expect(response.status).toBe(413);
  });
  it('rejects client role/actor fields before provisioning', async () => {
    const response = await fetch(`${base}/v1/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'ADMIN', userId: 'forged' }),
    });
    expect(response.status).toBe(400);
  });
  it('does not enable unconfigured browser origins or business routes', async () => {
    const response = await fetch(`${base}/health`, {
      headers: { Origin: 'https://untrusted.example' },
    });
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect((await fetch(`${base}/cards`)).status).toBe(404);
  });
});
describe('environment validation', () => {
  it('uses loopback defaults', () => {
    expect(readConfig({}).host).toBe('127.0.0.1');
  });
  it.each(['0', '65536', 'not-a-port'])('rejects invalid port %s', (PORT) => {
    expect(() => readConfig({ PORT })).toThrow('Invalid API configuration');
  });
  it('rejects wildcard origins and paths', () => {
    expect(() => readConfig({ CORS_ORIGINS: '*' })).toThrow();
    expect(() =>
      readConfig({ CORS_ORIGINS: 'https://example.com/path' }),
    ).toThrow();
  });
});

describe('identity environment validation', () => {
  it('requires complete HTTPS identity configuration', () => {
    expect(() =>
      readConfig({ AUTH_ISSUER: 'http://localhost/auth/v1' }),
    ).toThrow();
    expect(() =>
      readConfig({
        AUTH_ISSUER: 'https://auth.example.invalid/auth/v1',
        AUTH_JWKS_URL: 'https://other.example.invalid/keys',
        DATABASE_URL: 'postgresql://fixture:fixture@localhost/fixture',
      }),
    ).toThrow();
    expect(readConfig({}).auth).toBeNull();
  });
});
