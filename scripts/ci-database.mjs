import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

// Never read a caller's DATABASE_URL. Own a fresh container, random DB/password and no volume.
const name = `deckforge-test-${randomUUID()}`;
const databaseName = `deckforge_test_${randomBytes(8).toString('hex')}`;
const password = randomBytes(24).toString('hex');
const started = Date.now();
let created = false;
let stage = 'container-start';
function docker(args, options = {}) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    timeout: 120000,
    stdio: ['pipe', 'pipe', 'pipe'],
    ...options,
  }).trim();
}
function run(args, env) {
  stage = args.join(' ');
  const result = spawnSync('pnpm', args, { stdio: 'inherit', env });
  if (result.status !== 0) throw new Error('Database check command failed.');
}
try {
  docker([
    'run',
    '--detach',
    '--rm',
    '--name',
    name,
    '--tmpfs',
    '/var/lib/postgresql/data',
    '-e',
    `POSTGRES_PASSWORD=${password}`,
    '-e',
    `POSTGRES_DB=${databaseName}`,
    '-p',
    '127.0.0.1::5432',
    'postgres:17.6-alpine',
  ]);
  created = true;
  stage = 'container-readiness';
  const readyDeadline = Date.now() + 60000;
  while (true) {
    try {
      docker([
        'exec',
        name,
        'pg_isready',
        '-h',
        '127.0.0.1',
        '-U',
        'postgres',
        '-d',
        databaseName,
      ]);
      break;
    } catch {
      if (Date.now() > readyDeadline)
        throw new Error('Temporary database did not become ready.');
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  stage = 'loopback-port-check';
  const mapping = docker(['port', name, '5432/tcp']);
  const port = /^127\.0\.0\.1:(\d+)$/.exec(mapping)?.[1];
  if (!port) throw new Error('Expected a loopback-only test database port.');
  const env = {
    ...process.env,
    DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/${databaseName}`,
    DECKFORGE_DISPOSABLE_DB: databaseName,
  };
  console.info(
    'Database checks: isolated PostgreSQL 17 container ready; caller database ignored.',
  );
  run(['db:validate'], env);
  run(['db:generate'], env);
  run(['build:packages'], env); // Standalone DB checks must never use stale package/client outputs.
  run(['db:deploy'], env);
  run(['db:deploy'], env); // A second deploy must be a no-op.
  run(['exec', 'prisma', 'migrate', 'status'], env);
  run(['db:seed'], env);
  run(['db:seed'], env);
  run(['exec', 'vitest', 'run', '--config', 'vitest.database.config.mts'], env);
  stage = 'rollback';
  const rollbackDirectory = new URL('../prisma/rollback/', import.meta.url);
  for (const filename of readdirSync(rollbackDirectory)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .reverse()) {
    docker(
      [
        'exec',
        '-i',
        name,
        'psql',
        '-U',
        'postgres',
        '-d',
        databaseName,
        '-v',
        'ON_ERROR_STOP=1',
      ],
      {
        input: readFileSync(new URL(filename, rollbackDirectory), 'utf8'),
      },
    );
  }
  const remaining = docker([
    'exec',
    name,
    'psql',
    '-U',
    'postgres',
    '-d',
    databaseName,
    '-tAc',
    `SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name <> '_prisma_migrations'`,
  ]);
  if (remaining !== '0')
    throw new Error('Rollback left foundation tables behind.');
  console.info(
    'Database rollback: all foundation tables removed in disposable database.',
  );
  // Explicitly exercise Prisma reset on this runner-owned temporary database only.
  run(['exec', 'prisma', 'migrate', 'reset', '--force'], env);
  run(['db:seed'], env);
  run(['exec', 'vitest', 'run', '--config', 'vitest.database.config.mts'], env);
  console.info(
    JSON.stringify({
      event: 'database.check',
      status: 'ok',
      durationMs: Date.now() - started,
    }),
  );
} catch {
  // Avoid echoing the generated password, caller env, SQL rows or subprocess arguments.
  console.error(
    JSON.stringify({
      event: 'database.check',
      status: 'failed',
      stage,
      durationMs: Date.now() - started,
    }),
  );
  process.exitCode = 1;
} finally {
  if (created) {
    try {
      docker(['rm', '--force', name]);
    } catch {
      console.error(
        'Temporary database cleanup failed; remove the deckforge-test container created by this run.',
      );
      process.exitCode = 1;
    }
  }
}
