import { randomUUID } from 'node:crypto';
import { developmentCatalog } from '@deckforge/card-domain';
import type { PackDefinition } from '@deckforge/contracts';
import type { identityFixture } from './auth-fixture';
import { fixtureAdmin } from './admin-fixture';
import { ContentAdminService } from '../src/admin/content';
import { PackCatalogService } from '../src/packs/catalog';
import { hash } from '../src/rooms/shared';
/** Synthetic original rights/review evidence in an owned test DB only, never a runtime bootstrap. */
export async function fixturePack(
  f: Awaited<ReturnType<typeof identityFixture>>,
  options: {
    stockLimit?: number;
    regions?: string[];
    price?: number;
    inkOnly?: boolean;
    cardOnly?: boolean;
  } = {},
) {
  const editor = await fixtureAdmin(f, ['CONTENT_EDITOR']),
    reviewer = await fixtureAdmin(f, ['CONTENT_REVIEWER']),
    economist = await fixtureAdmin(f, ['CONTENT_REVIEWER']),
    publisher = await fixtureAdmin(f, ['CONTENT_PUBLISHER']);
  const key = () => ({
      commandId: randomUUID(),
      reason: 'TEST_ONLY_NOT_APPROVAL',
    }),
    seriesId = randomUUID(),
    artVersion = 100000 + parseInt(seriesId.slice(0, 8), 16);
  const assets = developmentCatalog.assets.map((a) => ({
    id: randomUUID(),
    key: a.key.replace('/v1/', '/v' + artVersion + '/'),
    kind: a.kind,
    faceId: a.faceId,
    sha256: a.sha256,
    mimeType: a.mimeType,
    width: a.width,
    height: a.height,
    rightsBasis: a.rights.basis,
    rightsHolder: a.rights.holder,
    sourceRef: a.rights.sourceRef,
    useScope: 'COMMERCIAL' as const,
    approvalReference: 'TEST_ONLY_NOT_APPROVAL',
  }));
  const templates = developmentCatalog.templates.map((t) => ({
    ...t,
    id: randomUUID(),
    frontAssetId: assets.find((a) => a.faceId === t.faceId)!.id,
    backAssetId: assets.find((a) => a.kind === 'BACK')!.id,
  }));
  await f.db.designAsset.createMany({ data: assets });
  const content = new ContentAdminService(f.auth);
  await content.command(editor.principal, {
    ...key(),
    action: 'DRAFT',
    seriesId,
    slug: 'test-pack-art-' + seriesId,
    displayName: 'Isolated pack art',
    rightsOwner: 'TEST_ONLY',
    templates,
  });
  for (const [actor, review] of [
    [reviewer, 'DESIGN'],
    [economist, 'PRODUCTION'],
  ] as const)
    await content.command(actor.principal, {
      ...key(),
      action: 'REVIEW',
      seriesId,
      review,
      evidence: 'TEST_ONLY_NOT_APPROVAL',
    });
  await content.command(publisher.principal, {
    ...key(),
    action: 'PUBLISH',
    seriesId,
  });
  const packId = randomUUID(),
    policy = {
      version: 'TEST_PACK_V1',
      approvalReference: 'TEST_ONLY_NOT_APPROVAL',
      allowedPackIds: [packId],
    },
    catalog = new PackCatalogService(f.db, policy);
  const definition: PackDefinition = {
    kind: 'DISCOVERY',
    name: 'Test earned discovery',
    startsAt: '2026-01-01T00:00:00Z',
    endsAt: '2030-01-01T00:00:00Z',
    regions: options.regions ?? [],
    stockLimit: options.stockLimit ?? 100,
    currency: 'TRAIL_CREDITS',
    price: options.price ?? 100,
    drawCount: 3,
    duplicatePolicy: 'ALLOW_COPIES',
    guarantee: 'NONE',
    pool: options.inkOnly
      ? [{ weight: 1, reward: { kind: 'TRAIL_INK', units: 2 } }]
      : [
          {
            weight: 3,
            reward: {
              kind: 'CARD',
              templateId: templates[0]!.id,
              branch: 'BLUE',
            },
          },
          ...(options.cardOnly
            ? []
            : [
                { weight: 1, reward: { kind: 'TRAIL_INK' as const, units: 2 } },
              ]),
        ],
  };
  await catalog.command(editor.principal, {
    ...key(),
    action: 'DRAFT',
    packId,
    slug: 'test-pack-' + packId,
    version: 1,
    definition,
  });
  for (const [actor, review] of [
    [reviewer, 'CONTENT'],
    [economist, 'ECONOMY'],
  ] as const)
    await catalog.command(actor.principal, {
      ...key(),
      action: 'REVIEW',
      packId,
      review,
      definitionHash: hash(definition),
      evidence: 'TEST_ONLY_NOT_APPROVAL',
    });
  await catalog.command(publisher.principal, {
    ...key(),
    action: 'PUBLISH',
    packId,
    expectedVersion: 1,
  });
  return {
    packId,
    catalog,
    definition,
    policy,
    templates,
    seriesId,
    publisher,
  };
}
