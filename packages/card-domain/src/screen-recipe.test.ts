import { it, expect } from 'vitest';
import { validScreenTransition } from './screen-recipe';
it('permits only the four published branch/tier transitions and never terminal or cross-branch progression', () => {
  const accepted: string[] = [];
  for (const branch of ['BLUE', 'RED'] as const)
    for (let source = 0; source <= 7; source++)
      for (let target = 0; target <= 8; target++)
        for (const tier of ['BASIC', 'FINE', 'MASTER'] as const)
          if (validScreenTransition(branch, source, target, tier))
            accepted.push(`${branch}:${source}:${target}:${tier}`);
  expect(accepted).toEqual([
    'BLUE:1:3:BASIC',
    'BLUE:3:5:MASTER',
    'RED:2:4:FINE',
    'RED:4:6:MASTER',
  ]);
  expect(validScreenTransition('BLUE', 1.5, 3.5, 'BASIC')).toBe(false);
});
