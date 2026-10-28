# B006 — Card catalog and art manifests report

28 October 2026. **Implemented and locally validated; hosted confirmation pending.** This independent catalog slice proceeded while B005's actual-provider configuration remained pending. The preview is draft artwork, not owned cards, a starter grant or a playable game.

## Changed files

- `packages/game-core/src/index.ts` and tests: immutable canonical 52-face/rank/suit values, stable face IDs and readable labels shared by all games.
- `packages/card-domain/src/catalog.ts`, `development-catalog.ts`, `index.ts` and tests: pure manifest/rarity/rights/mapping validation plus bundled draft metadata.
- `packages/ui/src/card-art.ts`, index and tests: original vector faces, correct pip layouts, face-card monograms and symmetric blue back.
- `assets/foundation/manifest.json`, `assets/foundation/v1/front/*.svg` (52 files), `assets/foundation/v1/back.svg`, `assets/foundation/README.md`: exact-byte hashed exports and art/provenance guide.
- `scripts/export-card-art.mts`, `scripts/card-assets.test.ts`, root scripts/types/format ignore configuration: reproducible export and artifact/source/hash agreement. SVG bytes are intentionally not reformatted.
- `prisma/schema.prisma`, `prisma/migrations/202610280003_catalog_assets/migration.sql`, matching test rollback SQL: immutable assets/template versions, source/rights fields, selected series manifest version and composite front/back/face constraints.
- `packages/database/src/seed.ts`: canonical shared face seed plus 53 draft assets and 52 COMMON templates, no player grants, immutable-content conflicts rejected, only the known no-art DRAFT placeholder normalized.
- `services/api/src/catalog.ts`, app/main/config, contracts/OpenAPI, catalog integration tests: bounded public published-only catalog with safe projection; public catalog DB access can be configured independently of identity. Legacy/auth fixture template versions moved to 999 to remain distinct from canonical seeded version one.
- `apps/mobile/App.tsx` and `src/CatalogPreview.tsx`: four-suit artwork preview, full accessible names, back sample and existing API connection smoke flow.
- Relevant workspace manifests/lockfile: explicit pure-value dependencies, SVG 15.16.0 and Expo 58.0.21. `pnpm-workspace.yaml`, CLI compatibility test and CI/decision notes retarget the reviewed scoped Zod fix to CLI 58.1.17.
- README, catalog/art/database/environment/decision/CI guides, backlog status, this report and `docs/evidence/b006-catalog.jpg` / `b006-mobile.jpg`: actual commands, limits and visual evidence.

## Acceptance and executed checks

- Reviewed B006, product/engineering/art specifications, current schema and package boundaries before code. Actual source contains original geometric paths and system text, no external images/fonts or third-party branded artwork.
- Dependency install, Prisma format/generate/validate and schema-to-schema migration generation completed. All data mutations in acceptance tests used the runner-created disposable database; existing Compose/production data was untouched.
- `pnpm ci:quality` after final dependency update: **39 tests in 8 files**, strict types/lint/formatting and **11 builds passed**. New tests cover 52 immutable face IDs, unsafe/duplicate/missing metadata, wrong face/front/back mapping, missing rights evidence, publication rejection for previews, exact pip counts, SVG safety and every exported hash.
- `pnpm ci:database`: **22 cases in 3 files passed both before and after reverse migrations/reset/reseed**, including catalog FK/kind/hash/version constraints, draft filtering, fail-closed publication and safe public DTOs. Synthetic approval proof was used only in the owned test database, never the real draft manifest. Existing identity/concurrency tests remain green.
- `pnpm ci:audit`: pass at high/critical threshold; one inherited low finding remains.
- `expo install --check` initially required Expo 58.0.21 instead of 58.0.20. Updated that patch. CLI 58.1.17 still requests Zod 3; both Zod consumers were compared byte-for-byte with 58.1.16 and were unchanged. Retargeted the scoped 4.6.7 override and exact-version tests; all five CLI compatibility cases passed. Vendor dependency check now passes.
- iOS and Android `expo export` both passed after the patch. This is bundling, not native compilation or physical-device evidence.
- Browser via `pnpm --filter @deckforge/mobile web` / API dev start: all **52 accessible face labels** observed, API button reached **API connected**, black/red faces and back visually inspected. A web SVG accessibility-prop warning was fixed; fresh reload produced no new warning/error.
- At **390 × 844**, all 52 labels remained mounted, document width equaled viewport width (390) and cards fit a two-column grid. Temporary viewport override reset afterward. [Mobile-width evidence](evidence/b006-mobile.jpg), [additional suit evidence](evidence/b006-catalog.jpg).
- OpenAPI structural validation, final formatting/whitespace, frozen dependency install and a limited credential-pattern scan passed. Re-export was byte-identical for all 55 generated artifacts. No generated client, private env, consent value or production key is committed.

## Limits and next ticket

All actual art remains INTERNAL_PREVIEW and the series DRAFT. This validates development artwork/provenance, not a legal or designer approval. B044 must verify review evidence and publishing authority; no public mutation endpoint is added. The public API omits drafts and fails closed on malformed/unapproved published content. Actual CDN publication is future work.

No client-supplied state, purchased power, RNG distribution, fusion, location or commerce implementation is introduced. Catalog IDs are definitions, never reused as individually granted instance IDs. Physical device/gallery/accessibility acceptance belongs to B010/B048. The existing Xcode limitation and project-maintained CLI override remain documented.

B005 actual managed-provider sign-in/linking/MFA acceptance is still pending the requested development configuration. B007 is the next planned owned-collection ticket after its B005/B006 dependencies. No merge or production action is performed.
