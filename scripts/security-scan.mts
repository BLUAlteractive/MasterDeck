import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export function secretPath(path: string) {
  return (
    !/\.(example|sample)$/.test(path) &&
    (/(^|\/)\.env($|\.)/.test(path) ||
      /\.(p8|jks|keystore|p12|pfx|dump|backup)$/i.test(path) ||
      /credentials\.json$/i.test(path))
  );
}
export function secretText(text: string) {
  return (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text) ||
    /\bAKIA[A-Z0-9]{16}\b/.test(text) ||
    /\bgh[pousr]_[A-Za-z0-9]{36,}\b/.test(text)
  );
}
export function scanTracked() {
  const paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
      .split('\0')
      .filter(Boolean),
    findings: string[] = [];
  for (const path of paths) {
    if (secretPath(path)) {
      findings.push(path);
      continue;
    }
    const bytes = readFileSync(path);
    if (!bytes.includes(0) && secretText(bytes.toString('utf8')))
      findings.push(path);
  }
  return findings;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const findings = scanTracked();
  if (findings.length) {
    console.error(
      JSON.stringify({
        event: 'security.tracked_secrets',
        status: 'failed',
        paths: findings,
      }),
    );
    process.exitCode = 1;
  } else
    console.info(
      JSON.stringify({ event: 'security.tracked_secrets', status: 'ok' }),
    );
}
