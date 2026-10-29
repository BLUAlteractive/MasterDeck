# Starter deck — B007

`POST /v1/cards/starter` requires a verified managed bearer token already bound through `/v1/auth/session`. Both guests and linked accounts may claim one free deck. The body is strictly `{seriesId, idempotencyKey}`; keys contain 10–128 ASCII letters, digits, underscores or hyphens. Owners, instance IDs, levels and rarity cannot be supplied by the client.

A series must be PUBLISHED, explicitly `starterEligible`, and pass the shared 52-face/53-asset manifest validation with commercial approval evidence. All selected templates must be COMMON and share one base style family. Public catalog rows expose the eligibility flag; the transaction still revalidates eligibility. No administrative publishing/eligibility endpoint is added. B044 owns review and authorized content administration.

**The actual seed remains DRAFT and ineligible.** Synthetic approval exists only in the runner-owned test database. There is no auth bypass, automatic starter grant, or shipped ownership UI. The current mobile catalog preview is still a preview.

## Transaction and replay

The transaction uses READ COMMITTED with explicit account `FOR UPDATE`, session `FOR SHARE`, then series/assets `FOR SHARE` locks. The account lock serializes all starter decisions, linking, deletion and logout. Session/asset locks hold access/publication checks through commit. Templates are immutable. User/session status and JWT expiry are rechecked after locks, including rejection of an old guest token after linking. A bounded 15-second wait/transaction timeout fails safely; a rolled-back attempt can be retried with the same key.

A permanent `StarterGrant.userId` unique constraint is the business source of truth, independent of the request key or current inventory. Each newly created grant atomically inserts:

- One immutable receipt, with the selected series/manifest version and original 52-card response.
- Exactly 52 server-generated UUID instances, each canonical face once, COMMON, Blue Level 1, OWNED and stateVersion 1. Catalog/template IDs are never used as instance IDs. No capped edition or serial claim is made.
- One append-only GRANT origin event per instance with actor, reason, version, safe snapshot and unique `starter:{grantId}:{faceId}` source key.
- One immutable `cards.starter` operation record containing the canonical request hash and response.

A deferred PostgreSQL constraint verifies the 52 instances and origin events at commit. `(starterGrantId, faceId)` is unique; the instance's grant origin and grant receipt cannot be changed or deleted.

The same key/different series conflicts. A new key/same series returns the same original receipt without new operations or cards. A new key/different series conflicts. Success replay survives series retirement, later card evolution/consumption and same-principal guest linking; it still requires current authorization. Receipt fields describe the grant at creation, not current card state. Use `GET /v1/cards` for current owner-only inventory. There is no inventory merge across different provider subjects.

## Abuse controls and observability

The existing 60/IP/minute HTTP limit remains. The starter service additionally permits 20 authenticated attempts/user/minute/process, including unavailable-series attempts and replays. Expiring buckets are capped at 10,000 active users and fail closed on capacity. This is a per-process limiter, not a distributed quota; horizontal deployment needs a shared limiter at the API edge/owning operations ticket. Permanent database uniqueness protects grants across processes and restarts.

Safe structured `inventory.starter` logs contain only granted/replayed status, count and duration; failure logs use existing fixed error/status/request ID fields. No raw identity, card ID list, key, token or rights proof is logged. Availability and limit rejections do not create partial grant records.

## Validation and recovery

`pnpm ci:quality` covers strict command and response schemas, limiter expiry/isolation and existing application checks. `pnpm ci:database` runs real PostgreSQL/HTTP/signed-JWT fixtures: ten concurrent mixed-key calls, replay/key conflicts, independent owners, linking, revocation, grant/logout race, invalid metadata/rarity, forced provenance-write rollback, immutable origin and deferred completeness. It reverses all migrations, resets/reseeds its owned temporary database and repeats. Provider fixtures are not a real Supabase acceptance claim.

Migration `202610280004_starter_grant` defaults every existing series to ineligible and adds nullable instance origins without changing existing cards. Its matching rollback is destructive and used only by the disposable runner. For deployed data, stop incompatible writers, preserve backups/history, and use reviewed forward repair or restore into a separate environment; never reset or erase populated grants/history. No production migration or local Compose data mutation is performed by this ticket.

For manual integration, configure the ignored development identity/database settings in [AUTH.md](AUTH.md), migrate the intended development DB and obtain a real managed user token. Eligible published art requires authorized review; do not mark the preview approved to make onboarding work. B005 real-provider verification and B044 art publication remain open. B008 adds owner-visible history and governed transitions; this ticket supplies only the required append-only origins.
