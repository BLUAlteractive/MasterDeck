import 'dotenv/config';
import { spawnSync } from 'node:child_process';

// Explicit local opt-in; CI reset is restricted to its newly created container.
const url = process.env.DATABASE_URL;
const confirmed = process.argv.includes('--confirm-local-data-loss');
let local = false;
try {
  const parsed = new URL(url);
  local =
    ['postgres:', 'postgresql:'].includes(parsed.protocol) &&
    ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) &&
    parsed.pathname === '/deckforge' &&
    (!parsed.search || parsed.search === '?schema=public');
} catch {
  /* Refuse missing/malformed connection configuration. */
}
if (!confirmed || !local) {
  console.error(
    'Reset refused. Use the local deckforge database URL and --confirm-local-data-loss only for disposable development data.',
  );
  process.exitCode = 1;
} else {
  const result = spawnSync(
    'pnpm',
    ['exec', 'prisma', 'migrate', 'reset', '--force'],
    { stdio: 'inherit' },
  );
  process.exitCode = result.status ?? 1;
}
