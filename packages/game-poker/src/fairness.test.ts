import { expect, it } from 'vitest';
import { runEvolvedSimulation, wilson95, cohortNames } from '../test/fairness';
it('reproduces all staged cohorts, technical controls and complete counts from seed', () => {
  const report = runEvolvedSimulation(600, 230026);
  expect(report).toEqual(runEvolvedSimulation(600, 230026));
  expect(report.cohorts.map((cohort) => cohort.name)).toEqual(cohortNames);
  for (const cohort of report.cohorts) {
    expect(cohort.samples).toBe(100);
    expect(cohort.wins + cohort.losses + cohort.ties).toBe(100);
    expect(cohort.chosenCategories.reduce((a, b) => a + b, 0)).toBe(100);
    expect(cohort.maximumObservedBonus).toBeLessThanOrEqual(1200);
    expect(cohort.upsetsByClassicCategoryDeficit.twoOrMore).toBe(0);
  }
  expect(Object.values(report.technical).every((value) => value === 0)).toBe(
    true,
  );
  expect(report.cohorts[0]!.pairedEquityAdvantage).toBe(0);
  expect(report.launchApproved).toBe(false);
  expect(report).not.toEqual(runEvolvedSimulation(600, 230027));
});
it('validates fixture controls and binomial Wilson limits, including zero and all wins', () => {
  expect(() => runEvolvedSimulation(0, 1)).toThrow('INVALID_SIMULATION_CONFIG');
  expect(() => runEvolvedSimulation(6, 0)).toThrow('INVALID_SIMULATION_CONFIG');
  expect(() => runEvolvedSimulation(6, 1.1)).toThrow(
    'INVALID_SIMULATION_CONFIG',
  );
  expect(wilson95(0, 100)[0]).toBe(0);
  expect(wilson95(100, 100)[1]).toBe(1);
  expect(wilson95(50, 100)[0]).toBeCloseTo(0.40383153, 7);
  expect(wilson95(50, 100)[1]).toBeCloseTo(0.59616847, 7);
  expect(() => wilson95(101, 100)).toThrow('INVALID_STATISTICS');
});
