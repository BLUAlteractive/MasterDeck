import { z } from 'zod';
export const cardStatusSchema = z.enum([
  'OWNED',
  'LOCKED',
  'CONSUMED',
  'REVOKED',
]);
export const cardStateSchema = z
  .object({
    status: cardStatusSchema,
    stateVersion: z.number().int().positive(),
    lockToken: z.uuid().nullable(),
    lockReason: z
      .string()
      .regex(/^[A-Z0-9_]{3,64}$/)
      .nullable(),
  })
  .strict()
  .superRefine((state, ctx) => {
    if (
      (state.status === 'LOCKED') !==
        (state.lockToken !== null && state.lockReason !== null) ||
      (state.status !== 'LOCKED' &&
        (state.lockToken !== null || state.lockReason !== null))
    )
      ctx.addIssue({ code: 'custom', message: 'Invalid lock state' });
  });
export const cardTransitionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('LOCK'),
      lockToken: z.uuid(),
      lockReason: z.string().regex(/^[A-Z0-9_]{3,64}$/),
    })
    .strict(),
  z.object({ action: z.literal('UNLOCK'), lockToken: z.uuid() }).strict(),
  z.object({ action: z.literal('FUSION_CONSUME') }).strict(),
  z.object({ action: z.literal('REVOKE') }).strict(),
]);
export type CardState = z.infer<typeof cardStateSchema>;
export type CardTransition = z.infer<typeof cardTransitionSchema>;
/** Internal lifecycle rules only; callers must prove feature eligibility and authorization. */
export function transitionCardState(
  state: CardState,
  command: CardTransition,
): CardState {
  const current = cardStateSchema.parse(state);
  const action = cardTransitionSchema.parse(command);
  let status: CardState['status'];
  let lockToken: string | null = null;
  let lockReason: string | null = null;
  switch (action.action) {
    case 'LOCK':
      if (current.status !== 'OWNED')
        throw new Error('INVALID_CARD_TRANSITION');
      status = 'LOCKED';
      lockToken = action.lockToken;
      lockReason = action.lockReason;
      break;
    case 'UNLOCK':
      if (current.status !== 'LOCKED' || current.lockToken !== action.lockToken)
        throw new Error('INVALID_CARD_TRANSITION');
      status = 'OWNED';
      break;
    case 'FUSION_CONSUME':
      if (current.status !== 'OWNED')
        throw new Error('INVALID_CARD_TRANSITION');
      status = 'CONSUMED';
      break;
    case 'REVOKE':
      if (current.status !== 'OWNED' && current.status !== 'LOCKED')
        throw new Error('INVALID_CARD_TRANSITION');
      status = 'REVOKED';
      break;
  }
  return cardStateSchema.parse({
    status,
    lockToken,
    lockReason,
    stateVersion: current.stateVersion + 1,
  });
}
