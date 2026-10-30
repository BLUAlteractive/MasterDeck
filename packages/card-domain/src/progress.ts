/** Counts only a new eligible server event; monetary grants are a separate reviewed boundary. */
export function advanceProgress(
  count: number,
  target: number,
  consumed: boolean,
) {
  if (
    !Number.isSafeInteger(count) ||
    count < 0 ||
    !Number.isSafeInteger(target) ||
    target < 1 ||
    target > 1000000 ||
    count > target
  )
    throw new Error('INVALID_PROGRESS');
  const next = consumed ? count : Math.min(count + 1, target);
  return { count: next, award: !consumed && count < target && next === target };
}
