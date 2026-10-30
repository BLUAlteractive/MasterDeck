import { expect, it } from 'vitest';
import { canonicalFaces } from '@deckforge/game-core';
import {
  createSpadesMatch,
  applySpadesMatch,
  projectSpadesMatch,
} from './index';
import {
  spadesViewSchema,
  spadesCommandSchema,
} from '../../contracts/src/spades';
const policy = {
  version: 'SPADES_PROJECTION_FIXTURE',
  nilEnabled: true,
  nilPoints: 100,
  contractPoints: 10,
  bagPoints: 1,
  bagThreshold: 10,
  bagPenalty: 100,
  failedNilCountsAsBags: true,
  failedNilBagPoints: 1,
  targetScore: 500,
};
it('only own hand and turn legality appear in strict recipient projections', () => {
  let state = createSpadesMatch(
    ['a', 'b', 'c', 'd'],
    0,
    canonicalFaces.map((face) => face.id),
    policy,
  );
  const own = projectSpadesMatch(state, 'a');
  expect(spadesViewSchema.safeParse(own).success).toBe(true);
  expect(own.players.map((player) => player.hand?.length ?? null)).toEqual([
    13,
    null,
    null,
    null,
  ]);
  expect(own.legal).toBe(null);
  expect(projectSpadesMatch(state, 'b').legal).toEqual({
    kind: 'BID',
    min: 0,
    max: 13,
  });
  expect(() => projectSpadesMatch(state, 'outsider')).toThrow(
    'NOT_A_PARTICIPANT',
  );
  state = applySpadesMatch(state, {
    kind: 'BID',
    playerId: 'b',
    expectedVersion: 0,
    tricks: 3,
  });
  expect(projectSpadesMatch(state, 'a').players[1]!.bid).toBe(3);
  expect(Object.keys(own)).not.toContain('deck');
  expect(
    spadesViewSchema.safeParse({ ...own, deck: canonicalFaces }).success,
  ).toBe(false);
  expect(Object.isFrozen(own.players[0])).toBe(true);
});
it('wire commands reject identity, scores, decks and invalid faces', () => {
  const base = {
    gameId: '00000000-0000-4000-8000-000000000001',
    commandId: 'stable-command-0001',
    stateVersion: 0,
    payload: { kind: 'BID', tricks: 3 },
  };
  expect(spadesCommandSchema.safeParse(base).success).toBe(true);
  expect(spadesCommandSchema.safeParse({ ...base, userId: 'a' }).success).toBe(
    false,
  );
  expect(
    spadesCommandSchema.safeParse({
      ...base,
      payload: { kind: 'CONTINUE', deck: [] },
    }).success,
  ).toBe(false);
  expect(
    spadesCommandSchema.safeParse({
      ...base,
      payload: { kind: 'PLAY', face: 'JOKER' },
    }).success,
  ).toBe(false);
});
