import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { runEvolvedSimulation } from '../packages/game-poker/test/fairness.js';
const args = process.argv.slice(2);
let hands = 100000,
  seed = 230026,
  output: string | undefined,
  verify: string | undefined;
for (let index = 0; index < args.length; index += 2) {
  const flag = args[index],
    value = args[index + 1];
  if (!value) throw new Error('Expected flag/value pairs');
  if (flag === '--hands') hands = Number(value);
  else if (flag === '--seed') seed = Number(value);
  else if (flag === '--output') output = value;
  else if (flag === '--verify') verify = value;
  else throw new Error('Unknown simulation option');
}
const report = runEvolvedSimulation(hands, seed, (done) =>
  console.info(
    JSON.stringify({ event: 'evolved.simulation.progress', done, hands }),
  ),
);
if (output) {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
}
if (
  verify &&
  JSON.stringify(JSON.parse(readFileSync(verify, 'utf8'))) !==
    JSON.stringify(report)
)
  throw new Error('Simulation evidence differs from the committed fixture');
console.info(
  JSON.stringify({
    event: 'evolved.simulation.complete',
    seed,
    hands,
    technical: report.technical,
    cohorts: report.cohorts.map((cohort) => ({
      name: cohort.name,
      equity: cohort.equity,
      pairedAdvantage: cohort.pairedEquityAdvantage,
      rankReversals: cohort.rankReversals,
    })),
    verified: !!verify,
  }),
);
