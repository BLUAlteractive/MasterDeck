import { z } from 'zod';
const id = z.uuid();
export const fusionPolicySchema = z
  .object({
    version: z.string().min(1).max(100),
    approvalReference: z.string().min(1).max(200),
    eligibleSeries: z.array(id).min(1).max(100),
    recipe: z.literal('MATCHED_TEMPLATE_RARITY_PRESERVE_V1'),
  })
  .strict();
export type FusionPolicy = z.infer<typeof fusionPolicySchema>;
export const fusionPolicyResponseSchema = z
  .object({ policy: fusionPolicySchema.nullable() })
  .strict();
export const fusionSelectionSchema = z
  .object({
    sourceIds: z
      .array(id)
      .length(5)
      .refine((ids) => new Set(ids.map((x) => x.toLowerCase())).size === 5),
  })
  .strict();
export const fusionConfirmSchema = z
  .object({
    previewId: id,
    previewHash: z.string().regex(/^[a-f0-9]{64}$/),
    commandId: id,
    confirm: z.literal(true),
  })
  .strict();
export const fusionOutputSchema = z
  .object({
    id,
    templateId: id,
    seriesId: id,
    faceId: z.string().min(1),
    branch: z.enum(['BLUE', 'RED']),
    level: z.number().int().min(3).max(6),
    rarity: z.enum(['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY']),
  })
  .strict();
const effectsSchema = z
  .object({
    loadout: z
      .object({ id, version: z.number().int().positive(), sourceId: id })
      .strict()
      .nullable(),
    manager: z
      .object({
        version: z.number().int().positive(),
        slots: z.array(z.number().int().min(1).max(100)).max(5),
      })
      .strict()
      .nullable(),
    favoriteSources: z.array(id).max(5),
  })
  .strict();
export const fusionPreviewSchema = z
  .object({
    previewId: id,
    previewHash: z.string().regex(/^[a-f0-9]{64}$/),
    expiresAt: z.iso.datetime(),
    policy: fusionPolicySchema,
    sources: z
      .array(
        z
          .object({
            id,
            stateVersion: z.number().int().positive(),
            level: z.number().int().min(1).max(4),
            faceId: z.string(),
          })
          .strict(),
      )
      .length(5),
    child: fusionOutputSchema,
    effects: effectsSchema,
  })
  .strict();
export type FusionPreview = z.infer<typeof fusionPreviewSchema>;
export const fusionReceiptSchema = z
  .object({
    jobId: id,
    previewId: id,
    previewHash: z.string(),
    child: fusionOutputSchema,
    consumed: z.array(id).length(5),
    effects: effectsSchema,
  })
  .strict();
export type FusionReceipt = z.infer<typeof fusionReceiptSchema>;
export const fusionLineageSchema = z
  .object({
    instanceId: id,
    parents: z.array(id).max(5),
    children: z.array(id).max(1),
  })
  .strict();
