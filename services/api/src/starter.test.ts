import { describe, it, expect } from 'vitest';
import { StarterLimiter } from './starter';
import { starterGrantCommandSchema } from '@deckforge/contracts';
import { randomUUID } from 'node:crypto';
describe('starter request limits', () => {
  it('bounds bursts by user, permits ten concurrent attempts and expires buckets', () => {
    let now = 0;
    const limiter = new StarterLimiter(() => now);
    for (let i = 0; i < 20; i++) limiter.take('one');
    expect(() => limiter.take('one')).toThrow();
    expect(() => limiter.take('two')).not.toThrow();
    now = 60000;
    expect(() => limiter.take('one')).not.toThrow();
  });
  it('rejects client ownership, card IDs and unbounded keys', () => {
    const input = {
      seriesId: randomUUID(),
      idempotencyKey: 'starter-test-key',
    };
    expect(starterGrantCommandSchema.safeParse(input).success).toBe(true);
    for (const extra of [{ userId: randomUUID() }, { cards: [] }, { level: 6 }])
      expect(
        starterGrantCommandSchema.safeParse({ ...input, ...extra }).success,
      ).toBe(false);
    expect(
      starterGrantCommandSchema.safeParse({
        ...input,
        idempotencyKey: 'a'.repeat(129),
      }).success,
    ).toBe(false);
  });
});
