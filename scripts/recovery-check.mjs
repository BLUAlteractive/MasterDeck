import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, ['scripts/ci-database.mjs'], {
  stdio: 'inherit',
  env: { ...process.env, DECKFORGE_BACKUP_DRILL: '1' },
});
process.exitCode = result.status ?? 1;
