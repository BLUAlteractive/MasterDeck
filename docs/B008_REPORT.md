# B008 — Ownership history report

28 October 2026. Implemented and validated locally and on GitHub. Real-provider/artwork gates remain open; no merge or deployment is claimed.

## Changed files

- `packages/card-domain/src/lifecycle.ts`, tests and index: pure versioned status/reservation rules, terminal guards and generated sequence coverage.
- `packages/database/src/inventory.ts`, index: server-only atomic origin/transition helpers, typed conflicts and safe snapshots.
- `prisma/schema.prisma`, `prisma/migrations/202610280005_ownership_history/migration.sql`, matching rollback: exact-instance origin reference, operator attribution, lock fields, one event/version, transition/snapshot/commit guards and indexes.
- `services/api/src/history.ts`, integration tests, app registration: authorized bounded retained history with safe projection and revocation ordering.
- `packages/contracts/src/index.ts`, `architecture/API_CONTRACT.yaml`: strict history request/response contracts and implemented provenance route.
- `services/api/src/starter.ts`: bulk grant now assigns exact origin event IDs, operator and full snapshots without changing its 52-card/once-per-account receipt semantics.
- `prisma/foundation.integration.test.ts`, auth/starter integration fixtures: valid origins/events and atomic transitions under the stronger constraints; previous constraint assertions retained.
- `scripts/ci-database.mjs`: build shared packages after generation for reliable standalone checks.
- `docs/OWNERSHIP_HISTORY.md`, this report, DECISIONS, database guide and backlog status: authority, legacy preflight, migration/recovery and acceptance evidence.

## Executed checks

- Prisma format/generate and schema-to-schema SQL generation completed. No production or existing Compose data was changed.
- `pnpm ci:database`: **37 cases in 5 files passed before and after rollback/reset/reseed**, including all earlier foundation/auth/catalog/starter acceptance and new owner/privacy/terminal/pagination/concurrency/atomicity cases. Ten competing transitions produced one winner and one version/event advance.
- Early checks caught optional actor typing and a narrow test source-key type; corrected. An early DB run used stale compiled client/helpers because shared build had failed; six existing cases failed. The runner now rebuilds shared packages itself; the full suite passed after that correction. These failed checks are not represented as successful runs.
- `pnpm ci:quality`: **44 unit/property cases in 10 files**, strict types, lint, formatting and **11 builds passed**. Generated lifecycle sequences cover reservation/version invariants; terminal behavior is checked across every available action.
- `pnpm ci:audit`: passed the high/critical gate; one inherited low advisory remains.
- `pnpm --package=@redocly/cli@2.72.0 dlx redocly lint architecture/API_CONTRACT.yaml --extends spec`: passed.
- `git diff --check`, local documentation links and a limited credential-pattern scan passed. API health returned ok and the local web server returned HTTP 200; both remain running. No UI changed and no new native/browser-rendering evidence is claimed.
- Hosted [CI run 40804881433](https://github.com/BLUAlteractive/MasterDeck/actions/runs/40804881433) passed Quality checks (including PostgreSQL) and Dependency audit for implementation commit `05287b8`. [Draft PR #7](https://github.com/BLUAlteractive/MasterDeck/pull/7) is stacked on B007; the external onboarding gates remain explicit. No merge was performed.

## Remaining risks and next ticket

The migration deliberately refuses ambiguous duplicate legacy versions or locked rows without reservation metadata; fresh tests do not prove a populated legacy upgrade. Existing missing history is not fabricated. Full operator identity remains internal pending audited admin tooling. Feature-specific reward, fusion, press and refund authorization remains outside these infrastructure helpers; there is no public state-mutation endpoint.

No UI, gameplay, payments, blockchain or location feature is introduced. B005 actual Supabase acceptance, approved starter publication and native collection/history UI remain unverified. Next smallest ticket: B009 — Loadout validator.
