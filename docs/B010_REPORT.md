# B010 — Collection mobile gallery implementation report

29 October 2026. **Implementation prepared; full ticket acceptance pending real-provider session integration acceptance and physical-device/screen-reader validation.** Draft preview is usable independently. Implementation commit `d075d34` is in [draft PR #9](https://github.com/BLUAlteractive/MasterDeck/pull/9); [hosted CI](https://github.com/BLUAlteractive/MasterDeck/actions/runs/40907795094) passed both Quality checks and Dependency audit. No merge/deployment is claimed.

## Changed files

- `apps/mobile/App.tsx`, `src/CollectionApp.tsx`: gallery root and configured real-provider host boundary; no fake/pasted/global token path.
- `apps/mobile/src/session/*`: official managed guest/restore/refresh/disconnect host, bounded atomic native secret storage, public configuration validation and failure/Unicode/concurrency tests. Mobile `.env.example` and app.json add public settings and SecureStore backup configuration.
- Removed obsolete `apps/mobile/src/CatalogPreview.tsx`.
- `apps/mobile/src/collection/Gallery.tsx`, CardTile, CardArt, controls: virtualized responsive gallery, search/suit/series filters, sorts, preview/owned distinction, favorites, scrollable front/back inspector, paginated history and explicit loadout staging/save/retry.
- `apps/mobile/src/collection/client.ts`, model.ts and three test files: schema-validated refresh-aware transport, pagination/merge, filtering/staging/complete-deck helpers, accessible full-face labels and preview boundary tests.
- `apps/mobile/package.json`, `pnpm-lock.yaml`: Expo Crypto 58.0.7, vendor-required React Native 0.88.1/React DOM types 19.3.0, official Supabase 2.118.0, SecureStore 58.0.2 and URL polyfill 4.0.0.
- `packages/contracts/src/index.ts`, `services/api/src/auth/controller.ts`: richer owner inventory DTO; starter receipt remains separate and unchanged in meaning.
- `services/api/src/favorites.ts`, integration tests and app registration: authorized idempotent boolean preferences and actual mobile-client/API/database round trip.
- `prisma/schema.prisma`, `prisma/migrations/202610290001_card_favorites/migration.sql`, matching reversal: preference-only storage and owner FK; no inventory/history mutation.
- `vitest.config.mts`: mobile test discovery and exact React Native Web alias for semantic tests. Mobile test types stay scoped to Expo's tsconfig.
- API OpenAPI, README, gallery guide, DECISIONS, database guide and backlog status: operation, actual results, gate/rollback instructions.

## Actual validation

- `pnpm ci:quality`: **64 unit/property/semantic cases in 15 files**, formatting/lint, strict types and **11 builds passed** before final report edits.
- `pnpm ci:database`: **47 cases in 7 files passed before and after rollback/reset/reseed**. Concurrent/repeated favorites create one preference and preserve card state/origin count. Unauthorized/foreign/revoked writes fail. The actual mobile adapter read 52 cards, saved a favorite, read history, saved/replayed a loadout and revalidated it through real HTTP/signed-JWT/PostgreSQL fixtures.
- `pnpm ci:audit`: high/critical gate passed; one inherited low finding remains. OpenAPI structural validation passed.
- Both iOS and Android bundle exports passed after the RN patch. Expo install check now reports Dependencies are up to date. These are bundles, not native compilation or device evidence.
- Early checks found the Expo root prop signature, missing React DOM test types, mixed Node/RN global test types and formatting; corrected without unsafe type suppressions. The vendor check initially rejected RN 0.88.0/types 19.2.3; updated the requested patches and repeated exports/checks. Earlier stopped dev-server logs showed stale Metro HMR errors while dependencies changed; the owned server was restarted, not treated as successful visual evidence.
- Final formatting/whitespace, local documentation links and a limited credential-pattern scan passed (the scan was corrected to skip the intentionally deleted old component). API health returned ok and web returned HTTP 200 after a clean-cache server restart; both remain running. Provider storage is origin-scoped; SDK callbacks never perform asynchronous provider work. Hosted Quality checks independently passed the clean lockfile install, formatting/lint/types/tests/builds and isolated database migration/rollback suite; Dependency audit also passed for implementation commit `d075d34`.

## Remaining risks / next work

The default root stays preview-only without public provider configuration. With a configured development project it wires managed guest/restore/refresh/API binding and disconnect; native credentials use bounded atomic encrypted chunks and web is tab-scoped. No actual provider project was supplied or contacted, so real restore/refresh/logout/linking/MFA acceptance remains open. No owned data or session is fabricated. Series artwork delivery remains a reference rendering until approved assets/publishing are connected.

SSR semantic tests validate labels/control markup, with the SVG bridge mocked; they do not verify actual browser rendering, physical legibility, modal focus or VoiceOver/TalkBack. Prior browser URL-policy rejection was not retried/circumvented. Xcode 26.3 still limits native compile versus required 26.4+. No new screenshots or physical-device result are claimed.

Favorites are presentation-only and last-commit-wins; they do not change rarity/level/style/economy. Filters apply to explicitly loaded inventory pages. No gameplay, purchases, blockchain, health or location code is added.

Next smallest work is to finish the real-provider session acceptance and B010 device/accessibility acceptance. Do not mark the ticket complete or skip those gates by moving to B011.

## Disconnect failure-path follow-up — 29 October 2026

Review found that a failed server logout skipped provider sign-out, and successful server revocation could hide provider/storage cleanup errors. `apps/mobile/src/session/disconnect.ts` now attempts all three boundaries independently and returns separate outcomes; `disconnect.test.ts` covers all eight success/failure combinations without exposing provider diagnostics. ManagedSessionHost clears the private view immediately, reports partial failure and offers Retry account cleanup; guest creation stays disabled while provider/local cleanup is incomplete. The logout HTTP timeout uses AbortController plus cleared timer for native compatibility.

`storage.ts` now attempts the pointer and all 64 bank entries despite individual deletion errors, then reports incomplete cleanup. Two storage regression cases prove pointer/chunk failures do not stop later deletion and a retry removes the leftovers. No token/session/provenance is fabricated and no database schema or dependency changes are included.

Validation actually executed: `pnpm ci:quality` passed **74 cases in 16 files**, formatting/lint/strict types and **11 builds**. The first sandboxed attempt could not bind the API test listener (EPERM); the rerun with local-listener permission passed without changing tests. `pnpm db:validate`, `git diff --check`, and both iOS/Android `expo export` commands passed. The earlier 47-case disposable database evidence remains above; no local database suite rerun is claimed for this mobile-only correction. Hosted results for the latest commit are available in [PR #9 checks](https://github.com/BLUAlteractive/MasterDeck/pull/9/checks).

Provider settings were inspected by key presence only: neither mobile nor API has populated provider configuration. Real provider and physical-device acceptance remain open; this correction does not close B010 or advance B011.
