import { createHmac } from 'node:crypto';
/** Domain-separated seeded uniform draws using 32-bit rejection sampling, never modulo bias. */
export function packDraws(seed: Buffer, total: number, count: number) {
  if (
    seed.length !== 32 ||
    !Number.isSafeInteger(total) ||
    total < 1 ||
    total > 100000000 ||
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count > 10
  )
    throw new Error('INVALID_PACK_RNG');
  const limit = Math.floor(0x100000000 / total) * total,
    result: number[] = [];
  for (let index = 0; index < count; index++) {
    let accepted = false;
    for (let attempt = 0; attempt < 128; attempt++) {
      const value = createHmac('sha256', seed)
        .update('deckforge.pack.v1:' + index + ':' + attempt)
        .digest()
        .readUInt32BE(0);
      if (value < limit) {
        result.push(value % total);
        accepted = true;
        break;
      }
    }
    if (!accepted) throw new Error('PACK_RNG_REJECTION_LIMIT');
  }
  return result;
}
