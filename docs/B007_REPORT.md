# B007 — Idempotent starter deck report

28 October 2026. Backend implemented and validated locally and on GitHub. B005 actual-provider acceptance and authorized publication of an eligible starter series remain open deployment/onboarding gates.

## Changed files

- `prisma/schema.prisma`, `prisma/migrations/202610280004_starter_grant/migration.sql`, `prisma/rollback/202610280004_starter_grant.sql`: explicit starter eligibility, permanent unique per-account grant, immutable instance origin, face uniqueness and deferred 52-card/event completeness.
- `services/api/src/starter.ts`, `starter.test.ts`, `starter.integration.test.ts`: authenticated endpoint/service, transactional grant/replay, bounded per-user limiter, rollback/concurrency/access tests.
- `services/api/src/catalog.ts`: extracted the existing shared manifest loader for use within the grant transaction; public DTO adds server-owned starter eligibility.
- `services/api/src/app.ts`: registers the starter controller/service; unconfigured identity remains fail-closed.
- `services/api/src/auth/service.ts`: logout now locks account before session/audit writes, matching grant/link/deletion ordering and preventing a foreign-key/session lock inversion.
- `packages/contracts/src/index.ts`, `architecture/API_CONTRACT.yaml`: strict command/receipt schemas, public eligibility flag, versioned API documentation.
- `docs/STARTER_DECK.md`, this report, `docs/DECISIONS.md`, `prisma/README.md`, `backlog/STATUS.md`: operation, lock proof, recovery, actual results and acceptance limits.

## Executed checks

- Prisma format/generate and schema-to-schema migration SQL generation completed. The owned disposable runner validates/deploys migrations twice, seeds twice, checks constraints and all API integrations, reverses migrations, resets/reseeds and repeats. No existing Compose/production DB was mutated.
- `pnpm ci:database`: **32 cases in 4 files passed both before and after rollback/reset/reseed**. Ten simultaneous requests with both repeated and distinct keys returned identical receipts; exactly 52 distinct UUIDs/faces, 52 origins, one grant and one operation were persisted. Failure injected at provenance insertion rolled all writes back; retry succeeded. Logout/grant race, guest linking, cross-account inventory isolation, invalid rarity/rights/draft status, revocation, limits and SQL invariants passed.
- Initial checks found a narrow test parameter type and an incorrect expected HTTP 500 for the existing safe 503 filter; corrected both. The first DB run passed 28 cases and failed that test expectation, then the expanded suite passed. No failed run is represented as success.
- `pnpm ci:quality`: **41 unit cases in 9 files**, strict types, lint, formatting and **11 builds passed** after the expanded integration test types.
- `pnpm ci:audit`: passed the high/critical threshold; one inherited low advisory remains.
- `pnpm --package=@redocly/cli@2.72.0 dlx redocly lint architecture/API_CONTRACT.yaml --extends spec`: passed.
- `git diff --check`, local documentation links and a limited credential-pattern scan passed. API health returned ok and the running web app returned HTTP 200; both servers were left running. No UI change was made, so no new device/browser-rendering acceptance is claimed.
- Hosted [CI run 40798298635](https://github.com/BLUAlteractive/MasterDeck/actions/runs/40798298635) passed Quality checks (including the real PostgreSQL suite) and Dependency audit for implementation commit `f8386a0`. [Draft PR #6](https://github.com/BLUAlteractive/MasterDeck/pull/6) is stacked on B006; draft status preserves the outstanding provider/publication gates. No merge was performed.

## Remaining risks and next ticket

All real art remains DRAFT/INTERNAL_PREVIEW and starter-ineligible. No real managed identity was configured or falsely accepted from fixture evidence; B005/M0 remains pending. This implements the backend, not a native onboarding/gallery flow. Per-process rate limiting needs shared enforcement before horizontal deployment. No gameplay, commerce, step or location feature is included.

The next smallest ticket is B008 — Ownership history, using these preserved grant origins. No merge, production action or independent review is claimed.
