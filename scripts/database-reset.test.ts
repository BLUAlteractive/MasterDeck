import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('./database-reset.mjs', import.meta.url));
describe('local reset safety guard', () => {
  it.each([
    ['postgresql://fixture:fixture@localhost:5432/deckforge', []],
    [
      'postgresql://fixture:fixture@remote.example.invalid/deckforge',
      ['--confirm-local-data-loss'],
    ],
    [
      'postgresql://fixture:fixture@localhost:5432/another_database',
      ['--confirm-local-data-loss'],
    ],
    [
      'postgresql://fixture:fixture@localhost:5432/deckforge?host=remote.example.invalid',
      ['--confirm-local-data-loss'],
    ],
    ['invalid', ['--confirm-local-data-loss']],
  ])('refuses a reset without explicit local scope (%s)', (url, args) => {
    const result = spawnSync(process.execPath, [script, ...args], {
      env: { ...process.env, DATABASE_URL: url },
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Reset refused');
    expect(result.stderr).not.toContain(url);
  });
});
