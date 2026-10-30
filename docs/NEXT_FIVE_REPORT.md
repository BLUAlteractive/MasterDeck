# B014–B018 delivery report — 29 October 2026

Implemented the requested next five tickets in dependency order, with separate implementation commits and stacked draft PRs. No merges, deployment, production mutation, payments, location tracking or Evolved scoring change.

| Ticket | Result                                                                                                                 | Implementation | Draft PR                                                    |
| ------ | ---------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------- |
| B014   | Pure Classic reducer: blinds, one canonical shuffle/deal, legal wagers, streets and private replay                     | `3326121`      | [#13](https://github.com/BLUAlteractive/MasterDeck/pull/13) |
| B015   | Contribution-layer pots, fold eligibility, unmatched refunds, integer splits/odd chips                                 | `fe993d2`      | [#14](https://github.com/BLUAlteractive/MasterDeck/pull/14) |
| B016   | Deterministic 1,000-hand CI harness with exact replay and conservation                                                 | `4d038cc`      | [#15](https://github.com/BLUAlteractive/MasterDeck/pull/15) |
| B017   | Strict client-safe result schemas and reproducible visible-card explanations                                           | `2a7044e`      | [#16](https://github.com/BLUAlteractive/MasterDeck/pull/16) |
| B018   | Cross-process room locking, durable atomic events, retry/version safety and authenticated HTTP/socket acknowledgements | `006eb8c`      | [#17](https://github.com/BLUAlteractive/MasterDeck/pull/17) |

Each PR is based on its predecessor, starting with B013. Review/merge in dependency order; no PR has been merged. The final B018 evidence/test commit strengthens observed DB locking and records the combined results.

## Actual validation

- Per-ticket full quality gates: B014 **159 tests/23 files**; B015 **165/24**; B016 **168/25**; B017 **172/27**; B018 **173/27**. Each passed format, lint, strict types and **11 builds**.
- Existing exhaustive 2,598,960 five-card hands/7,462 rank classes and 50,000 seven-card reference fixtures remain in the full suite.
- B015: six targeted cases including **5,000 generated pot layouts** and independent per-pot winners/odd chips/refunds/conservation.
- B016: **1,000 completed hands, 8,292 commands, 175 folds, 825 showdowns, 581 hands with side pots**, all 2–6 seat counts, every action/street, deterministic replay and chip conservation. Single-seed 874 CLI reproduction passed.
- B017: 1,000 terminal fixture projections reproduce standard ranks and eligible pot winners from visible cards. Strict schemas reject private state and injected fields.
- B018 isolated DB run: **62 tests/nine files passed both before and after full rollback/reset/reseed**. Includes 11 new room cases with real fixture JWT/JWKS, two independent DB/service instances, ten concurrent unique commands (one effect), ten same-key requests (one effect), stale resync, original receipts, immutable events, forced-write rollback, restart replay, auth/member/privacy and socket checks. Final locking test explicitly observes two DB waiters. No shared or developer DB is reset.
- Dependency audit passed high/critical policy; one inherited low advisory remains.
- Compiled package consumer smoke passed real exported CSPRNG-deal/reducer/allocation/projection APIs.
- Existing API health `ok`; restored local Expo web at **HTTP 200**, port 8081. No live browser visual, native compilation, physical-device or real-provider claim.
- Hosted Quality checks and Dependency audit passed for B014–B017: [B014](https://github.com/BLUAlteractive/MasterDeck/actions/runs/41005766987), [B015](https://github.com/BLUAlteractive/MasterDeck/actions/runs/41005898089), [B016](https://github.com/BLUAlteractive/MasterDeck/actions/runs/41006041569), [B017](https://github.com/BLUAlteractive/MasterDeck/actions/runs/41006265461). Current B018 hosted evidence is on [PR #17 checks](https://github.com/BLUAlteractive/MasterDeck/pull/17/checks).

## Commands executed

Read/review: `git status --short --branch`, `git log`, `git diff`, `git ls-files`, `rg` searches and `cat`/`head`/`tail`/`sed` reads of AGENTS, product/Press/decision/backlog documents, engine/API/auth/schema/config/test/build files and generated validation logs. Checked standard poker rules against the primary [Poker TDA rules](https://www.pokertda.com/view-poker-tda-rules/).

Build/validation commands (repeated per relevant ticket):

```sh
pnpm build:packages
pnpm --filter @deckforge/game-poker build
pnpm --filter @deckforge/api typecheck
pnpm exec tsc -p tsconfig.tests.json
pnpm exec vitest run packages/game-poker/src/hand.test.ts
pnpm exec vitest run packages/game-poker/src/pots.test.ts
pnpm exec vitest run packages/game-poker/src/harness.test.ts
pnpm exec vitest run packages/game-poker/src/projection.test.ts packages/contracts/src/poker.test.ts
pnpm test:poker:harness
pnpm exec tsx scripts/poker-harness.mts --seed 874
pnpm exec prisma format
pnpm db:generate
pnpm ci:quality
pnpm ci:audit
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION='continue' pnpm ci:database
pnpm exec prettier --write <touched non-ignored files>
pnpm exec prettier --check .
git diff --check
```

The guarded DB command internally runs Prisma validate/generate/deploy/status/seed, deploy and seed replays, integration Vitest, owned-container rollback SQL, explicit owned-database reset and integration rerun. No arbitrary developer reset was executed. Logs live under `/tmp/deckforge-b014-*` through `/tmp/deckforge-b018-*` and are not committed.

Installation: `pnpm install --offline --ignore-scripts` first required noninteractive mode; `CI=true pnpm install --offline --ignore-scripts --no-frozen-lockfile` found a missing cached pinned tarball. Successful authorized network restoration: `CI=true pnpm install --ignore-scripts --no-frozen-lockfile`. The lockfile adds only two workspace links to the API; no external package version was changed. Prisma cache access and local test/tsx listeners needed sandbox escalation; no rejected approval remains.

Git/GitHub: five `git switch -c codex/...` branches, explicit-path `git add`, five implementation commits, `git push -u origin <branch>`, five `gh pr create --draft --base <previous-branch> --head <branch> --body-file <ticket-report>`, `gh pr checks`, `gh run list` and artifact attachment for each PR. Final evidence is committed/pushed on B018. No merge/admin bypass/deploy command.

Readiness/consumer checks: filtered package `node -e` loads actual compiled exports, creates a CSPRNG hand, advances it to completion, asserts conservation and rejects private projection keys; `curl` checks API health and web HTTP status. Web initially had no listener after relinking; `pnpm dev:web` restored it, logged at `/tmp/deckforge-b018-web.log`.

Initial errors and corrections are recorded in each ticket report. Four simultaneous new-account fixtures exceeded the existing auth service serializable retry budget; room fixtures now prepare accounts sequentially while preserving concurrent room-command tests. Authentication burst capacity remains an observed risk outside this ticket's acceptance.

## Exact local launch instructions

Use Node 22.22.0 and pnpm 10.30.2. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm dev:web
```

Open [localhost:8081](http://localhost:8081/). In a second terminal, run `pnpm dev:api`; health is [localhost:3001/health](http://localhost:3001/health). Existing env files are preserved. For explicitly selected local DB services: `pnpm infra:up`, verify root DATABASE_URL points at that local instance, then `pnpm db:deploy` and `pnpm db:seed`. See [room protocol/setup/recovery](POKER_ROOMS.md) and [managed auth setup](AUTH.md). The collection preview works without inventing an account or bearer token. Real owned-account flows still require the development Supabase settings.

There is no playable poker table screen or public room-creation endpoint yet. `pnpm test:poker:harness` is the runnable poker-engine verification. Internal room initialization does not fund chips or grant cards; actual admission must validate/reserve loadouts and earned chips under B019/B022. Wallet settlement, B020 broadcasts, B021 reconnect UX, actual provider/device acceptance, R-08 and R-11 remain open. No seed is revealed.

Next smallest ticket: **B019 — Matchmaking and private rooms**, including queue/invite/ready/seat permissions with real admission prerequisites.

## Complete changed-file manifest

Paths below are repository-relative, against pre-B014 commit `19913c1`, including this final evidence file:

```text
README.md
backlog/STATUS.md
docs/B014_REPORT.md
docs/B015_REPORT.md
docs/B016_REPORT.md
docs/B017_REPORT.md
docs/B018_REPORT.md
docs/DECISIONS.md
docs/NEXT_FIVE_REPORT.md
docs/POKER_ROOMS.md
package.json
packages/contracts/src/index.ts
packages/contracts/src/poker.test.ts
packages/contracts/src/poker.ts
packages/game-core/src/deck.ts
packages/game-core/src/index.ts
packages/game-poker/README.md
packages/game-poker/src/hand.test.ts
packages/game-poker/src/hand.ts
packages/game-poker/src/harness.test.ts
packages/game-poker/src/index.ts
packages/game-poker/src/pots.test.ts
packages/game-poker/src/pots.ts
packages/game-poker/src/projection.test.ts
packages/game-poker/src/projection.ts
packages/game-poker/test/simulation.ts
pnpm-lock.yaml
prisma/README.md
prisma/migrations/202610290002_game_rooms/migration.sql
prisma/rollback/202610290002_game_rooms.sql
prisma/schema.prisma
scripts/poker-harness.mts
services/api/package.json
services/api/src/app.ts
services/api/src/auth/auth.integration.test.ts
services/api/src/auth/socket.ts
services/api/src/rooms.integration.test.ts
services/api/src/rooms/controller.ts
services/api/src/rooms/service.ts
tests/ACCEPTANCE_MATRIX.md
```
