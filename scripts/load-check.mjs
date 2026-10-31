import { spawnSync } from 'node:child_process';
// The existing runner ignores caller DATABASE_URL and owns/cleans its PostgreSQL container.
const result = spawnSync(process.execPath, ['scripts/ci-database.mjs'], {
  stdio: 'inherit',
  env: { ...process.env, DECKFORGE_LOAD_GAMES: '500' },
});
process.exitCode = result.status ?? 1;
