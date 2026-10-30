/** Offline diagnostic fixture code. Never imported by production apps/API or a runtime build. */
import { shuffleFaces, type FaceId } from '@deckforge/game-core';
import { evaluateSevenCardHand } from '../src/seven';
import {
  createEvolvedRules,
  evaluateEvolvedSeven,
  compareEvolvedCandidates,
  type EarnedHole,
  type EvolvedContext,
} from '../src/evolved';
import { EVOLVED_A_EXPERIMENTAL_V1 } from '../src/evolved-ranks';
export const cohortNames = Object.freeze([
  'NEUTRAL_CONTROL',
  'COSMETIC_CONTROL',
  'EARLY_EARNED',
  'MIXED_EARNED',
  'MAX_EARNED',
  'EARNED_PARITY',
] as const);
export type Cohort = (typeof cohortNames)[number];
const policy = createEvolvedRules('SIMULATION_FIXTURE_ONLY_V1', [
  {
    id: 'fixture-set',
    seriesId: 'fixture-set',
    publicationVersion: 'SIMULATION_ONLY_NOT_PUBLICATION',
  },
]);
const round = (value: number) => Math.round(value * 1e8) / 1e8;
/** Wilson 95% interval for the outright-win indicator (ties are not wins). */
export function wilson95(wins: number, count: number): readonly number[] {
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    !Number.isInteger(wins) ||
    wins < 0 ||
    wins > count
  )
    throw new Error('INVALID_STATISTICS');
  const z = 1.959963984540054,
    p = wins / count,
    denominator = 1 + (z * z) / count,
    center = (p + (z * z) / (2 * count)) / denominator,
    half =
      (z * Math.sqrt((p * (1 - p)) / count + (z * z) / (4 * count * count))) /
      denominator;
  return Object.freeze([
    round(Math.max(0, center - half)),
    round(Math.min(1, center + half)),
  ]);
}
function seededSource(seed: number): (upper: number) => number {
  let state = seed >>> 0;
  return (upper) => {
    const limit = Math.floor(4294967296 / upper) * upper;
    let value: number;
    do {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      value = state >>> 0;
    } while (value >= limit);
    return value % upper;
  };
}
function metadata(
  playerId: string,
  holes: readonly FaceId[],
  kind: 'BASE' | 'EARLY' | 'MIXED' | 'MAX',
  random: (upper: number) => number,
): EarnedHole[] {
  return holes.map((faceId, index) => {
    const mixed = kind === 'MIXED',
      level =
        kind === 'MAX'
          ? 6
          : kind === 'EARLY'
            ? 3
            : mixed
              ? [1, 2, 3, 4, 5, 6][random(6)]!
              : 1;
    const rarity =
      kind === 'MAX'
        ? 'LEGENDARY'
        : kind === 'EARLY'
          ? 'UNCOMMON'
          : mixed
            ? (['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'] as const)[
                random(5)
              ]!
            : 'COMMON';
    return {
      instanceId: playerId + '-' + faceId,
      ownerId: playerId,
      faceId,
      level,
      rarity,
      playStyleFamily:
        mixed && random(2) === 0 ? 'mixed-' + index : 'earned-family',
      seriesId:
        kind === 'MAX' || (mixed && random(2) === 0)
          ? 'fixture-set'
          : 'base-fixture',
      status: 'LOCKED',
    };
  });
}
function accumulator(name: Cohort) {
  return {
    name,
    samples: 0,
    wins: 0,
    ties: 0,
    losses: 0,
    classicWins: 0,
    classicTies: 0,
    rankReversals: 0,
    classicTiesResolved: 0,
    newTies: 0,
    upsetsByClassicCategoryDeficit: {
      sameCategory: 0,
      oneCategory: 0,
      twoOrMore: 0,
    },
    maximumObservedBonus: 0,
    chosenCategories: Array<number>(9).fill(0),
  };
}
export function runEvolvedSimulation(
  hands = 100000,
  seed = 230026,
  progress?: (done: number) => void,
) {
  if (
    !Number.isSafeInteger(hands) ||
    hands < 6 ||
    hands > 1000000 ||
    !Number.isSafeInteger(seed) ||
    seed < 1 ||
    seed > 4294967295
  )
    throw new Error('INVALID_SIMULATION_CONFIG');
  const random = seededSource(seed),
    cohorts = cohortNames.map(accumulator);
  const technical = {
    neutralMismatches: 0,
    cosmeticMismatches: 0,
    twoCategoryUpsets: 0,
    nonIntegerScores: 0,
    invalidDecks: 0,
  };
  for (let sample = 0; sample < hands; sample++) {
    const cohort = cohorts[sample % cohorts.length]!,
      deck = shuffleFaces(random);
    if (new Set(deck).size !== 52) technical.invalidDecks++;
    const holeA = [deck[0]!, deck[2]!],
      holeB = [deck[1]!, deck[3]!],
      board = [deck[5]!, deck[6]!, deck[7]!, deck[9]!, deck[11]!];
    const rankA = evaluateSevenCardHand([...holeA, ...board]).rank,
      rankB = evaluateSevenCardHand([...holeB, ...board]).rank,
      classic = Math.sign(rankA.strength - rankB.strength);
    const kind =
      cohort.name === 'EARLY_EARNED'
        ? 'EARLY'
        : cohort.name === 'MIXED_EARNED'
          ? 'MIXED'
          : cohort.name === 'MAX_EARNED' || cohort.name === 'EARNED_PARITY'
            ? 'MAX'
            : 'BASE';
    const a: EvolvedContext = {
      playerId: 'a',
      hole: holeA,
      board,
      instances:
        cohort.name === 'NEUTRAL_CONTROL'
          ? []
          : metadata('a', holeA, kind, random),
    };
    const b: EvolvedContext = {
      playerId: 'b',
      hole: holeB,
      board,
      instances:
        cohort.name === 'NEUTRAL_CONTROL'
          ? []
          : metadata(
              'b',
              holeB,
              cohort.name === 'EARNED_PARITY' ? 'MAX' : 'BASE',
              random,
            ),
    };
    const evaluatedA = evaluateEvolvedSeven(a, policy),
      evaluatedB = evaluateEvolvedSeven(b, policy);
    const evolved = compareEvolvedCandidates(evaluatedA.best, evaluatedB.best);
    if (cohort.name === 'NEUTRAL_CONTROL' && evolved !== classic)
      technical.neutralMismatches++;
    if (cohort.name === 'COSMETIC_CONTROL') {
      const cosmetic = {
        ...a,
        instances: a.instances.map((instance) => ({
          ...instance,
          displaySkin: {
            purchased: true,
            rarity: 'LEGENDARY',
            level: 9999,
            playStyleFamily: 'paid-match',
            power: 999999,
          },
        })),
      };
      const changed = evaluateEvolvedSeven(cosmetic, policy);
      if (JSON.stringify(changed) !== JSON.stringify(evaluatedA))
        technical.cosmeticMismatches++;
    }
    if (
      !Number.isInteger(evaluatedA.best.score) ||
      !Number.isInteger(evaluatedB.best.score)
    )
      technical.nonIntegerScores++;
    cohort.samples++;
    if (evolved > 0) cohort.wins++;
    else if (evolved < 0) cohort.losses++;
    else cohort.ties++;
    if (classic > 0) cohort.classicWins++;
    else if (classic === 0) cohort.classicTies++;
    if (classic === 0 && evolved !== 0) cohort.classicTiesResolved++;
    if (classic !== 0 && evolved === 0) cohort.newTies++;
    if (classic * evolved < 0) {
      cohort.rankReversals++;
      const deficit =
        evolved > 0
          ? rankB.categoryIndex - rankA.categoryIndex
          : rankA.categoryIndex - rankB.categoryIndex;
      if (deficit >= 2) {
        technical.twoCategoryUpsets++;
        cohort.upsetsByClassicCategoryDeficit.twoOrMore++;
      } else if (deficit === 1)
        cohort.upsetsByClassicCategoryDeficit.oneCategory++;
      else cohort.upsetsByClassicCategoryDeficit.sameCategory++;
    }
    cohort.maximumObservedBonus = Math.max(
      cohort.maximumObservedBonus,
      ...evaluatedA.candidates.map((candidate) => candidate.bonus.total),
      ...evaluatedB.candidates.map((candidate) => candidate.bonus.total),
    );
    const category = evaluatedA.best.rank.categoryIndex;
    cohort.chosenCategories[category] = cohort.chosenCategories[category]! + 1;
    if ((sample + 1) % 10000 === 0) progress?.(sample + 1);
  }
  if (Object.values(technical).some((value) => value !== 0))
    throw new Error('EVOLVED_TECHNICAL_GATE_FAILED');
  return Object.freeze({
    fixtureVersion: 'EVOLVED_SIM_FIXTURES_V1',
    rulesetVersion: EVOLVED_A_EXPERIMENTAL_V1,
    effectsVersion: policy.effectsVersion,
    seed,
    hands,
    scenario: 'HEADS_UP_SHOWDOWN_NO_BETTING',
    launchApproved: false,
    technical,
    cohorts: cohorts.map((cohort) => {
      const equity = (cohort.wins + cohort.ties / 2) / cohort.samples,
        classicEquity =
          (cohort.classicWins + cohort.classicTies / 2) / cohort.samples;
      return {
        ...cohort,
        equity: round(equity),
        classicEquity: round(classicEquity),
        pairedEquityAdvantage: round(equity - classicEquity),
        outrightWinWilson95: wilson95(cohort.wins, cohort.samples),
        reversalRate: round(cohort.rankReversals / cohort.samples),
      };
    }),
  });
}
