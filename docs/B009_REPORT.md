# B009 — Loadout validator report

28 October 2026. Backend implemented and validated locally and on GitHub. No gallery UI or match admission is claimed.

## Changed files

- `packages/card-domain/src/loadout.ts`, `loadout.test.ts`, index: reusable pure exact-face/ownership/availability validator and 100-slot reference validator with permutation and mandatory-face coverage.
- `prisma/schema.prisma`, `prisma/migrations/202610280006_loadouts/migration.sql`, matching reversal: primary loadout and display-reference storage, owner/face/revision FKs, uniqueness, slot range, positive/incremented versions and deferred 52-face completeness.
- `packages/contracts/src/index.ts`, `services/api/src/loadouts.ts`, app registration: strict normalized commands, owner-only current reads, transactional versioned/idempotent selection replacement and non-destructive manager operations.
- `services/api/src/loadouts.integration.test.ts`: actual signed-JWT/HTTP/database invalid-selection, race, replay, retention, rollback and SQL constraint cases.
- `architecture/API_CONTRACT.yaml`: implemented routes and bounded request/response schemas.
- `docs/LOADOUTS.md`, this report, DECISIONS, database guide and backlog status: scope, lock/replay proof, acceptance evidence and recovery.

## Executed checks

- Prisma format/generate and schema-to-schema migration generation completed. Actual mutations were confined to the runner-owned temporary PostgreSQL database; no existing Compose/production data was touched.
- Initial `pnpm ci:quality`: **48 unit/property cases in 11 files**, strict types/lint/formatting and **11 builds passed**.
- Initial `pnpm ci:database`: **43 cases in 6 files passed both before and after rollback/reset/reseed**. Added stronger manager fault/concurrency assertions after that run; final evidence is recorded below.
- Final `pnpm ci:quality`: **48 unit/property cases in 11 files**, strict types/lint/formatting and **11 builds passed** after the expanded integration assertions.
- Final `pnpm ci:database`: **43 cases in 6 files passed before and after rollback/reset/reseed**. Forced failure during manager replacement restored the 100 old references/version; competing manager clears yielded one 200 and one 409. Query owner selectors and revoked sessions were rejected. The 125 card rows/origin events survived all display operations.
- `pnpm ci:audit`: passed the high/critical gate; one inherited low advisory remains.
- `pnpm --package=@redocly/cli@2.72.0 dlx redocly lint architecture/API_CONTRACT.yaml --extends spec`: passed.
- Local documentation links, a limited credential-pattern scan and `git diff --check` passed. API health returned ok and the local web server returned HTTP 200; both remain running. No new UI/native rendering evidence is claimed. Hosted [CI run 40814797470](https://github.com/BLUAlteractive/MasterDeck/actions/runs/40814797470) passed Quality checks (including PostgreSQL) and Dependency audit for implementation commit `b82ee2b`. [Draft PR #8](https://github.com/BLUAlteractive/MasterDeck/pull/8) is stacked on B008, with the existing external gates explicit. No merge was performed.

## Risks, limits and next ticket

New save eligibility requires OWNED; a stored reserved/consumed/revoked reference is retained but flagged invalid, never silently repaired. This is not an in-progress hand permission or a resolution of the open Press snapshot policy. Game admission must revalidate under its own reservation/snapshot transaction.

The 100-slot manager is backend reference storage, not an ownership limit or a completed native gallery. One primary loadout is an implementation baseline, not a paid preset/slot policy. Real provider verification, approved starter artwork and native device/gallery acceptance remain open. No gameplay, payments, blockchain or location feature is added. Next smallest ticket: B010 — Collection mobile gallery. No merge or production action is performed.
