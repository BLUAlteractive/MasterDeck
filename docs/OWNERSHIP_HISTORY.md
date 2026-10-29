# Ownership history — B008

Every new instance has an immutable `originEventId` tied by a deferred composite foreign key to an event for that exact instance. New origins are version one, OWNED, with MINT, GRANT or FUSION_CREATE action. Starter creation still uses one GRANT origin per card; this represents the issuance/grant, without manufacturing a second event. Each subsequent state version has exactly one append-only event. Version order, not wall-clock timestamps, defines pagination and causality.

## Server primitives and authority

`createCardWithOrigin(tx, data, audit)` and `writeCardTransition(tx, input)` live in the server-only database package. They must run inside the calling feature's transaction. The creation helper does not prove reward eligibility; it is not callable from a client endpoint. Starter keeps its existing bulk inserts but now supplies the exact origin IDs and complete snapshots atomically.

The pure card-domain lifecycle accepts:

| Current state   | Command        | Result   | Requirement                                                                                                           |
| --------------- | -------------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| OWNED           | LOCK           | LOCKED   | New reservation token and bounded reason code                                                                         |
| LOCKED          | UNLOCK         | OWNED    | Exact reservation token                                                                                               |
| OWNED           | FUSION_CONSUME | CONSUMED | Internal primitive only; B032 must prove five eligible inputs and create one result in the same enclosing transaction |
| OWNED or LOCKED | REVOKE         | REVOKED  | Internal primitive only; owning refund/moderation feature must establish authority                                    |

CONSUMED and REVOKED are terminal in this implementation. No mutation endpoint, role promotion, generic grant console, fusion recipe or refund action is exposed. The consume fixture tests only retention/state infrastructure; it is not a production one-card fusion flow. Feature-level replay and entitlement/eligibility checks remain with the calling feature. Existing B007 replay is unchanged.

A transition locks the card, checks owner and expectedVersion, validates the pure rule, increments exactly once and inserts its event. Duplicate audit source keys roll the state change back. Callers acquire account/session locks first and multiple card locks in ascending UUID order. The history reader shares account/session/card locks, ordering access revocation with the read. A stale writer receives a typed conflict and cannot overwrite a competing operation.

SQL enforces lock field shape, terminal states, immutable origin/owner/serial/earned identity, version advancement, one event per version, exact matching snapshots and action/state consistency at commit. Helpers verify reservation tokens; privileged direct SQL is not an application authorization interface. Automated writers identify their service with a bounded `operatorId`; human actions also retain actorUserId. No actor or history row is erased on ordinary consumption.

Level/rarity/branch/owner mutation is currently blocked. B032 creates a separate child after consuming five, while B068/B069 must explicitly extend the guard for evidence-linked in-place Press evolution and consumption. There is no generic PRESS_EVOLVE or tier-edit bypass. Future reviewed restore/transfer semantics, if approved, require a scoped migration and tests rather than resurrecting terminal rows through this helper.

## Read API

`GET /v1/cards/{cardId}/provenance?afterVersion=0&limit=25` requires an active bound bearer session and the instance's owner. It includes consumed/revoked cards; active inventory remains limited to OWNED/LOCKED. There is no public history or admin-read bypass. Missing and another owner's instance both return safe 404. Invalid UUIDs, owner selectors, negative cursors, unknown query fields and limits over 100 are rejected.

The response includes card/series/face identity, nullable edition serial/origin, current status/version and ordered events. Each event exposes ID, action, version, recordedAt, safe state and an actor category SELF/OPERATOR/SYSTEM/UNKNOWN. It omits internal operator/actor IDs, source keys, reasons, raw snapshots and lock tokens. Full operator/source traceability remains in the append-only database; B044/B045 own audited administrative investigation access. The response never fabricates limited-edition serials.

`nextVersion` is the last returned version when another page exists; pass it as `afterVersion`. New writes append higher versions, so existing pages stay stable. Restart at zero to refresh. Current state and page are read under the same shared card lock. Legacy event snapshots lacking safe state fields return `state: null`, and unrecorded origins remain null.

## Migration and recovery

Migration `202610280005_ownership_history` backfills origin pointers only from already-recorded version-one origin events. It never invents provenance or rewrites history. The old version trigger is disabled only for this pointer backfill within the migration transaction/table lock and restored before commit. Runtime triggers remain enabled.

A legacy database containing multiple events for one card/version fails the new unique index rather than dropping any history. Existing LOCKED rows without recorded reservation metadata fail migration rather than receiving an invented token or being silently unlocked. Inspect any such database and design an explicit reviewed reconciliation before applying this migration. No populated legacy upgrade claim is inferred from fresh database tests. Legacy cards with no recorded origin remain identifiable but unverified; their missing origin cannot later be silently replaced.

The matching reversal is destructive and used only by the owned disposable test database. Deployed recovery requires preserved backups/history and reviewed forward repair or separate restore; never reset or erase grants/events to roll back. No existing Compose or production data was changed.

## Verification and limits

Run `pnpm ci:quality`, `pnpm ci:database`, `pnpm ci:audit`. The DB runner now builds shared packages after generation so direct invocation cannot load stale exports/client code. Tests cover pure transitions/generated sequences, signed owner reads, privacy, pagination, terminal retention, ten-writer races, atomic failure, missing/cross-card origins and append-only SQL behavior. All migrations reverse/reset/reseed in its own fresh PostgreSQL container and repeat. Logs expose only fixed event/status/count/duration or safe error/request IDs.

Native gallery/history screens are B010. B005's actual provider flow and starter artwork publication remain external gates; signed fixtures and backend history do not clear those gates. Next is B009 — Loadout validator.
