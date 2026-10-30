import {
  runPokerHarness,
  simulatePokerHand,
} from '../packages/game-poker/test/simulation.js';
const args = process.argv.slice(2);
if (args.length === 2 && args[0] === '--seed') {
  const run = simulatePokerHand(Number(args[1]));
  console.info(
    JSON.stringify({
      seed: run.seed,
      commands: run.commands.length,
      reason: run.state.completionReason,
      allocation: run.allocation,
    }),
  );
} else if (args.length === 0) console.info(JSON.stringify(runPokerHarness()));
else throw new Error('Usage: pnpm test:poker:harness [--seed integer]');
