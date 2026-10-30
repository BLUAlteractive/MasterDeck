import { describe, expect, it } from 'vitest';
import {
  canonicalFaces,
  shuffleFaces,
  type FaceId,
} from '@deckforge/game-core';
import { buildPatternOracle } from '../test/pattern-oracle';
import {
  createEvolvedRules,
  evaluateEvolvedFive,
  evaluateEvolvedSeven,
  compareEvolvedCandidates,
  evolvedTieValue,
  getEvolvedRankClasses,
  evaluateFiveCardHand,
  evaluateSevenCardHand,
  type EarnedHole,
  type EvolvedContext,
} from './index';
const rules = createEvolvedRules('FIXTURE_ONLY_EFFECT_V1', [
  {
    id: 'fixture-series',
    seriesId: 'fixture',
    publicationVersion: 'TEST_ONLY',
  },
]);
const hole: FaceId[] = ['9-C', '10-D'];
const board: FaceId[] = ['J-H', 'Q-H', 'K-H', '2-D', '3-S'];
function owned(faceId: FaceId, index = 0): EarnedHole {
  return {
    instanceId: 'instance-' + faceId,
    ownerId: 'p',
    faceId,
    level: index ? 5 : 6,
    rarity: 'LEGENDARY',
    playStyleFamily: 'earned-style',
    seriesId: 'fixture',
    status: 'LOCKED',
  };
}
function context(
  holes: readonly FaceId[] = hole,
  community: readonly FaceId[] = board,
): EvolvedContext {
  return {
    playerId: 'p',
    hole: holes,
    board: community,
    instances: holes.map(owned),
  };
}
function rng(seed: number) {
  let value = seed;
  return (upper: number) => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value % upper;
  };
}
describe('approved experimental Evolved A', () => {
  it('maps all 7,462 exact conventional classes monotonically against independent oracle', () => {
    const table = getEvolvedRankClasses(),
      oracle = buildPatternOracle();
    expect(table).toHaveLength(7462);
    table.forEach((entry, index) => {
      expect(entry.rank.categoryIndex).toBe(oracle[index]!.category);
      expect(entry.rank.tiebreak).toEqual(oracle[index]!.tie);
      expect(entry.tieValue).toBeGreaterThanOrEqual(0);
      expect(entry.tieValue).toBeLessThanOrEqual(499);
      if (
        index &&
        table[index - 1]!.rank.categoryIndex === entry.rank.categoryIndex
      )
        expect(entry.tieValue).toBeGreaterThanOrEqual(
          table[index - 1]!.tieValue,
        );
    });
    expect(
      table
        .filter((entry) => entry.rank.categoryIndex === 4)
        .map((entry) => entry.tieValue),
    ).toEqual([0, 56, 112, 168, 225, 281, 337, 393, 450, 499]);
    expect(Object.isFrozen(table[0])).toBe(true);
  });
  it('attains corrected Straight 5500 and neutral Flush 5210 with valid card candidates', () => {
    const straight = evaluateEvolvedFive(
      [...hole, ...board.slice(0, 3)],
      context(),
      rules,
    );
    expect(straight).toMatchObject({
      baseScore: 4450,
      score: 5500,
      bonus: {
        levelPoints: 630,
        rarityPoints: 240,
        stylePoints: 120,
        seriesPoints: 60,
        total: 1050,
      },
    });
    const flushContext = {
      playerId: 'p',
      hole: ['K-H', '10-H'] as FaceId[],
      board: ['7-H', '4-H', '3-H', '2-C', '5-D'] as FaceId[],
      instances: [],
    };
    const flush = evaluateEvolvedFive(
      [...flushContext.hole, ...flushContext.board.slice(0, 3)],
      flushContext,
      rules,
    );
    expect(flush.score).toBe(5210);
    expect(compareEvolvedCandidates(straight, flush)).toBe(1);
    expect(straight.rank.strength).toBeLessThan(flush.rank.strength);
  });
  it('examines all 21 candidates and can select a non-Classic-best five on one shared board', () => {
    const shared: FaceId[] = ['9-H', '10-H', 'J-H', '2-H', '3-H'];
    const holes: FaceId[] = ['Q-C', 'K-D'];
    const result = evaluateEvolvedSeven(context(holes, shared), rules);
    expect(result.candidates).toHaveLength(21);
    expect(result.best.rank.category).toBe('STRAIGHT');
    expect(result.best.score).toBe(5500);
    expect(evaluateSevenCardHand([...holes, ...shared]).rank.category).toBe(
      'FLUSH',
    );
    const neutral = evaluateEvolvedSeven(
      { playerId: 'other', hole: ['7-C', '8-D'], board: shared, instances: [] },
      rules,
    );
    expect(neutral.best.rank.category).toBe('FLUSH');
    expect(compareEvolvedCandidates(result.best, neutral.best)).toBe(1);
  });
  it('awards pocket/style/series only for both included eligible holes and caps at 1200', () => {
    const holes: FaceId[] = ['A-C', 'A-D'],
      community: FaceId[] = ['2-H', '5-S', '8-C', '9-D', 'J-H'];
    const c = {
      ...context(holes, community),
      instances: holes.map((face) => ({ ...owned(face), level: 6 })),
    };
    const both = evaluateEvolvedFive(
      [...holes, ...community.slice(0, 3)],
      c,
      rules,
    );
    expect(both.bonus).toMatchObject({
      levelPoints: 700,
      rarityPoints: 240,
      stylePoints: 120,
      pairPoints: 80,
      seriesPoints: 60,
      rawTotal: 1200,
      total: 1200,
      capApplied: false,
    });
    const one = evaluateEvolvedFive(
      [holes[0]!, ...community.slice(0, 4)],
      c,
      rules,
    );
    expect(one.bonus).toMatchObject({
      levelPoints: 350,
      rarityPoints: 120,
      stylePoints: 0,
      pairPoints: 0,
      seriesPoints: 0,
      total: 470,
    });
    const none = evaluateEvolvedFive(community, c, rules);
    expect(none.bonus.total).toBe(0);
  });
  it('requires earned style equality and explicitly configured same-series publication', () => {
    const c = context();
    const mismatched = {
      ...c,
      instances: c.instances.map((instance, index) => ({
        ...instance,
        playStyleFamily: 'style-' + index,
        seriesId: 'series-' + index,
      })),
    };
    const result = evaluateEvolvedFive(
      [...hole, ...board.slice(0, 3)],
      mismatched,
      rules,
    );
    expect(result.bonus.stylePoints).toBe(0);
    expect(result.bonus.seriesPoints).toBe(0);
    expect(
      evaluateEvolvedSeven(c, createEvolvedRules('NONE_V1')).best.bonus
        .seriesPoints,
    ).toBe(0);
    const effects = [
      { id: 'effect', seriesId: 'fixture', publicationVersion: 'TEST_ONLY' },
    ];
    const policy = createEvolvedRules('TEST', effects);
    effects[0]!.seriesId = 'changed';
    expect(policy.sameSeriesEffects[0]!.seriesId).toBe('fixture');
    expect(() => createEvolvedRules('TEST', [...effects, ...effects])).toThrow(
      'INVALID_EVOLVED_POLICY',
    );
  });
  it('rejects foreign owners, board metadata, duplicate instances, invalid levels/rarities/status and cards', () => {
    const c = context();
    for (const patch of [
      { ownerId: 'other' },
      { level: 7 },
      { level: 1.5 },
      { rarity: 'PAID' },
      { status: 'CONSUMED' },
      { faceId: board[0] },
    ])
      expect(() =>
        evaluateEvolvedSeven(
          { ...c, instances: [{ ...c.instances[0]!, ...patch } as EarnedHole] },
          rules,
        ),
      ).toThrow('INELIGIBLE_HOLE_INSTANCE');
    expect(() =>
      evaluateEvolvedSeven(
        { ...c, instances: [c.instances[0]!, c.instances[0]!] },
        rules,
      ),
    ).toThrow('INVALID_EVOLVED_CONTEXT');
    expect(() =>
      evaluateEvolvedSeven(
        { ...c, board: [hole[0]!, ...board.slice(1)] },
        rules,
      ),
    ).toThrow('INVALID_EVOLVED_CONTEXT');
    expect(() =>
      evaluateEvolvedFive(['A-S', ...board.slice(0, 4)], c, rules),
    ).toThrow('INVALID_CANDIDATE');
  });
  it('ignores purchased display fields, input order and suits as a final tie-break', () => {
    const c = context();
    const skin = {
      ...c,
      instances: c.instances.map((instance) => ({
        ...instance,
        displaySkin: { paid: true, rarity: 'LEGENDARY', boost: 99999 },
      })),
    };
    expect(evaluateEvolvedSeven(skin, rules)).toEqual(
      evaluateEvolvedSeven(c, rules),
    );
    expect(
      evaluateEvolvedSeven(
        {
          ...c,
          hole: [...c.hole].reverse(),
          board: [...c.board].reverse(),
          instances: [...c.instances].reverse(),
        },
        rules,
      ),
    ).toEqual(evaluateEvolvedSeven(c, rules));
    const a = evaluateEvolvedFive(board, context(), rules),
      b = { ...a, cards: [...a.cards].reverse() };
    expect(compareEvolvedCandidates(a, b)).toBe(0);
  });
  it('uses exact conventional fallback for quantization collisions and ties only equal exact ranks', () => {
    const table = getEvolvedRankClasses();
    const index = table.findIndex(
      (entry, i) =>
        i > 0 &&
        entry.rank.categoryIndex === table[i - 1]!.rank.categoryIndex &&
        entry.tieValue === table[i - 1]!.tieValue,
    );
    const low = table[index - 1]!,
      high = table[index]!;
    const template = evaluateEvolvedFive(board, context(), rules);
    expect(
      compareEvolvedCandidates(
        { ...template, score: low.tieValue, rank: low.rank },
        { ...template, score: high.tieValue, rank: high.rank },
      ),
    ).toBe(-1);
    expect(compareEvolvedCandidates(template, template)).toBe(0);
  });
  it('proves max capped bonus cannot cross two categories for every rank class', () => {
    const table = getEvolvedRankClasses();
    for (const entry of table) {
      if (entry.rank.categoryIndex <= 6)
        expect(
          entry.rank.categoryIndex * 1000 + entry.tieValue + 1200,
        ).toBeLessThan((entry.rank.categoryIndex + 2) * 1000);
    }
  });
  it('matches independent best-candidate enumeration on 1000 seeded neutral/earned deals', () => {
    const random = rng(231);
    for (let sample = 0; sample < 1000; sample++) {
      const deck = shuffleFaces(random),
        holes = deck.slice(0, 2),
        community = deck.slice(2, 7),
        c = context(holes, community);
      const result = evaluateEvolvedSeven(c, rules);
      const neutral = evaluateEvolvedSeven({ ...c, instances: [] }, rules);
      expect(neutral.best.rank).toEqual(
        evaluateSevenCardHand([...holes, ...community]).rank,
      );
      const all = [...holes, ...community];
      let maximum = -1;
      for (let omittedA = 0; omittedA < 6; omittedA++)
        for (let omittedB = omittedA + 1; omittedB < 7; omittedB++) {
          const cards = all.filter((_, i) => i !== omittedA && i !== omittedB);
          const candidate = evaluateEvolvedFive(cards, c, rules);
          maximum = Math.max(maximum, candidate.score);
          expect(candidate.rank).toEqual(evaluateFiveCardHand(cards));
        }
      expect(result.best.score).toBe(maximum);
      expect(Object.isFrozen(result.best.bonus.includedHoles)).toBe(true);
    }
  });
  it('does not change face probabilities or introduce collection cards into a deal', () => {
    expect(canonicalFaces).toHaveLength(52);
    expect(new Set(shuffleFaces(rng(23))).size).toBe(52);
    expect(
      evolvedTieValue(
        evaluateFiveCardHand(['A-C', '2-D', '3-H', '4-S', '5-C']),
      ),
    ).toBe(0);
  });
});
