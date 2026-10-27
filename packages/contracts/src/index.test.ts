import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './index';
describe('public health contract', () => {
  it('accepts the API liveness response', () => {
    expect(
      healthResponseSchema.parse({ service: 'deckforge-api', status: 'ok' })
        .status,
    ).toBe('ok');
  });
  it('rejects unexpected private fields and invalid states', () => {
    expect(
      healthResponseSchema.safeParse({
        service: 'deckforge-api',
        status: 'ok',
        databaseUrl: 'private',
      }).success,
    ).toBe(false);
    expect(
      healthResponseSchema.safeParse({
        service: 'deckforge-api',
        status: 'unknown',
      }).success,
    ).toBe(false);
  });
});
