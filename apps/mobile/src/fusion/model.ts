import {
  fusionConfirmSchema,
  fusionReceiptSchema,
  type FusionPreview,
} from '@deckforge/contracts';
/** Retain this exact envelope until a verified receipt or a definitive rejection. */
export function stageFusion(preview: FusionPreview, commandId: string) {
  return {
    preview,
    command: fusionConfirmSchema.parse({
      previewId: preview.previewId,
      previewHash: preview.previewHash,
      commandId,
      confirm: true,
    }),
  };
}
export type PendingFusion = ReturnType<typeof stageFusion>;
export function acceptFusion(pending: PendingFusion, value: unknown) {
  const receipt = fusionReceiptSchema.parse(value),
    p = pending.preview;
  if (
    receipt.previewId !== p.previewId ||
    receipt.previewHash !== p.previewHash ||
    JSON.stringify(receipt.child) !== JSON.stringify(p.child) ||
    JSON.stringify(receipt.effects) !== JSON.stringify(p.effects) ||
    JSON.stringify([...receipt.consumed].sort()) !==
      JSON.stringify(p.sources.map((s) => s.id).sort())
  )
    throw new Error('Fusion result does not match confirmed preview');
  return receipt;
}
