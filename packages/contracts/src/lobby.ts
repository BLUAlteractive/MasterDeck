import { z } from 'zod';
export const pokerModeSchema = z.enum(['CLASSIC', 'EVOLVED']);
export type PokerMode = z.infer<typeof pokerModeSchema>;
export const pokerRulesVersions = Object.freeze({
  CLASSIC: 'CLASSIC_NLHE_V1',
  EVOLVED: 'EVOLVED_A_EXPERIMENTAL_V1',
} as const);
const key = z.string().regex(/^[A-Za-z0-9_-]{10,128}$/);
export const lobbyCommandSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('CREATE_PRIVATE'),
      commandId: key,
      capacity: z.number().int().min(2).max(6),
      mode: pokerModeSchema.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('JOIN_PRIVATE'),
      commandId: key,
      invite: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal('QUEUE'),
      commandId: key,
      mode: pokerModeSchema.optional(),
    })
    .strict(),
  z.object({ action: z.literal('LEAVE'), commandId: key }).strict(),
  z
    .object({ action: z.literal('READY'), commandId: key, ready: z.boolean() })
    .strict(),
]);
export const lobbyViewSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(['PUBLIC', 'PRIVATE']),
    mode: pokerModeSchema,
    rulesetVersion: z
      .enum(['CLASSIC_NLHE_V1', 'EVOLVED_A_EXPERIMENTAL_V1'])
      .default('CLASSIC_NLHE_V1'),
    admission: z
      .enum(['AVAILABLE', 'POLICY_NOT_CONFIGURED', 'BALANCE_REVIEW_REQUIRED'])
      .default('POLICY_NOT_CONFIGURED'),
    status: z.enum(['OPEN', 'STARTED', 'CLOSED']).default('OPEN'),
    capacity: z.number().int().min(2).max(6),
    hostId: z.uuid(),
    version: z.number().int().positive(),
    members: z
      .array(
        z
          .object({
            userId: z.uuid(),
            seat: z.number().int().min(0).max(5),
            ready: z.boolean(),
          })
          .strict(),
      )
      .max(6),
    canStart: z.boolean(),
    gameId: z.uuid().nullable().default(null),
  })
  .strict();
export type LobbyCommand = z.infer<typeof lobbyCommandSchema>;
export const lobbyResultSchema = z
  .object({
    lobby: lobbyViewSchema
      .refine(
        (lobby) =>
          lobby.rulesetVersion === pokerRulesVersions[lobby.mode] &&
          (lobby.mode !== 'EVOLVED' ||
            (!lobby.canStart && lobby.admission === 'BALANCE_REVIEW_REQUIRED')),
        'Mismatched mode/rules or unreviewed admission.',
      )
      .nullable(),
    invite: z.string().nullable(),
  })
  .strict();
export type LobbyResult = z.infer<typeof lobbyResultSchema>;
