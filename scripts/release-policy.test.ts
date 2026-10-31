import { it, expect } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  assessRelease,
  releaseGates,
  releaseApprovalPayload,
  releaseDigest,
  releaseManifestSchema,
  type ReleaseManifest,
  type ReviewerRegistry,
} from './release-policy.mjs';
const now = new Date('2026-10-30T20:00:00Z'),
  commit = 'a'.repeat(40);
const template = JSON.parse(
  readFileSync(
    new URL('../ops/release-manifest.json', import.meta.url),
    'utf8',
  ),
) as unknown;
function signedFixture() {
  const m = releaseManifestSchema.parse(template);
  m.artifactCommit = commit;
  m.apiOrigin = 'https://api.example.invalid';
  m.adminOrigin = 'https://admin.example.invalid';
  m.corsOrigins = [m.adminOrigin];
  m.databaseReference = 'TEST_ONLY/database';
  m.keySetReference = 'TEST_ONLY/keyset';
  const roles = [
    'PRODUCT',
    'SECURITY',
    'PLATFORM',
    'PRIVACY',
    'LEGAL',
    'OPERATIONS',
  ] as const;
  const pairs = Object.fromEntries(
    roles.map((role) => [role, generateKeyPairSync('ed25519')]),
  );
  const registry: ReviewerRegistry = {
    version: 1,
    keys: roles.map((role) => ({
      id: role + '_TEST_ONLY',
      roles: [role],
      publicKeyPem: pairs[role]!.publicKey.export({
        format: 'pem',
        type: 'spki',
      }).toString(),
      revoked: false,
    })),
  };
  for (const gate of Object.keys(releaseGates) as (keyof typeof releaseGates)[])
    m.gates[gate] = {
      status: 'APPROVED',
      evidenceRef: 'https://example.invalid/TEST_ONLY_EVIDENCE',
      evidenceSha256: 'b'.repeat(64),
      approval: {
        keyId: releaseGates[gate] + '_TEST_ONLY',
        reviewer: 'TEST ONLY, not approval',
        signedAt: now.toISOString(),
        signature: 'A'.repeat(86) + '==',
      },
    };
  for (const gate of Object.keys(
    releaseGates,
  ) as (keyof typeof releaseGates)[]) {
    const e = m.gates[gate];
    if (e.status === 'APPROVED')
      e.approval.signature = sign(
        null,
        releaseApprovalPayload(m, gate, e.approval),
        pairs[releaseGates[gate]]!.privateKey,
      ).toString('base64');
  }
  return { m, registry };
}
it('keeps the actual unsigned repository checklist NO-GO while validating its strict shape', () => {
  const result = assessRelease(
    template,
    { version: 1, keys: [] },
    { expectedCommit: commit, now },
  );
  expect(result.decision).toBe('NO_GO');
  expect(result.blockers).toContain('CORE_B060_B082:UNVERIFIED');
  expect(result.blockers).toContain('PRODUCT_GO_NO_GO:UNVERIFIED');
});
it('requires authenticated role-scoped signatures bound to the exact artifact, flags and evidence', () => {
  const { m, registry } = signedFixture();
  expect(
    assessRelease(m, registry, { expectedCommit: commit, now }).decision,
  ).toBe('GO');
  m.flags.billing = true;
  expect(
    assessRelease(m, registry, { expectedCommit: commit, now }).blockers.some(
      (b) => b.endsWith(':INVALID_SIGNATURE'),
    ),
  ).toBe(true);
});
it('rejects revoked, untrusted, expired and wrong-role signatures', () => {
  const { m, registry } = signedFixture();
  registry.keys[0]!.revoked = true;
  expect(
    assessRelease(m, registry, { expectedCommit: commit, now }).decision,
  ).toBe('NO_GO');
  registry.keys[0]!.revoked = false;
  registry.keys[0]!.roles = ['LEGAL'];
  expect(
    assessRelease(m, registry, { expectedCommit: commit, now }).blockers,
  ).toContain('CORE_B060_B082:UNTRUSTED_REVIEWER');
  registry.keys[0]!.roles = ['PRODUCT'];
  expect(
    assessRelease(m, registry, {
      expectedCommit: commit,
      now: new Date('2027-01-01'),
    }).blockers,
  ).toContain('CORE_B060_B082:STALE_OR_FUTURE_SIGNATURE');
});
it('rejects unsafe origins, unknown power flags and unsigned approved evidence', () => {
  const { m, registry } = signedFixture();
  expect(() =>
    assessRelease({ ...m, apiOrigin: 'http://localhost:3001' }, registry, {
      expectedCommit: commit,
      now,
    }),
  ).toThrow();
  expect(() =>
    assessRelease({ ...m, apiOrigin: 'https://127.2.3.4' }, registry, {
      expectedCommit: commit,
      now,
    }),
  ).toThrow();
  expect(() =>
    assessRelease(
      { ...m, flags: { ...m.flags, purchasedPressBoosts: true } },
      registry,
      { expectedCommit: commit, now },
    ),
  ).toThrow();
  const broken = structuredClone(m) as ReleaseManifest;
  const e = broken.gates.PRODUCT_GO_NO_GO;
  if (e.status === 'APPROVED') e.approval.signature = '';
  expect(() =>
    assessRelease(broken, registry, { expectedCommit: commit, now }),
  ).toThrow();
});
it('cannot reuse a signature after evidence changes or claim a different build is approved', () => {
  const { m, registry } = signedFixture();
  const before = releaseDigest(m),
    e = m.gates.PRIVACY_DELETION_RETENTION;
  if (e.status === 'APPROVED') e.evidenceSha256 = 'c'.repeat(64);
  expect(releaseDigest(m)).not.toBe(before);
  expect(
    assessRelease(m, registry, { expectedCommit: 'd'.repeat(40), now })
      .blockers,
  ).toContain('ARTIFACT_NOT_CURRENT_PINNED_COMMIT');
  expect(
    assessRelease(m, registry, { expectedCommit: commit, now }).decision,
  ).toBe('NO_GO');
});
