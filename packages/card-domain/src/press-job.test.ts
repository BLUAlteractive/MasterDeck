import { it, expect } from 'vitest';
import { pressCommand } from './press-job';
it('preserves progress on pause/resume, returns untouched screens, and requires an explicit policy after progress', () => {
  expect(pressCommand('ACTIVE', 100, 'PAUSE', 'DISABLED')).toEqual({
    status: 'PAUSED',
    screen: 'ASSIGNED',
  });
  expect(pressCommand('PAUSED', 100, 'RESUME', 'DISABLED')).toEqual({
    status: 'ACTIVE',
    screen: 'ASSIGNED',
  });
  expect(pressCommand('PAUSED', 0, 'CANCEL', 'DISABLED')).toEqual({
    status: 'CANCELLED',
    screen: 'AVAILABLE',
  });
  expect(() => pressCommand('ACTIVE', 1, 'CANCEL', 'DISABLED')).toThrow();
  expect(pressCommand('ACTIVE', 1, 'CANCEL', 'FORFEIT_SCREEN')).toEqual({
    status: 'CANCELLED',
    screen: 'REVOKED',
  });
  for (const status of ['COMPLETED', 'CANCELLED', 'REVOKED'] as const)
    for (const action of ['PAUSE', 'RESUME', 'CANCEL', 'REVOKE'] as const)
      expect(() => pressCommand(status, 0, action, 'FORFEIT_SCREEN')).toThrow();
});
