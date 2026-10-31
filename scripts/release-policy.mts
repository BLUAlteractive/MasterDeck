import { createHash, createPublicKey, verify } from 'node:crypto';
import { z } from 'zod';
export const releaseGates = {
  CORE_B060_B082: 'PRODUCT',
  QUALITY_AND_SECURITY: 'SECURITY',
  NATIVE_ACCESSIBILITY: 'PLATFORM',
  PLATFORM_BILLING: 'PLATFORM',
  PRIVACY_DELETION_RETENTION: 'PRIVACY',
  LEGAL_AGE_ODDS_RIGHTS: 'LEGAL',
  STAGING_ENVIRONMENT_ISOLATION: 'OPERATIONS',
  PRODUCTION_KEYS_AND_BACKUPS: 'OPERATIONS',
  RESTORE_AND_ROLLBACK_DRILL: 'OPERATIONS',
  CAPACITY_AND_ALERT_DELIVERY: 'OPERATIONS',
  SUPPORT_INCIDENT_STAFFING: 'OPERATIONS',
  PRODUCT_GO_NO_GO: 'PRODUCT',
} as const;
const roles = [
  'PRODUCT',
  'SECURITY',
  'PLATFORM',
  'PRIVACY',
  'LEGAL',
  'OPERATIONS',
] as const;
const origin = z.url().refine((value) => {
  const u = new URL(value);
  return (
    u.protocol === 'https:' &&
    u.origin === value &&
    !u.username &&
    !u.password &&
    !['localhost', '0.0.0.0', '[::]', '[::1]'].includes(u.hostname) &&
    !u.hostname.startsWith('127.') &&
    !u.hostname.startsWith('[::ffff:7f') &&
    !u.hostname.endsWith('.localhost')
  );
}, 'Exact non-loopback HTTPS origin required');
const approval = z
  .object({
    keyId: z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/),
    reviewer: z.string().min(3).max(100),
    signedAt: z.iso.datetime(),
    signature: z.string().regex(/^[A-Za-z0-9+/]{86}==$/),
  })
  .strict();
const evidence = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('UNVERIFIED'),
      evidenceRef: z.null(),
      evidenceSha256: z.null(),
      approval: z.null(),
    })
    .strict(),
  z
    .object({
      status: z.literal('APPROVED'),
      evidenceRef: z
        .url()
        .refine(
          (value) =>
            new URL(value).protocol === 'https:' &&
            !new URL(value).username &&
            !new URL(value).password &&
            !new URL(value).search &&
            !new URL(value).hash,
        ),
      evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/),
      approval,
    })
    .strict(),
]);
export const releaseManifestSchema = z
  .object({
    version: z.literal(1),
    target: z.enum(['staging', 'production']),
    artifactCommit: z
      .string()
      .regex(/^[a-f0-9]{40}$/)
      .nullable(),
    apiOrigin: origin.nullable(),
    adminOrigin: origin.nullable(),
    corsOrigins: z.array(origin).max(10),
    databaseReference: z
      .string()
      .regex(/^[A-Za-z0-9_/-]{3,150}$/)
      .nullable(),
    keySetReference: z
      .string()
      .regex(/^[A-Za-z0-9_/-]{3,150}$/)
      .nullable(),
    flags: z
      .object({
        classicAdmission: z.boolean(),
        evolvedAdmission: z.boolean(),
        spadesAdmission: z.boolean(),
        tournaments: z.boolean(),
        billing: z.boolean(),
        activity: z.boolean(),
        poiDrops: z.boolean(),
        trailRewards: z.boolean(),
      })
      .strict(),
    gates: z
      .object({
        CORE_B060_B082: evidence,
        QUALITY_AND_SECURITY: evidence,
        NATIVE_ACCESSIBILITY: evidence,
        PLATFORM_BILLING: evidence,
        PRIVACY_DELETION_RETENTION: evidence,
        LEGAL_AGE_ODDS_RIGHTS: evidence,
        STAGING_ENVIRONMENT_ISOLATION: evidence,
        PRODUCTION_KEYS_AND_BACKUPS: evidence,
        RESTORE_AND_ROLLBACK_DRILL: evidence,
        CAPACITY_AND_ALERT_DELIVERY: evidence,
        SUPPORT_INCIDENT_STAFFING: evidence,
        PRODUCT_GO_NO_GO: evidence,
      })
      .strict(),
  })
  .strict();
export const reviewerRegistrySchema = z
  .object({
    version: z.literal(1),
    keys: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/),
            roles: z.array(z.enum(roles)).min(1),
            publicKeyPem: z
              .string()
              .min(60)
              .max(4096)
              .startsWith('-----BEGIN PUBLIC KEY-----\n'),
            revoked: z.boolean(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export type ReleaseManifest = z.infer<typeof releaseManifestSchema>;
export type ReviewerRegistry = z.infer<typeof reviewerRegistrySchema>;
type Approval = z.infer<typeof approval>;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export function releaseDigest(manifest: ReleaseManifest) {
  const gates = Object.fromEntries(
    Object.entries(manifest.gates).map(
      ([key, { status, evidenceRef, evidenceSha256 }]) => [
        key,
        { status, evidenceRef, evidenceSha256 },
      ],
    ),
  );
  return createHash('sha256')
    .update(canonical({ ...manifest, gates }))
    .digest('hex');
}
export function releaseApprovalPayload(
  manifest: ReleaseManifest,
  gate: keyof typeof releaseGates,
  a: Pick<Approval, 'keyId' | 'reviewer' | 'signedAt'>,
) {
  return Buffer.from(
    canonical({
      domain: 'deckforge-release-approval-v1',
      digest: releaseDigest(manifest),
      gate,
      role: releaseGates[gate],
      keyId: a.keyId,
      reviewer: a.reviewer,
      signedAt: a.signedAt,
    }),
  );
}
export function assessRelease(
  raw: unknown,
  rawRegistry: unknown,
  options: { expectedCommit: string; now?: Date },
) {
  const manifest = releaseManifestSchema.parse(raw),
    registry = reviewerRegistrySchema.parse(rawRegistry),
    now = options.now ?? new Date(),
    blockers: string[] = [];
  if (new Set(registry.keys.map((k) => k.id)).size !== registry.keys.length)
    throw new Error('Duplicate reviewer key');
  for (const entry of registry.keys) {
    const key = createPublicKey(entry.publicKeyPem);
    if (key.asymmetricKeyType !== 'ed25519')
      throw new Error('Ed25519 reviewer key required');
  }
  if (manifest.artifactCommit !== options.expectedCommit)
    blockers.push('ARTIFACT_NOT_CURRENT_PINNED_COMMIT');
  if (
    !manifest.apiOrigin ||
    !manifest.adminOrigin ||
    !manifest.databaseReference ||
    !manifest.keySetReference
  )
    blockers.push('DEPLOYMENT_UNCONFIGURED');
  if (
    manifest.apiOrigin === manifest.adminOrigin ||
    !manifest.adminOrigin ||
    !manifest.corsOrigins.includes(manifest.adminOrigin) ||
    new Set(manifest.corsOrigins).size !== manifest.corsOrigins.length
  )
    blockers.push('EXACT_SEPARATE_ORIGINS_REQUIRED');
  for (const gate of Object.keys(
    releaseGates,
  ) as (keyof typeof releaseGates)[]) {
    const e = manifest.gates[gate];
    if (e.status !== 'APPROVED') {
      blockers.push(gate + ':UNVERIFIED');
      continue;
    }
    const trusted = registry.keys.find(
      (k) =>
        k.id === e.approval.keyId &&
        !k.revoked &&
        k.roles.includes(releaseGates[gate]),
    );
    if (!trusted) {
      blockers.push(gate + ':UNTRUSTED_REVIEWER');
      continue;
    }
    const age = now.getTime() - new Date(e.approval.signedAt).getTime();
    if (age < -300000 || age > 30 * 86400000) {
      blockers.push(gate + ':STALE_OR_FUTURE_SIGNATURE');
      continue;
    }
    if (
      !verify(
        null,
        releaseApprovalPayload(manifest, gate, e.approval),
        createPublicKey(trusted.publicKeyPem),
        Buffer.from(e.approval.signature, 'base64'),
      )
    )
      blockers.push(gate + ':INVALID_SIGNATURE');
  }
  const signedKeys = new Set(
    Object.values(manifest.gates).flatMap((e) =>
      e.status === 'APPROVED' ? [e.approval.keyId] : [],
    ),
  );
  if (signedKeys.size < 2) blockers.push('INDEPENDENT_REVIEWERS_REQUIRED');
  return {
    validation: 'VALID' as const,
    decision: blockers.length ? ('NO_GO' as const) : ('GO' as const),
    digest: releaseDigest(manifest),
    blockers,
  };
}
