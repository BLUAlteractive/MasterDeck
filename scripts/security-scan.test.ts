import { it, expect } from 'vitest';
import { secretPath, secretText } from './security-scan.mjs';
it('rejects tracked runtime credentials/backups while allowing public templates and CA certificates', () => {
  for (const path of [
    '.env',
    'apps/mobile/.env.local',
    'private.p8',
    'credentials.json',
    'db.dump',
    'db.sql.gz',
    'local.pgdata',
    'ops/private-backups/snapshot.bin',
  ])
    expect(secretPath(path)).toBe(true);
  for (const path of [
    '.env.example',
    'services/api/.env.sample',
    'apple-root-g3.cer',
    'prisma/rollback/test.sql',
  ])
    expect(secretPath(path)).toBe(false);
});
it('recognizes actual private key/provider tokens without flagging public trust material', () => {
  expect(secretText(['-----BEGIN', 'PRIVATE KEY-----'].join(' '))).toBe(true);
  expect(secretText('AKIA' + 'A'.repeat(16))).toBe(true);
  expect(secretText('ghp_' + 'a'.repeat(36))).toBe(true);
  expect(secretText('-----BEGIN CERTIFICATE-----')).toBe(false);
});
