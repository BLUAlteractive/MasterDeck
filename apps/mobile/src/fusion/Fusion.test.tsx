import { renderToStaticMarkup } from 'react-dom/server';
import { it, expect, vi } from 'vitest';
import { fusionPreviewSchema, type FusionReceipt } from '@deckforge/contracts';
import { createCollectionClient } from '../collection/client';
import { Fusion, FusionReview } from './Fusion';
import { acceptFusion, stageFusion } from './model';
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const preview = fusionPreviewSchema.parse({
  previewId: id(1),
  previewHash: 'a'.repeat(64),
  expiresAt: '2030-01-01T00:00:00.000Z',
  policy: {
    version: 'FIXTURE_ONLY',
    approvalReference: 'NOT APPROVAL',
    eligibleSeries: [id(2)],
    recipe: 'MATCHED_TEMPLATE_RARITY_PRESERVE_V1',
  },
  sources: [10, 11, 12, 13, 14].map((n) => ({
    id: id(n),
    stateVersion: 1,
    level: 1,
    faceId: 'Q-H',
  })),
  child: {
    id: id(3),
    templateId: id(4),
    seriesId: id(2),
    faceId: 'Q-H',
    branch: 'BLUE',
    level: 3,
    rarity: 'COMMON',
  },
  effects: {
    loadout: { id: id(5), version: 1, sourceId: id(10) },
    manager: { version: 1, slots: [1, 7, 99] },
    favoriteSources: [id(10)],
  },
});
const receipt: FusionReceipt = {
  jobId: id(6),
  previewId: preview.previewId,
  previewHash: preview.previewHash,
  child: preview.child,
  consumed: preview.sources.map((s) => s.id),
  effects: preview.effects,
};
function review(options: Partial<Parameters<typeof FusionReview>[0]> = {}) {
  return renderToStaticMarkup(
    <FusionReview
      preview={preview}
      receipt={null}
      acknowledged={false}
      busy={false}
      uncertain={false}
      onAcknowledge={() => {}}
      onConfirm={() => {}}
      onCancel={() => {}}
      {...options}
    />,
  );
}
it('requires an account; rendering never grants or consumes inventory', () => {
  const transport = vi.fn<typeof fetch>();
  const html = renderToStaticMarkup(
    <Fusion client={null} makeId={() => id(8)} />,
  );
  expect(html).toContain('Connect your account');
  expect(html).toContain('Artwork preview');
  expect(html).not.toContain('Consume these 5');
  expect(transport).not.toHaveBeenCalled();
});
it('discloses every lost source, exact child, expiry and selection effects before confirmation', () => {
  const html = review();
  for (const s of preview.sources) expect(html).toContain(s.id);
  expect(html).toContain(preview.child.id);
  expect(html).toContain('permanently consumed');
  expect(html).toContain('Previewing does not consume');
  expect(html).toContain('replace slots 1, 7, 99');
  expect(html).toContain('child in slot 1');
  expect(html).toContain('inherits a favorite');
  expect(html).toContain('Loadout version 1');
  expect(html).toContain('2030-01-01');
  expect(html).toContain('I understand these five cards will be consumed');
  const label = html.indexOf('aria-label="Consume these 5');
  expect(
    html.slice(html.lastIndexOf('<', label), html.indexOf('>', label)),
  ).toContain('aria-disabled="true"');
});
it('enables confirmation only after acknowledgement and prevents cancel while outcome is unknown', () => {
  expect(review({ acknowledged: true })).toContain('Confirmed: I understand');
  const html = review({ uncertain: true });
  expect(html).toContain('Confirmation outcome is unknown');
  expect(html).toContain('Retry same fusion confirmation');
  const label = html.indexOf('aria-label="Cancel preview');
  expect(
    html.slice(html.lastIndexOf('<', label), html.indexOf('>', label)),
  ).toContain('aria-disabled="true"');
});
it('reveals the confirmed child and all lineage without leaving a second consume action', () => {
  const html = review({ receipt });
  expect(html).toContain('Fusion confirmed');
  expect(html).toContain('New card: Q-H, Level 3 BLUE');
  for (const source of receipt.consumed) expect(html).toContain(source);
  expect(html).toContain('Lineage parents:');
  expect(html).toContain(receipt.jobId);
  expect(html).not.toContain('aria-label="Consume these 5');
  expect(html).not.toContain('Retry same fusion');
});
it.each(['child', 'parents', 'effects', 'preview'] as const)(
  'rejects a response with different %s and retains the exact pending envelope',
  (field) => {
    const pending = stageFusion(preview, id(9)),
      before = JSON.stringify(pending);
    const wrong =
      field === 'child'
        ? { ...receipt, child: { ...receipt.child, id: id(100) } }
        : field === 'parents'
          ? {
              ...receipt,
              consumed: [...receipt.consumed.slice(1), receipt.consumed[1]],
            }
          : field === 'effects'
            ? { ...receipt, effects: { ...receipt.effects, loadout: null } }
            : { ...receipt, previewId: id(100) };
    expect(() => acceptFusion(pending, wrong)).toThrow();
    expect(JSON.stringify(pending)).toBe(before);
    expect(acceptFusion(pending, receipt)).toEqual(receipt);
  },
);
it('recovers a lost confirmation response using the same request and a fresh bearer, without repeating preview', async () => {
  const pending = stageFusion(preview, id(9));
  let attempts = 0;
  const transport = vi.fn<typeof fetch>().mockImplementation(async () => {
    if (attempts++ === 0)
      throw new TypeError('Simulated lost response after commit');
    return new Response(JSON.stringify(receipt), { status: 200 });
  });
  const tokens = vi
    .fn()
    .mockResolvedValueOnce('first')
    .mockResolvedValueOnce('refreshed');
  const client = createCollectionClient(
    'https://api.example.invalid',
    tokens,
    transport,
  );
  await expect(client.confirmFusion(pending.command)).rejects.toThrow(
    'Simulated',
  );
  const result = acceptFusion(
    pending,
    await client.confirmFusion(pending.command),
  );
  expect(result.child).toEqual(preview.child);
  expect(transport.mock.calls).toHaveLength(2);
  const [first, second] = transport.mock.calls;
  expect(first?.[0]).toBe('https://api.example.invalid/v1/fusion/confirm');
  expect(second?.[1]?.body).toBe(first?.[1]?.body);
  expect(second?.[1]?.headers).toEqual({
    Authorization: 'Bearer refreshed',
    'Content-Type': 'application/json',
  });
});
it('validates preview inputs locally and requires strict server response shapes', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify({ ...preview, hidden: 'unexpected' }), {
      status: 200,
    }),
  );
  const client = createCollectionClient(
    'https://api.example.invalid',
    async () => 'token',
    transport,
  );
  await expect(
    client.previewFusion([id(10), id(10), id(11), id(12), id(13)]),
  ).rejects.toThrow();
  expect(transport).not.toHaveBeenCalled();
  await expect(
    client.previewFusion(preview.sources.map((s) => s.id)),
  ).rejects.toThrow();
});
