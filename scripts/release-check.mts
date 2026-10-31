import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { assessRelease } from './release-policy.mjs';
const mode = process.argv[2];
if (!['--validate', '--require-go'].includes(mode ?? ''))
  throw new Error('Use --validate or --require-go');
try {
  const manifest = JSON.parse(
    readFileSync('ops/release-manifest.json', 'utf8'),
  ) as unknown;
  const reviewers = JSON.parse(
    readFileSync('ops/trusted-reviewers.json', 'utf8'),
  ) as unknown;
  const expectedCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const assessment = assessRelease(manifest, reviewers, { expectedCommit });
  const tracked = execFileSync('git', ['diff', 'HEAD', '--name-only', '-z'], {
    encoding: 'utf8',
  });
  const untracked = execFileSync(
    'git',
    ['ls-files', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8' },
  );
  if (
    (tracked + untracked)
      .split('\0')
      .filter(Boolean)
      .some(
        (path) =>
          !['ops/release-manifest.json', 'ops/trusted-reviewers.json'].includes(
            path,
          ),
      )
  ) {
    assessment.blockers.push('ARTIFACT_WORKTREE_NOT_CLEAN');
    assessment.decision = 'NO_GO';
  }
  process.stdout.write(
    JSON.stringify({ event: 'release.readiness', ...assessment }) + '\n',
  );
  if (mode === '--require-go' && assessment.decision !== 'GO')
    process.exitCode = 1;
} catch {
  console.error(
    JSON.stringify({
      event: 'release.readiness',
      validation: 'INVALID',
      decision: 'NO_GO',
      code: 'MANIFEST_OR_REVIEWER_CONFIGURATION_INVALID',
    }),
  );
  process.exitCode = 1;
}
