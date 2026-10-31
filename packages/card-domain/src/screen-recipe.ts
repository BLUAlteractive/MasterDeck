/** Pure branch/tier rule. Economic amounts belong to an immutable reviewed recipe. */
export function validScreenTransition(
  branch: 'BLUE' | 'RED',
  source: number,
  target: number,
  tier: 'BASIC' | 'FINE' | 'MASTER',
) {
  if (
    !Number.isInteger(source) ||
    !Number.isInteger(target) ||
    target !== source + 2
  )
    return false;
  return (
    (branch === 'BLUE' &&
      ((source === 1 && tier === 'BASIC') ||
        (source === 3 && tier === 'MASTER'))) ||
    (branch === 'RED' &&
      ((source === 2 && tier === 'FINE') ||
        (source === 4 && tier === 'MASTER')))
  );
}
