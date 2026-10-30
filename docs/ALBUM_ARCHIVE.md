# Album and retained archive — B011

Open **Album & archive** beside Card gallery. Without a verified connection, the screen explains the private-account boundary and shows no invented holdings, discoveries, serials or achievements. The existing gallery stays mounted when switching views so unsaved selections and stable pending-save commands are retained; account/session-key changes reset both views.

With the public development provider/API configuration described in [AUTH.md](AUTH.md) and [COLLECTION_GALLERY.md](COLLECTION_GALLERY.md), the view loads retained instance records and independently paginated series totals. No runtime fixture user, token entry or test grants are added. The seeded draft artwork is still unpublished and does not grant a real collection.

## Recorded facts and gaps

- **Owned now** includes OWNED and LOCKED instances. LOCKED is not permission to play, fuse or spend the instance.
- **Previously owned** means the retained CONSUMED or REVOKED rows under today's immutable-owner model. Transfers and former-custodian access are not implemented; their future credit/privacy policy must be reviewed before enabling transfers.
- **Recorded faces** is a distinct-face count over retained rows, including terminal rows. It survives consumption and can include revoked evidence. It is not an earned entitlement, discovery grant, permanent achievement or reward. **Complete series owned now** requires 52 distinct currently active faces in that series. Repeated copies and template versions never inflate either face count.
- Preview exposure does not write discovery records. MASTER_SPEC §5.2 distinguishes discovered credit from custody but does not define non-ownership discovery eligibility or revoked-credit treatment. R-15 records the missing policy; no such credit or achievement is fabricated here.
- Personal achievement progress/rewards require B036's verified definitions/events and eligibility. The UI says that feed is not connected; it never represents unavailable data as zero verified achievements or a completed challenge.
- Inspect a retained card for its actual UUID, template version, optional edition serial and exact original issuance event/date. A null serial is explicitly unrecorded, not an inferred issue number. No print-run cap is guessed. Legacy missing origin remains unknown.
- Transformation history reuses B008's owner-only version pages, with raw source/reason/operator/lock data excluded. The current UUID/origin survive lifecycle consumption. Actual five-to-one parent/child lineage is B032 work and is not inferred from matching faces, serials or adjacent events.

## API and consistency

`GET /v1/collection/archive` accepts only `limit` (1–100, default 50), UUID `cursor`, optional `seriesId`, and `view=all|current|former`. It uses ascending UUID keyset pagination, always applies the authenticated owner, and returns a safe projection. The mobile client requests 50 records, merges by immutable UUID and can load beyond 100. These are live pages, not a cross-request historical snapshot: concurrent new records below an already-visited cursor may require Refresh archive. No card is deleted or marked discovered by reading.

`GET /v1/collection/album` accepts only `limit` (1–20, default 10) and UUID `cursor`. It returns only series represented in that owner's retained archive. A single SQL aggregation counts all owner rows and distinct faces, independently of the mobile archive page/filter. Current and recorded totals are computed together; there is no per-page completion approximation or N+1 full-inventory download.

Both routes require a verified bound active session, retain the existing rate limit and strict Zod response/query validation, and acquire account/session shared locks in logout-compatible order with status/revocation/expiry rechecks. Logs contain fixed operation/status and duration only. Unknown owner selectors are rejected rather than silently accepted.

This feature adds no table, column, migration, reward ledger or persisted discovery policy. It reads existing immutable instance/origin/event data. Rollback is reverting the application/contract/view commit; there is no database reset or deletion to undo. Existing B008/B010 migrations and recovery procedures remain unchanged. Query-plan/load testing at production scale remains B050 work.

## Local launch and verification

Use Node 22.22.0 and pnpm 10.30.2. From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm setup:local
pnpm dev:api
# In a second terminal:
pnpm dev:web
```

Open <http://localhost:8081> and select Album & archive. The default unauthenticated preview boundary is available without Docker/provider configuration. For actual owned records, configure the development provider and migrated development database using the linked guides; no privileged secret should be pasted into the app or chat.

Run `pnpm ci:quality`, `pnpm ci:database`, `pnpm ci:audit` and the OpenAPI validator. The database runner uses only its new, random temporary PostgreSQL container and the established explicit reset consent workflow; it does not mutate an existing development database. Its archive fixtures include 125 cards, duplicate faces, terminal consumption/revocation, reserved cards, multiple series, serial/origin preservation, exact owner isolation and real mobile-adapter HTTP reads. Those fixtures are test-only and do not publish content or implement an actual fusion transaction.

Physical-device legibility, modal focus, screen-reader flow, real provider operation, verified achievements and actual fusion links remain acceptance work. The prior browser URL-policy block was not retried or circumvented; semantic SSR and bundle exports are not live visual/device evidence. B010's external acceptance stays open while this independent B008-dependent work proceeds.
