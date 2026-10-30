export type Restoration<T> =
  { status: 'ready'; session: T | null } | { status: 'failed' };

/** A failed read must never be interpreted as an empty account store. */
export async function restoreAccount<T>(
  read: () => Promise<{ data: { session: T | null }; error: unknown }>,
): Promise<Restoration<T>> {
  try {
    const { data, error } = await read();
    if (error) return { status: 'failed' };
    return { status: 'ready', session: data.session };
  } catch {
    return { status: 'failed' };
  }
}
