import { Prisma } from '@deckforge/database';
/** Retry only known transaction conflicts, never auth/provider errors or arbitrary messages. */
export function retryableTransaction(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError)
    return ['P2002', 'P2034'].includes(error.code);
  if (
    !(error instanceof Error) ||
    !error.cause ||
    typeof error.cause !== 'object'
  )
    return false;
  const cause = error.cause as Record<string, unknown>;
  return (
    cause.kind === 'TransactionWriteConflict' &&
    ['40001', '40P01'].includes(String(cause.originalCode))
  );
}
