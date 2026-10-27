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
