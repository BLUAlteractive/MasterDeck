/** Exact integer weights; the IO caller supplies a uniform integer in [0,total). */
export function rewardPoolTotal(pool: readonly { weight: number }[]) {
  if (
    !pool.length ||
    pool.length > 100 ||
    pool.some((r) => !Number.isSafeInteger(r.weight) || r.weight < 1)
  )
    throw new Error('INVALID_REWARD_POOL');
  const total = pool.reduce((n, r) => n + r.weight, 0);
  if (!Number.isSafeInteger(total) || total > 100000000)
    throw new Error('INVALID_REWARD_POOL');
  return total;
}
export function rewardPoolIndex(
  pool: readonly { weight: number }[],
  draw: number,
) {
  const total = rewardPoolTotal(pool);
  if (!Number.isSafeInteger(draw) || draw < 0 || draw >= total)
    throw new Error('INVALID_REWARD_DRAW');
  let cursor = draw;
  for (let i = 0; i < pool.length; i++) {
    cursor -= pool[i]!.weight;
    if (cursor < 0) return i;
  }
  throw new Error('INVALID_REWARD_DRAW');
}
