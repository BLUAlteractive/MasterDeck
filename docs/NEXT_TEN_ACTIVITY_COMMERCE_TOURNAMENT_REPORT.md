# B034–B043 implementation batch

30 October 2026. Continued from B033 (`c2762a2`). Implemented the code and automated acceptance paths for these ten tickets, with the external and dependent-feature acceptance gates below still open. Each ticket has its own branch, commit and stacked draft review; no PR was merged or production service activated. The 82-ticket CSV scope is unchanged.

| Ticket | Result                                                                                                 | Evidence / draft PR                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| B034   | Foreground read-only HealthKit/Health Connect adapters and local activity review                       | [Report](B034_REPORT.md), [PR 33](https://github.com/BLUAlteractive/MasterDeck/pull/33) |
| B035   | Opt-in nonwalking quests, verified server facts, capped atomic Trail Credit and distinct Press proof   | [Report](B035_REPORT.md), [PR 37](https://github.com/BLUAlteractive/MasterDeck/pull/37) |
| B036   | Server-result achievement projection and idempotent prestige awards                                    | [Report](B036_REPORT.md), [PR 34](https://github.com/BLUAlteractive/MasterDeck/pull/34) |
| B037   | Published daily/weekly/season windows and durable mission recovery                                     | [Report](B037_REPORT.md), [PR 35](https://github.com/BLUAlteractive/MasterDeck/pull/35) |
| B038   | Separate restricted wallets and closed currency-purpose matrix                                         | [Report](B038_REPORT.md), [PR 36](https://github.com/BLUAlteractive/MasterDeck/pull/36) |
| B039   | Approved fixed cosmetic catalog, nonfunctional presentation and storefront                             | [Report](B039_REPORT.md), [PR 38](https://github.com/BLUAlteractive/MasterDeck/pull/38) |
| B040   | Bound Apple/Google server verification, encrypted evidence, durable inbox/ack and cosmetic-only grants | [Report](B040_REPORT.md), [PR 39](https://github.com/BLUAlteractive/MasterDeck/pull/39) |
| B041   | Owner restore/history and durable missed-refund/void recovery                                          | [Report](B041_REPORT.md), [PR 40](https://github.com/BLUAlteractive/MasterDeck/pull/40) |
| B042   | Scheduled gated Classic brackets, pre-deal binding, server replay, one title and audited reports       | [Report](B042_REPORT.md), [PR 41](https://github.com/BLUAlteractive/MasterDeck/pull/41) |
| B043   | Mobile schedule/join/next action, private hand controls, archive and scoped result reports             | [Report](B043_REPORT.md), branch `codex/b043-tournament-mobile-ui`                      |

B036/B037/B038 precede B035 because the accessible path needs published missions and the canonical restricted wallet. B060 must reuse that wallet; B061 remains responsible for the canonical trusted activity ledger. Implementation choices and unresolved gates are recorded in [DECISIONS](DECISIONS.md), [billing operations](BILLING.md), [commerce review](COMMERCE_REVIEW.md) and [tournament operations](TOURNAMENTS.md). The status table was normalized into a single rendered table without weakening earlier acceptance.

## Commands and validation

Meaningful commands actually executed across the batch include `pnpm add` with pinned official Apple/Google server dependencies; `pnpm exec prisma format`; schema-to-schema `pnpm exec prisma migrate diff --script`; `pnpm db:generate`; targeted Prettier writes; `pnpm build:packages`; API/mobile strict typechecks; `pnpm ci:quality`; `pnpm ci:audit`; and `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION='do the next 10 tickets' pnpm ci:database`. Health checks additionally used `xcrun swiftc -frontend -parse` and Expo Apple/Android autolinking resolution. Git branches/commits/pushes and `gh pr create --draft` produce the stacked reviews linked above. Reports record per-ticket counts and logs, including failures corrected before final validation.

Final `pnpm ci:quality` passed **295 unit tests in 53 files**, formatting/lint/strict typing and **all 11 builds** (`/tmp/deckforge-b043-quality-final.log`). `pnpm ci:audit` passed the high/critical gate with the inherited **one low advisory** (`/tmp/deckforge-b043-audit.log`). HTTP verification returned **200** for API health, the web root and the actual **5,114,303-byte JavaScript bundle**, which contains the new tournament navigation. Existing workspace-owned dev servers were reused; no duplicate listener or browser-policy bypass was needed. This verifies serving/bundling, not visual/native device acceptance. Earlier hosted drafts passed; the final draft CI status is reported with the review link. Database acceptance passed **140 integration cases in 25 files twice**, including Prisma validation/deployment, all owned reverse migrations, reset/reseed and a second acceptance run (`/tmp/deckforge-b043-database.log`). Tests never reset the developer/production database. Ten-person/worker concurrency cases are injected actors or workers, not claimed physical devices.

Issues corrected during validation: a Prisma client-side upsert create race in concurrent mission registration (conflict-safe immutable insert and policy hash check; also repaired the earlier B037 draft), analogous wallet system-account initialization, temporary parallel generation/build type artifacts (gates now run sequentially), a refund crash-recovery event-key collision, delayed readiness crossing attempts, host-only admission retry display, and readonly domain/test wire typing. Formatting required a second pass on some tests. Actual platform-positive billing and native compile/device success are not inferred from green web/fixture tests.

## Remaining acceptance and risks

- B034: installed Xcode 26.3 is below the documented 26.4+ requirement; no Android SDK/adb or physical-device evidence. Native builds, health permission/revoke/reimport behavior, signing/entitlements and declarations remain unverified. Read adapters do not establish trusted reward proof.
- B035: the distinct nonwalking proof awaits B068/B069 atomic Press consumption alongside earned screens/supplies/card eligibility. No fake steps or automatic card upgrade is claimed. Numeric equivalence/reward policies remain reviewed configuration.
- Progression/missions/wallets: default policies remain off; only explicit verified server facts award prestige/approved quest credits. No invented live XP, scarce-card or currency amounts. B061 still owns cross-provider canonical activity proof/deduplication.
- Commerce: no configured live providers/credentials or purchase-initiation flow. Native localized price/binding/purchase/restore, actual Apple/Google sandbox/console/webhook flows, age/region, product/legal/store policy, encryption key operations and security review remain open. Void coverage beyond Google's 30-day horizon cannot be inferred; sticky gaps and refund reversals require operator reconciliation. Paid cosmetics never alter functional cards, earned wallets, Press or game power.
- Tournaments: the initial free-entry single-hand Classic format/title/dispute policy requires product review before activation. Expanded formats, collusion/abandonment/forfeit/incident procedures, complete moderation triage and real multi-device/accessibility acceptance remain open. Existing earned-only hand escrow is distinct from entry fees. No real-world prize, client winner, result override or uncontrolled grant is exposed.
- Production recovery uses reviewed forward repair and preserves immutable evidence; destructive reverse scripts are limited to disposable test databases. A green test run is necessary, not shipping approval.

## Exact local launch

From the repository root, using Node 22.22.0 and pnpm 10.30.2:

```bash
pnpm install --frozen-lockfile
pnpm setup:local
```

Use two terminals:

```bash
# Terminal 1
pnpm dev:api
```

```bash
# Terminal 2
pnpm dev:web
```

Open [the app](http://localhost:8081/) and [API liveness](http://localhost:3001/health). The default app is an artwork preview; new tabs disclose their identity/policy requirements. This is not a fabricated live economy or seeded payment/tournament environment. Identity and feature integration require the explicit reviewed bootstrap described in the operation guides; main does not enable them through a public environment flag.

For optional configured catalog/private database use, start Docker Desktop, run `pnpm infra:up`, set ignored local `DATABASE_URL` as documented, then `pnpm db:deploy` and `pnpm db:seed`. These are local setup instructions, not commands run against production. Existing `.env` files are preserved; secrets never belong in `EXPO_PUBLIC_*`. Health/static artwork can run without Docker. If Metro has a stale workspace dependency map after adding packages, stop only the existing Expo process and run `pnpm --filter @deckforge/mobile exec expo start --web --clear --port 8081` after `pnpm build:packages`.

Next smallest backlog ticket is **B044 — Admin content/catalog**. This ten-ticket batch stops here.

## Changed files

The complete manifest below is relative to the repository root and includes B034–B043 only.

112 files:

```text
.gitignore
README.md
apps/mobile/app.json
apps/mobile/modules/deckforge-health/android/build.gradle
apps/mobile/modules/deckforge-health/android/src/main/AndroidManifest.xml
apps/mobile/modules/deckforge-health/android/src/main/java/expo/modules/deckforgehealth/DeckForgeHealthModule.kt
apps/mobile/modules/deckforge-health/android/src/main/java/expo/modules/deckforgehealth/HealthRationaleActivity.kt
apps/mobile/modules/deckforge-health/expo-module.config.json
apps/mobile/modules/deckforge-health/ios/DeckForgeHealth.podspec
apps/mobile/modules/deckforge-health/ios/DeckForgeHealthModule.swift
apps/mobile/modules/deckforge-health/package.json
apps/mobile/src/CollectionApp.tsx
apps/mobile/src/activity/AccessibleQuests.test.tsx
apps/mobile/src/activity/AccessibleQuests.tsx
apps/mobile/src/activity/Activity.tsx
apps/mobile/src/activity/bridge.test.ts
apps/mobile/src/activity/bridge.ts
apps/mobile/src/activity/native.ts
apps/mobile/src/collection/client.ts
apps/mobile/src/commerce/PurchaseHistory.test.tsx
apps/mobile/src/commerce/PurchaseHistory.tsx
apps/mobile/src/commerce/Storefront.test.tsx
apps/mobile/src/commerce/Storefront.tsx
apps/mobile/src/play/PokerMatchScreen.tsx
apps/mobile/src/play/PokerTable.test.tsx
apps/mobile/src/play/PokerTable.tsx
apps/mobile/src/play/poker-watch.ts
apps/mobile/src/play/room-watch.ts
apps/mobile/src/play/spades-watch.ts
apps/mobile/src/tournaments/Tournaments.test.tsx
apps/mobile/src/tournaments/Tournaments.tsx
apps/mobile/src/tournaments/client.test.ts
apps/mobile/src/tournaments/pending.ts
backlog/STATUS.md
docs/B034_REPORT.md
docs/B035_REPORT.md
docs/B036_REPORT.md
docs/B037_REPORT.md
docs/B038_REPORT.md
docs/B039_REPORT.md
docs/B040_REPORT.md
docs/B041_REPORT.md
docs/B042_REPORT.md
docs/B043_REPORT.md
docs/BILLING.md
docs/COMMERCE_REVIEW.md
docs/DECISIONS.md
docs/NEXT_TEN_ACTIVITY_COMMERCE_TOURNAMENT_REPORT.md
docs/TOURNAMENTS.md
packages/card-domain/src/currency.test.ts
packages/card-domain/src/currency.ts
packages/card-domain/src/index.ts
packages/card-domain/src/progress.test.ts
packages/card-domain/src/progress.ts
packages/contracts/src/accessibility.ts
packages/contracts/src/activity.ts
packages/contracts/src/billing.ts
packages/contracts/src/commerce.ts
packages/contracts/src/index.ts
packages/contracts/src/progression.ts
packages/contracts/src/tournaments.ts
packages/contracts/src/wallets.ts
packages/game-core/src/index.ts
packages/game-core/src/tournament.test.ts
packages/game-core/src/tournament.ts
pnpm-lock.yaml
prisma/migrations/202610300008_progression/migration.sql
prisma/migrations/202610300009_mission_windows/migration.sql
prisma/migrations/202610300010_restricted_wallets/migration.sql
prisma/migrations/202610300011_accessible_quests/migration.sql
prisma/migrations/202610300012_cosmetic_catalog/migration.sql
prisma/migrations/202610300013_verified_billing/migration.sql
prisma/migrations/202610300014_purchase_reconciliation/migration.sql
prisma/migrations/202610300015_tournaments/migration.sql
prisma/rollback/202610300008_progression.sql
prisma/rollback/202610300009_mission_windows.sql
prisma/rollback/202610300010_restricted_wallets.sql
prisma/rollback/202610300011_accessible_quests.sql
prisma/rollback/202610300012_cosmetic_catalog.sql
prisma/rollback/202610300013_verified_billing.sql
prisma/rollback/202610300014_purchase_reconciliation.sql
prisma/rollback/202610300015_tournaments.sql
prisma/schema.prisma
services/api/package.json
services/api/src/accessibility.integration.test.ts
services/api/src/accessibility.ts
services/api/src/app.ts
services/api/src/billing.integration.test.ts
services/api/src/billing/controller.ts
services/api/src/billing/history.ts
services/api/src/billing/providers.test.ts
services/api/src/billing/providers.ts
services/api/src/billing/service.ts
services/api/src/billing/vault.ts
services/api/src/events/binding.ts
services/api/src/events/tournaments.ts
services/api/src/missions.integration.test.ts
services/api/src/progression.integration.test.ts
services/api/src/progression.ts
services/api/src/purchase-restore.integration.test.ts
services/api/src/rooms/lobby.ts
services/api/src/rooms/settlement.ts
services/api/src/storefront.integration.test.ts
services/api/src/storefront.ts
services/api/src/tournaments.integration.test.ts
services/api/src/wallets.integration.test.ts
services/api/src/wallets.ts
services/api/test/auth-fixture.ts
services/api/test/billing-fixture.ts
services/api/test/cosmetic-fixture.ts
services/api/test/fixtures/apple-root-g3.cer
services/api/test/progress-fixture.ts
```
