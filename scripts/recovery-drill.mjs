import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  lstatSync,
  readFileSync,
  rmSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
function assets(root, paths) {
  const result = [];
  function walk(path) {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error('Asset symlinks forbidden');
    if (stat.isDirectory()) {
      for (const child of readdirSync(path).sort()) walk(join(path, child));
    } else if (stat.isFile())
      result.push({
        path: relative(root, path),
        hash: digest(readFileSync(path)),
      });
    else throw new Error('Asset must be a regular file');
  }
  for (const path of paths) walk(join(root, path));
  return result;
}
/** Called only by the container-owning CI runner; never accepts caller DATABASE_URL. */
export function runOwnedRecovery({ container, databaseName, databaseUrl }) {
  if (
    !/^deckforge-test-[a-f0-9-]{36}$/.test(container) ||
    !/^deckforge_test_[a-f0-9]{16}$/.test(databaseName)
  )
    throw new Error('Owned recovery required');
  const started = Date.now(),
    restoredName = 'deckforge_restore_' + randomBytes(8).toString('hex');
  const workspace = mkdtempSync(join(tmpdir(), 'deckforge-recovery-'));
  chmodSync(workspace, 0o700);
  let created = false;
  let stage = 'dump';
  function docker(args, options = {}) {
    return execFileSync('docker', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000,
      maxBuffer: 128 * 1024 * 1024,
      ...options,
    });
  }
  try {
    const dump = docker([
      'exec',
      container,
      'pg_dump',
      '-U',
      'postgres',
      '-d',
      databaseName,
      '-Fc',
      '--no-owner',
      '--no-privileges',
    ]);
    stage = 'create-clean-database';
    docker(['exec', container, 'createdb', '-U', 'postgres', restoredName]);
    created = true;
    stage = 'restore-database';
    const restoreStarted = Date.now();
    docker(
      [
        'exec',
        '-i',
        container,
        'pg_restore',
        '-U',
        'postgres',
        '-d',
        restoredName,
        '--no-owner',
        '--no-privileges',
        '--exit-on-error',
        '--single-transaction',
      ],
      { input: dump },
    );
    const databaseRestoreMs = Date.now() - restoreStarted;
    const restoredUrl = new URL(databaseUrl);
    restoredUrl.pathname = '/' + restoredName;
    stage = 'verify-replay';
    const result = spawnSync(
      'pnpm',
      ['exec', 'tsx', 'scripts/restore-verify.mts'],
      {
        encoding: 'utf8',
        timeout: 180000,
        maxBuffer: 1024 * 1024,
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          DECKFORGE_DISPOSABLE_DB: databaseName,
          DECKFORGE_RESTORED_URL: restoredUrl.href,
        },
      },
    );
    if (result.status !== 0) {
      const line = result.stderr
        .trim()
        .split('\n')
        .find((line) => line.startsWith('{"event":"recovery.verify"'));
      if (line) {
        const detail = JSON.parse(line);
        process.stdout.write(
          JSON.stringify({
            event: 'recovery.verify',
            status: 'failed',
            stage: detail.stage,
            code: detail.code,
          }) + '\n',
        );
      }
      throw new Error('Restore replay or integrity failed');
    }
    const verification = JSON.parse(result.stdout.trim());
    if (verification.status !== 'ok') throw new Error('Verification missing');
    stage = 'restore-assets';
    const root = resolve('.'),
      paths = ['assets/foundation', 'apps/mobile/assets'],
      before = assets(root, paths),
      archive = join(workspace, 'assets.tar'),
      restoredRoot = join(workspace, 'assets');
    // Only our prevalidated regular-file tree is archived; never extract a caller-supplied tar.
    execFileSync('tar', ['-cf', archive, '-C', root, ...paths], {
      stdio: 'pipe',
      timeout: 30000,
    });
    mkdirSync(restoredRoot, { recursive: true });
    execFileSync('tar', ['-xf', archive, '-C', restoredRoot], {
      stdio: 'pipe',
      timeout: 30000,
    });
    const after = assets(restoredRoot, paths);
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw new Error('Restored assets differ');
    process.stdout.write(
      JSON.stringify({
        event: 'recovery.drill',
        status: 'ok',
        scope: 'OWNED_FROZEN_FIXTURE_SNAPSHOT',
        dumpBytes: dump.length,
        dumpSha256: digest(dump),
        databaseRestoreMs,
        verifiedRecoveryMs: Date.now() - started,
        assets: { files: after.length, digest: digest(JSON.stringify(after)) },
        verification,
      }) + '\n',
    );
  } catch {
    process.stdout.write(
      JSON.stringify({ event: 'recovery.drill', status: 'failed', stage }) +
        '\n',
    );
    throw new Error('Owned recovery failed');
  } finally {
    try {
      if (created)
        docker(['exec', container, 'dropdb', '-U', 'postgres', restoredName]);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }
}
