# Database foundation — B004

The executable schema is `prisma/schema.prisma`, configured by root `prisma.config.ts`. The older `architecture/schema.prisma` remains a nonexecutable planning draft. Prisma CLI/client/adapter are pinned to stable 7.10.1; Node 22.22.0 and PostgreSQL 17.6 are the tested baseline. Prisma 8 release candidates are not used.

## Scope and invariant ownership

Foundation contains internal User and external `(issuer, subject)` bindings, canonical faces, draft series/templates, individual card instances, append-only ownership events and actor/operation-scoped committed operation records. It creates no users, player cards, rewards, wallets, fusion/press jobs, purchases or game state during seeding. B005 extends this foundation with auth sessions/audit/deletion requests; configured identity endpoints use the database, while health remains process liveness. See [identity setup](../docs/AUTH.md).

The development seed inserts exactly 52 faces plus one unpublished original sample series. B006 adds 53 original SVG asset records and 52 template mappings with internal-preview provenance, not commercial publication approval. It does not overwrite local edits or grant inventory. B006 owns catalog/rights/asset validation and publication; B007 owns starter grants. Later tickets add their own narrowly scoped migrations rather than deploying the entire planning draft.

PostgreSQL constraints enforce rank/suit/canonical identity, UUID uniqueness, valid enums, template/instance face/series consistency, positive versions/serials and blue odd/red even progression. Card identity fields are immutable; state changes advance version by one. History and committed operation records reject update/delete. Foreign keys restrict deletion of referenced owners/catalog/history. These are normal application integrity controls, not protection against a privileged DBA who can alter triggers or tables.

Each instance has one current owner FK. Append-only events are historical facts and may contain multiple records; they are not competing current ownership rows. Feature services must write every inventory change and its event in the same transaction. B004 tests the primitives; it does not implement grant/fusion/press services or pretend database triggers enforce every future business rule.

## Local setup and non-destructive commands

```bash
pnpm install --frozen-lockfile
pnpm setup:local
pnpm infra:up
pnpm db:generate
pnpm db:validate
pnpm db:deploy
pnpm db:seed
```

Before commands that connect, root `.env` must contain the local `DATABASE_URL` from the updated template. Existing ignored `.env` files are never overwritten by setup; add this root variable manually if the file predates B004. Keep it in sync with root Compose ports/credentials and the reserved API connection URL. Never paste production credentials here. Generation/validation use a nonconnecting port-1 placeholder when the variable is absent; deploy fails instead of silently selecting a database.

`prisma db seed` explicitly loads `prisma/seed.ts` through Prisma 7 config; reset does not automatically seed. The generated client lives under ignored `packages/database/src/generated/`; root build/typecheck/setup commands regenerate it before use. `@deckforge/database` is a server-only adapter; pure game/card packages must not import it. Disconnect each client at process/test shutdown.

## Disposable database verification

```bash
pnpm ci:database
# alias:
pnpm db:test
```

Requires a working local Docker engine. The runner creates a fresh random database/password in a new loopback-published PostgreSQL container with temporary storage and no persistent volume. It ignores any caller DATABASE_URL, validates/generates, deploys twice, checks status, seeds twice and runs foundation and identity integration cases (22 at B006). It reverses the first migration and verifies that all foundation tables disappeared, then exercises Prisma reset, reseeds and reruns the suite. Finally it removes only its own container. CI executes this same command; no production or shared database URL is provided.

Prisma's Codex safety guard requires explicit user consent for an agent to exercise `prisma migrate reset --force`, even on the runner-owned database. Do not bypass that guard, manufacture consent, disable agent detection or claim the reset passed when it stopped. When the user approves, forward the exact consent message using Prisma's documented consent environment variable for that bounded run only. Never persist consent in configuration, a script or CI secrets.

The separate local developer reset wrapper is intentionally destructive and refuses remote hosts, other database names, extra URL parameters or missing confirmation:

```bash
# MANUAL local-only operation: erases the local deckforge database.
pnpm db:reset --confirm-local-data-loss
pnpm db:seed
```

A loopback hostname alone cannot prove that a user has not configured a production tunnel; verify the actual local target before using this manual command. Automated tests use their owned container instead. Never run reset against staging or production. No reset of the existing local Compose database is part of B004 validation.

## Transactions, observability and migrations

- Apply schema changes with committed SQL via migrate deploy, not production `db push` or reset. Do not edit an applied migration; add another migration. The first migration wraps its DDL and custom checks/triggers in one transaction.
- Inventory operations use explicit row locking in stable UUID order plus optimistic stateVersion checks. Use SERIALIZABLE where the operation spans predicate invariants, bounded retries for Prisma P2034, and an actor/operation/key-scoped request hash/result committed with state/events. Document the actual isolation/lock proof per feature; a version counter alone does not make multi-row operations atomic.
- Keep provider calls and publishing outside transactions. Persist outbox events with state once a feature needs delivery; outbox implementation belongs to its owning feature, not this schema placeholder.
- Store integer currency values and append-only journals in B060; do not add legacy Credits or interchangeable currencies. Canonical activity/proof reconciliation and press/fusion locking remain gated product designs.
- Seed/check tools emit safe operation status and duration, never connection strings or row contents. Integration assertions demonstrate duplicate rejection and rollback. Runtime pool/transaction metrics will be connected with the first API database feature; this ticket adds no production database telemetry or health readiness claim.

## Rollback and recovery

`prisma/rollback/202610280001_foundation.sql` is a destructive **test-only** reversal of the first schema, exercised only by the disposable runner. It drops foundational tables/types/functions; it is not a safe production rollback and does not rewrite Prisma migration history. The runner's subsequent reset reestablishes history only in its owned temporary database.

For deployed environments, stop incompatible writers, preserve an observed backup and migration history, inspect affected data, and prepare a reviewed forward repair or restore into a separate database. Validate it against a restored copy before an approved cutover. Do not reverse populated card/history tables or mark a migration rolled back without repairing the actual schema. Production migration/restore actions require explicit approval and B052 recovery evidence.

References: [Prisma 7 config](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference), [generator](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators), [explicit seeding](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/seeding), [migration recovery](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/patching-and-hotfixing).

B006 adds immutable art/template versions, front/back/face consistency constraints, draft asset seeding and a published-only catalog projection. Content conflicts fail instead of rewriting prior versions. Only the known original no-art rights placeholder is normalized while DRAFT; user-edited names are preserved. See [catalog authoring](../docs/CATALOG.md).

B007 adds permanent per-account starter grants and immutable instance origins. All series default starter-ineligible. The account-first lock order includes logout to avoid session/audit foreign-key deadlocks. Deferred completion requires exactly 52 cards plus origin events in the same transaction. See [starter contract and recovery](../docs/STARTER_DECK.md); test reversal removes B007 additions before the earlier reversals.

B008 adds exact-instance origin references, operator attribution and atomic state/history guards. New writers must supply origin IDs and complete snapshots. Standalone DB checks build shared packages after client generation. Migration refuses duplicate legacy versions or unknown lock reservations; it never invents origins. See [ownership-history contract and upgrade preflight](../docs/OWNERSHIP_HISTORY.md) before applying to populated data.

B009 adds primary loadout and display-manager references, exact owner/face/revision FKs and deferred 52-face completeness. Manager slot range/uniqueness limits references to 100 without limiting inventory or touching card/history rows. See [loadout, manager and recovery contract](../docs/LOADOUTS.md); test reversal removes these references before prior inventory migrations.

B010 adds owner-scoped CardFavorite presentation preferences only. Boolean updates preserve CardInstance/OwnershipEvent, and reversal drops only preferences. Inventory now projects safe series/version/status/preference metadata for the gallery. See [gallery integration and acceptance gates](../docs/COLLECTION_GALLERY.md); real managed-session host and physical-device validation remain pending.
