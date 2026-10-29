# Loadouts and collection manager — B009

A loadout is an explicit mapping from each of the 52 canonical face IDs to exactly one available instance belonging to the authenticated account. It is independent of the display manager. Neither selection changes card ownership, earned attributes, provenance, face probabilities or the server's future single-deck shuffle.

## Pure validation and availability

Card-domain `validateLoadout` checks exact canonical face coverage, unique instance IDs, ownership, face/template identity and OWNED status from server-resolved records. It does not trust client face metadata or card state. Missing, swapped, duplicated, foreign, LOCKED, CONSUMED and REVOKED choices fail. More than 52 cards may be owned; only the selected 52 are considered.

OWNED is required for a **new selection save** and reported as current selection eligibility. Existing references remain after a card becomes reserved or terminal; reads flag the selection invalid rather than silently substituting a card. This endpoint does not authorize an in-progress match, release a reservation or change immutable hand snapshots. B014/B018 must atomically validate admission before creating their own reservations/snapshots. The pending Press play-versus-claim policy remains R-08; B009 does not settle it by treating every future activity reservation as a new-selection permission.

One primary loadout per account is implemented. Extra named presets and selection UI are future presentation work, not a paid slot/economy policy. No loadout is auto-created by reading or by granting a starter deck. No artwork is published by selecting an instance.

## Owner API

All routes require a verified bound session, enforce the existing 60/IP/minute limit, and recheck active user/session/expiry under account/session locks. There is no owner selector or admin bypass.

| Route                          | Contract                                                                                                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/loadouts/current`     | `{loadout:null}` or the owner's ID/version/face mapping and current `{valid,issues}`. Read does not create or repair selections.                                                         |
| `PUT /v1/loadouts/{loadoutId}` | Strict `{expectedVersion,idempotencyKey,faceToInstanceIds}`. A client-generated UUID and version zero create the primary selection; subsequent saves require the current version.        |
| `GET /v1/collection/manager`   | Version (zero if absent), maxSlots=100, stored display references with status/active flag, activeInventoryCount and unmanagedCount.                                                      |
| `PUT /v1/collection/manager`   | Strict `{expectedVersion,idempotencyKey,slots:[{slot,instanceId}]}`; zero creates, then current version replaces references. Empty slots intentionally clear the display selection only. |

Keys contain 10–128 ASCII letters, digits, underscores or hyphens. UUID values and mapping order are normalized before hashing. Duplicate/missing/unknown face keys, extra body properties, invalid UUIDs and malformed slot arrays are rejected. Semantically invalid ownership/availability/face selection returns safe 409; another account's existing loadout ID returns 404. The payload never accepts client-computed wins, rarity, level or balances.

Each successful write stores an immutable scoped OperationRecord with normalized request hash/result. The same key/payload returns the original receipt even after a newer save, without reapplying the old selection. Changed payload conflicts. Clients use GET to obtain current state. Different concurrent keys with the same expected version yield one successful advance; stale writers receive 409. A replay still requires current authorization and is not match-admission evidence.

## 100 display slots, uncapped inventory

The manager permits zero to 100 distinct references in slots 1–100. It accepts owned OWNED/LOCKED cards for organization; organization is not game or spend eligibility. A selected card later consumed/revoked stays visible with `active:false` until the owner changes that display reference. Active means OWNED or LOCKED for this view. `unmanagedCount` is activeInventoryCount minus active selected references; it is not a cap or a paid inventory extension.

The manager does not constrain the primary loadout or stored ownership. Clearing/replacing references deletes only CollectionManagerSlot rows. CardInstance and OwnershipEvent are never deleted or revoked by capacity, saving, overflow or omission. `GET /v1/cards` remains paginated over all active inventory; a page-size limit of 100 is not an inventory limit. Gallery rendering, sorting/filtering/favorites and physical-device acceptance belong to B010.

## Persistence, concurrency and recovery

READ COMMITTED transactions acquire the account UPDATE lock for writes (SHARE for reads), then session SHARE and selected card SHARE locks in UUID order. Card mutation callers retain the B008 account-first/card-order discipline. Eligibility checks therefore stay stable through selection commit; no provider or UI call occurs while locked. Later card mutations may invalidate saved references and are revalidated on read and future admission.

Composite FKs enforce exact owner/face/instance mapping and matching parent revisions. Loadout face/instance uniqueness plus a deferred completion constraint ensure exactly 52 references at commit. Manager slot range and uniqueness ensure at most 100 references. Parent update guards require the same owner and one version increment. The application controls replacement/version/idempotency semantics; privileged direct SQL is not an authorization interface. No persistent inventory attribute changes occur during a selection save, so selection operations use OperationRecord rather than fabricating ownership-change events.

Migration `202610280006_loadouts` adds tables/indexes without changing existing cards or auto-selecting a collection. Its destructive reversal is only for the owned disposable runner; it removes references, never card/history data. Deployed recovery requires preserved backups/history and reviewed forward repair or a separate restore, not reset or inventory deletion. No existing Compose or production mutation was performed.

Safe `collection.loadout.*` / `collection.manager.*` logs contain fixed event/status/duration; errors use safe status/code/request ID. They omit user/card IDs, mappings and keys. No distributed deployment, match snapshot or provider acceptance is implied. Real Supabase setup and approved starter publication remain open gates.

## Verification

`pnpm ci:quality` includes pure permutation/mandatory-face/property cases. `pnpm ci:database` tests real signed identity/HTTP/PostgreSQL: rejection cases, normalized replay, ten competing loadout writers, stale saved choices, foreign ownership, 125 owned cards across 100 slots, pagination past 100, manager clearing/replay, fault rollback and competing manager saves. SQL tests exercise ownership/completeness/range constraints; the owned runner reverses/reset/reseeds and repeats. `pnpm ci:audit` and OpenAPI validation remain required. Next is B010 — Collection mobile gallery.
