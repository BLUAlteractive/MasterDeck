import { z } from 'zod';
const key = z.string().regex(/^[A-Za-z0-9_-]{10,128}$/);
export const lobbyCommandSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('CREATE_PRIVATE'),
      commandId: key,
      capacity: z.number().int().min(2).max(6),
    })
    .strict(),
  z
    .object({
      action: z.literal('JOIN_PRIVATE'),
      commandId: key,
      invite: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z.object({ action: z.literal('QUEUE'), commandId: key }).strict(),
  z.object({ action: z.literal('LEAVE'), commandId: key }).strict(),
  z
    .object({ action: z.literal('READY'), commandId: key, ready: z.boolean() })
    .strict(),
]);
export const lobbyViewSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(['PUBLIC', 'PRIVATE']),
    mode: z.literal('CLASSIC'),
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
  })
  .strict();
export const lobbyResultSchema = z
  .object({ lobby: lobbyViewSchema.nullable(), invite: z.string().nullable() })
  .strict();
export type LobbyResult = z.infer<typeof lobbyResultSchema>;
