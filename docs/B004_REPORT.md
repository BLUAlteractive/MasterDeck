# B004 — Database foundation report

28 October 2026. **Implemented and locally validated; hosted confirmation pending.** The explicit-consent reset gate is resolved. Work is isolated on `database/b004-foundation`, stacked on B003; no production or existing local Compose database has been mutated.

## Changed files

- `prisma/schema.prisma`, `prisma.config.ts`: executable scoped foundation and Prisma 7 CLI/seed configuration.
- `prisma/migrations/202610280001_foundation/migration.sql`, `prisma/migrations/migration_lock.toml`: initial SQL plus explicit constraints/triggers and transactional DDL.
- `prisma/rollback/202610280001_foundation.sql`: destructive test-only reversal, never a populated deployment rollback.
- `packages/database/package.json`, `packages/database/tsconfig.json`, `packages/database/src/index.ts`, `packages/database/src/seed.ts`: server-only Prisma PostgreSQL client factory and non-overwriting development seed.
- `prisma/seed.ts`, `prisma/foundation.integration.test.ts`, `vitest.database.config.mts`: explicit seed entry point and eight real PostgreSQL acceptance cases.
- `scripts/ci-database.mjs`, `scripts/database-reset.mjs`, `scripts/database-reset.test.ts`: runner-owned temporary PostgreSQL lifecycle, guarded manual reset, five refusal cases.
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`: stable Prisma/adapter/client 7.10.1, dotenv 18.0.9, explicit engine build approvals and database/root regeneration commands.
- `.github/workflows/ci.yml`, `turbo.json`, `tsconfig.tests.json`, `eslint.config.mjs`, `.gitignore`, `.prettierignore`: real CI database checks, generation/cache inputs, strict typechecks and pure-domain/generated-source boundaries.
- `.env.example`, `prisma/README.md`, `README.md`, `docs/CI.md`, `docs/ENVIRONMENTS.md`, `docs/DECISIONS.md`, `backlog/STATUS.md`, this report: safe local CLI configuration, transactions, observability, rollback, consent and actual status.

## Implemented scope

User/identity seams, canonical faces and draft sample series, versioned templates, unique instances/current owner, immutable history and scoped committed operation records. No application endpoint uses the database yet. No player cards, wallet balances, rewards, fusion/press, purchase or gameplay services are created by this ticket. Template/instance relational consistency and permanent instance identity are enforced in SQL rather than trusting client DTOs.

Seed is deterministic and non-destructive: exactly 52 faces plus one unpublished sample series without art assets; no instances/grants or overwrite of existing local edits. Feature services still need their own atomic grant/history workflows, source-key semantics and integration tests. Database-owner privileges are not a defense against a malicious DBA; deployment roles and operational access remain release concerns.

## Actual validation

- Docker daemon available (29.2.1). Stable Prisma CLI/client/adapter 7.10.1 supports pinned Node 22.22.0; Prisma 8 latest RC deliberately not selected.
- `pnpm add -Dw prisma@7.10.1 dotenv@18.0.9`, `pnpm install`, explicit Prisma engine/script rebuild: successful. No speculative auth/game/map SDKs added.
- `prisma format`, `pnpm db:generate`, `pnpm db:validate`: passed. `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script` produced the base migration; custom SQL constraints/triggers were then added.
- `pnpm typecheck`, `pnpm lint`: passed.
- `pnpm ci:quality`: passed formatting/lint/strict types, **19 tests in 4 files**, **11 builds**. Five new tests prove the manual reset wrapper refuses missing confirmation, remote/other DB targets, unsafe query parameters and malformed URLs before invoking Prisma.
- `pnpm ci:audit`: exit 0, one inherited low finding; no high/critical findings.
- First `pnpm ci:database`: new random database/password in a runner-created loopback-only ephemeral PostgreSQL 17.6 container, never the caller URL. Validate/generate, migration deploy twice, migrate status, seed twice, all **8 DB tests** and destructive test rollback passed. Test cases cover seed completeness/idempotence, eight-way duplicate UUID insertion, FKs, enums/levels/versions/serials, identity/version protection, append-only source-unique history, scoped operation records, identity binding uniqueness and atomic rollback.
- The subsequent exact command `pnpm exec prisma migrate reset --force` was refused by Prisma's built-in Codex guard because it requires new explicit user consent. That initial attempt did not verify reset/reseed; it was superseded by the approved run below. The temporary database/container was removed in `finally` after refusal. Existing Compose data was untouched.
- Final formatting, workflow validation and whitespace review are run before publication. Generated client output is ignored; no production credential or stored consent is introduced.

## Approved reset and next work

The user confirmed continuation after the bounded reset approval request. The exact new consent was forwarded only to the local test process, not persisted in repository files or CI configuration. The approved `pnpm ci:database` run exited 0: migration deployment/status, repeated seed, eight constraint/concurrency tests, test-only rollback, **Prisma reset**, reseed and the same eight tests all passed. Safe check duration was approximately 11 seconds. Only the runner-owned temporary database was mutated and its container was removed.

Full quality remains 19 unit tests and 11 builds; database verification adds eight distinct integration cases, executed both before and after reset. No production credential or approval bypass was added. Final formatting, lint, workflow validation, frozen installation, credential-pattern scan and whitespace checks passed.

Next: publish the B004 commit/PR, verify hosted checks and proceed to **B005 — Auth and permissions**. Managed-provider/device setup and linking/merge review remain explicit gates; continued development does not authorize production resources or skipped acceptance.
