# B019–B028 implementation batch — 30 October 2026

All ten tickets have implementation and validation evidence recorded below, each developed separately and committed for review. Product/device/release gates remain explicit; this is not a shipping approval. The owner explicitly selected experimental Evolved **Option A** after the initial six tickets. Independent B027/B028 therefore precede B023–B026 in the review stack. Nothing merged or deployed.

| Ticket                      | Implementation commit | Draft PR / evidence                                                                                                    |
| --------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| B019 queues/private lobbies | 5a95aae               | [PR18](https://github.com/BLUAlteractive/MasterDeck/pull/18), [report](B019_REPORT.md)                                 |
| B020 recipient delivery     | fd9c2a6, 5d0659a      | [PR19](https://github.com/BLUAlteractive/MasterDeck/pull/19), [report](B020_REPORT.md)                                 |
| B021 reconnect/deadlines    | 7cf8c40               | [PR20](https://github.com/BLUAlteractive/MasterDeck/pull/20), [report](B021_REPORT.md)                                 |
| B022 earned chip ledger     | b4c8072               | [PR21](https://github.com/BLUAlteractive/MasterDeck/pull/21), [report](B022_REPORT.md)                                 |
| B027 Spades tricks          | 72cd414               | [PR22](https://github.com/BLUAlteractive/MasterDeck/pull/22), [report](B027_REPORT.md)                                 |
| B028 Spades scoring         | 2fb8811               | [PR23](https://github.com/BLUAlteractive/MasterDeck/pull/23), [report](B028_REPORT.md)                                 |
| B023 Evolved scoring        | c20e5b3               | [PR24](https://github.com/BLUAlteractive/MasterDeck/pull/24), [report](B023_REPORT.md)                                 |
| B024 bonus explanations     | 9ca1943               | [PR25](https://github.com/BLUAlteractive/MasterDeck/pull/25), [report](B024_REPORT.md)                                 |
| B025 isolated modes         | 6413908               | [PR26](https://github.com/BLUAlteractive/MasterDeck/pull/26), [report](B025_REPORT.md)                                 |
| B026 diagnostic simulation  | Current ticket branch | [report](B026_REPORT.md), [balance findings](EVOLVED_BALANCE_REPORT.md); draft attached to this chat after publication |

Status/evidence changes are in backlog/STATUS.md; the 82-row CSV remains scope/dependency authority. [Option A approval](EVOLVED_POLICY_PROPOSAL.md) and MASTER_SPEC record the corrected 4,450 + 1,050 = 5,500 example and exact experimental table. The earlier pending policy gate is superseded by the owner's explicit “A”.

## Changed files

Complete list since completed B018 (`ada91ca`), including final ticket/report additions:

- `.github/workflows/ci.yml`
- `MASTER_SPEC.md`
- `apps/mobile/src/CollectionApp.tsx`
- `apps/mobile/src/collection/client.ts`
- `apps/mobile/src/play/EvolvedExplanation.test.tsx`
- `apps/mobile/src/play/EvolvedExplanation.tsx`
- `apps/mobile/src/play/PlayLobby.tsx`
- `apps/mobile/src/play/PokerMatchScreen.tsx`
- `apps/mobile/src/play/modes.test.tsx`
- `apps/mobile/src/play/replica.test.ts`
- `apps/mobile/src/play/replica.ts`
- `backlog/STATUS.md`
- `docs/B019_REPORT.md`
- `docs/B020_REPORT.md`
- `docs/B021_REPORT.md`
- `docs/B022_REPORT.md`
- `docs/B023_REPORT.md`
- `docs/B024_REPORT.md`
- `docs/B025_REPORT.md`
- `docs/B026_REPORT.md`
- `docs/B027_REPORT.md`
- `docs/B028_REPORT.md`
- `docs/DECISIONS.md`
- `docs/EVOLVED_BALANCE_REPORT.md`
- `docs/EVOLVED_POLICY_PROPOSAL.md`
- `docs/NEXT_TEN_REPORT.md`
- `docs/simulations/evolved-a-v1.json`
- `package.json`
- `packages/contracts/src/chips.test.ts`
- `packages/contracts/src/chips.ts`
- `packages/contracts/src/evolved.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/lobby.ts`
- `packages/contracts/src/poker.ts`
- `packages/database/package.json`
- `packages/database/src/index.ts`
- `packages/game-poker/src/evolved-explanation.test.ts`
- `packages/game-poker/src/evolved-explanation.ts`
- `packages/game-poker/src/evolved-ranks.ts`
- `packages/game-poker/src/evolved.test.ts`
- `packages/game-poker/src/evolved.ts`
- `packages/game-poker/src/fairness.test.ts`
- `packages/game-poker/src/index.ts`
- `packages/game-poker/src/mode.test.ts`
- `packages/game-poker/src/mode.ts`
- `packages/game-poker/test/fairness.ts`
- `packages/game-spades/src/index.ts`
- `packages/game-spades/src/scoring.test.ts`
- `packages/game-spades/src/scoring.ts`
- `packages/game-spades/src/tricks.test.ts`
- `packages/game-spades/src/tricks.ts`
- `pnpm-lock.yaml`
- `prisma/migrations/202610300001_lobbies/migration.sql`
- `prisma/migrations/202610300002_turn_deadlines/migration.sql`
- `prisma/migrations/202610300003_play_chip_ledger/migration.sql`
- `prisma/migrations/202610300004_poker_modes/migration.sql`
- `prisma/rollback/202610300001_lobbies.sql`
- `prisma/rollback/202610300002_turn_deadlines.sql`
- `prisma/rollback/202610300003_play_chip_ledger.sql`
- `prisma/rollback/202610300004_poker_modes.sql`
- `prisma/schema.prisma`
- `scripts/evolved-simulation.mts`
- `services/api/src/app.ts`
- `services/api/src/auth/socket.ts`
- `services/api/src/chips.integration.test.ts`
- `services/api/src/lobby.integration.test.ts`
- `services/api/src/modes.integration.test.ts`
- `services/api/src/realtime.integration.test.ts`
- `services/api/src/reconnect.integration.test.ts`
- `services/api/src/rooms/chip-controller.ts`
- `services/api/src/rooms/chips.ts`
- `services/api/src/rooms/controller.ts`
- `services/api/src/rooms/lobby.ts`
- `services/api/src/rooms/service.ts`
- `services/api/src/rooms/settlement.ts`
- `services/api/src/rooms/shared.ts`
- `services/api/test/auth-fixture.ts`
- `services/api/test/funded.ts`

## Commands and actual results

- `pnpm ci:quality`: final B026 run passed **228 unit tests in 37 files and 11 builds**, formatting, lint and strict/test TypeScript (`/tmp/deckforge-b026-quality.log`). Earlier B023/B024/B025 gates passed 215/220/226 tests respectively. No new runtime dependencies were required.
- `pnpm db:validate`: valid schema. `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION='A' pnpm ci:database`: final B025 persisted-feature gate passed migrations and **91 DB cases in 14 files twice**, including owned rollback/reset/reseed (`/tmp/deckforge-b025-database-acceptance.log`). B026 changes no persisted feature. Earlier DB evidence: B019 68, B020 71, B021 76, B022 85 cases twice.
- `pnpm test:poker:evolved --output docs/simulations/evolved-a-v1.json`: **100,000** synthetic paired showdowns, seed 230026. `pnpm test:poker:evolved --verify docs/simulations/evolved-a-v1.json`: independently regenerated and matched the complete normalized evidence exactly. Logs: `/tmp/deckforge-b026-simulation-final.log`, `/tmp/deckforge-b026-verify.log`. CI now performs the same reproduction.
- Focused checks: `pnpm --filter @deckforge/game-poker build`, `pnpm --filter @deckforge/game-spades build`, `pnpm exec vitest run <ticket-test-files>`, `pnpm exec tsc -p tsconfig.tests.json`, `pnpm exec eslint <touched-test-files> --max-warnings 0`, `pnpm exec prettier --write <touched-files>`, `git diff --check`. Actual failures/remediation are recorded per ticket: test-only ES2023 helper, missing web expanded semantics, sandbox localhost/tsx pipe permissions and a DB test's mistaken open-table assumption. Authorized reruns passed; no checks were silently skipped.
- `git switch -c codex/<ticket-branch>`, `git add <explicit-files>`, `git commit -m ...`, `git push -u origin <ticket-branch>`, `gh pr create --draft --base <previous-ticket-branch> --head <ticket-branch> --body-file <prepared-file>` created the stacked drafts. Each was attached to this chat. `gh pr checks` / `gh run list --branch ...` read hosted evidence. No merge/deployment command ran.
- Hosted B023 [quality/audit](https://github.com/BLUAlteractive/MasterDeck/actions/runs/41061069748), B024 [quality/audit](https://github.com/BLUAlteractive/MasterDeck/actions/runs/41061517403) and B025 [quality/audit](https://github.com/BLUAlteractive/MasterDeck/actions/runs/41063044808) passed. Final B026 hosted evidence is available on its attached draft PR. High/critical findings block CI; the inherited low advisory remains documented.
- HTTP-only smoke verified localhost:8081 returned **200** and localhost:3001/health returned `{"service":"deckforge-api","status":"ok"}`. Final smoke is reported in chat. No browser policy bypass, visual QA or native/device claim. Port 3000 is optional admin, not API.

## Findings and remaining release gates

The 100,000-hand corpus found zero neutral/Classic mismatches, purchased-cosmetic payload differences, noninteger scores, invalid decks or two-category upsets. It also found a material earned advantage: maximum earned versus baseline had **80.92% half-tie showdown share**, +30.59 percentage points versus Classic on identical deals; early earned had **67.36%**, +18.17 points. These are hypothetical stress cohorts without betting, not forecasts or proof of balance. Complete counts, category/reversal distributions, Wilson limits and assumptions are in EVOLVED_BALANCE_REPORT.md.

**Live Evolved remains disabled in API, SQL and UI.** No acceptable balance threshold is invented, and no automatic tuning is applied. Activation needs product balance review plus reviewed durable Evolved actor/settlement integration with immutable publication/reservation snapshots. Full betting controls are not claimed by B025's read-only mode display. Classic live admission also requires an explicit reviewed chip policy and trusted earned reward source; no production faucet or fixture policy is enabled.

Real Supabase-provider and physical-device/VoiceOver/TalkBack/focus flows, native compilation, Spades realtime B029, populated legacy upgrades, load/chaos/backup recovery and operational policy acceptance remain open. Spades uses required explicit rules; no launch house settings are selected. Xcode compatibility and the inherited low advisory remain documented. Green tests are necessary, not shipping approval. Secrets remain ignored; no production/shared DB mutation or deployment occurred.

## Exact local launch

Use Node 22.22.x and pnpm 10.30.2 from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm infra:up
pnpm db:deploy
```

Verify DATABASE_URL points to your own local Compose database before deployment. Setup copies templates without overwriting existing ignored values. Then in separate terminals:

```sh
pnpm dev:api
```

```sh
pnpm dev:web
```

Open [web preview](http://localhost:8081/) and [API health](http://localhost:3001/health). Select **Play** to inspect the mode labels; account-only actions are disabled in preview. Configure public development Supabase settings as documented in [AUTH.md](AUTH.md) for authenticated inventory/lobby flows; no provider proof or credentials were invented. Optional admin: `pnpm dev:admin` on port 3000. Stop dev terminals with Ctrl+C.

Next smallest backlog ticket: **B029 — Spades realtime actor**. It is outside this ten-ticket batch; the Evolved balance/activation hold remains open independently.
