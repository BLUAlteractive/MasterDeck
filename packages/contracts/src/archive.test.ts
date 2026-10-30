import { describe, expect, it } from 'vitest';
import { archiveCardSchema, archiveQuerySchema } from './index';
const retained = {
  instanceId: '10000000-0000-4000-8000-000000000001',
  faceId: 'A-S',
  level: 1,
  branch: 'BLUE',
  rarity: 'COMMON',
  stateVersion: 2,
  status: 'CONSUMED',
  seriesId: '10000000-0000-4000-8000-000000000002',
  seriesName: 'Test archive',
  templateVersion: 1,
  holding: 'PREVIOUSLY_OWNED',
  editionSerial: null,
  origin: null,
  createdAt: '2026-10-29T12:00:00.000Z',
};
describe('archive evidence contract', () => {
  it('preserves unknown legacy origin and serials without fabricating evidence', () => {
    const card = archiveCardSchema.parse(retained);
    expect(card.origin).toBeNull();
    expect(card.editionSerial).toBeNull();
    expect(card.status).toBe('CONSUMED');
    expect(
      archiveCardSchema.safeParse({ ...retained, ownerId: retained.instanceId })
        .success,
    ).toBe(false);
    expect(
      archiveCardSchema.safeParse({ ...retained, editionSerial: -1 }).success,
    ).toBe(false);
  });
  it('rejects owner selectors, invalid views and unbounded pages', () => {
    expect(archiveQuerySchema.parse({})).toEqual({ view: 'all', limit: 50 });
    for (const query of [
      { ownerId: retained.instanceId },
      { view: 'deleted' },
      { limit: 101 },
      { cursor: 'private-query' },
    ])
      expect(archiveQuerySchema.safeParse(query).success).toBe(false);
  });
});
