# B019–B028 implementation batch — 30 October 2026

Six of the requested ten tickets are implemented and committed for review. Four Evolved tickets require an explicit scoring-policy decision; they are not marked complete. Independent Spades work followed B022 while that decision remained pending. No PR is merged or deployed.

| Ticket                      | Commit           | Draft PR                                                   | Validation / acceptance limits                                                                                                                                                                       |
| --------------------------- | ---------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B019 queues/private lobbies | 5a95aae          | [18](https://github.com/BLUAlteractive/MasterDeck/pull/18) | Public/private/ready/leave and concurrent assignment; hosted quality/audit passed. Actual two-device acceptance remains open.                                                                        |
| B020 recipient delivery     | fd9c2a6, 5d0659a | [19](https://github.com/BLUAlteractive/MasterDeck/pull/19) | Cross-process safe projections and privacy; hosted quality/audit passed.                                                                                                                             |
| B021 reconnect/deadlines    | 7cf8c40          | [20](https://github.com/BLUAlteractive/MasterDeck/pull/20) | Durable safe resume, original receipts, deadline workers and client replica; hosted quality/audit passed.                                                                                            |
| B022 earned chip ledger     | b4c8072          | [21](https://github.com/BLUAlteractive/MasterDeck/pull/21) | 181 unit tests / 11 builds, 85 DB cases twice; [hosted checks passed](https://github.com/BLUAlteractive/MasterDeck/actions/runs/41046659137). Live admission gated on reviewed policy/reward source. |
| B023–B026 Evolved           | Not implemented  | None                                                       | Owner must resolve [numeric policy conflict](EVOLVED_POLICY_PROPOSAL.md); no approval inferred.                                                                                                      |
| B027 Spades tricks          | 72cd414          | [22](https://github.com/BLUAlteractive/MasterDeck/pull/22) | 191 unit tests / 11 builds; [hosted checks passed](https://github.com/BLUAlteractive/MasterDeck/actions/runs/41047000704). 1,000 complete seeded deals with independent trick oracle.                |
| B028 Spades scoring         | 2fb8811          | [23](https://github.com/BLUAlteractive/MasterDeck/pull/23) | 204 unit tests / 11 builds; 200 three-round replay matches. Required explicit rules, no launch default. Hosted result recorded below when available.                                                 |

Individual scope, migration/rollback and test evidence: [B019](B019_REPORT.md), [B020](B020_REPORT.md), [B021](B021_REPORT.md), [B022](B022_REPORT.md), [B027](B027_REPORT.md), [B028](B028_REPORT.md). Backlog scope/dependencies remain unchanged; evidence is recorded in STATUS.md.

## Changed files

All files changed since the completed B018 base (`ada91ca`), plus this batch report/policy proposal:

- `apps/mobile/src/play/replica.test.ts`
- `apps/mobile/src/play/replica.ts`
- `backlog/STATUS.md`
- `docs/B019_REPORT.md`
- `docs/B020_REPORT.md`
- `docs/B021_REPORT.md`
- `docs/B022_REPORT.md`
- `docs/B027_REPORT.md`
- `docs/B028_REPORT.md`
- `docs/DECISIONS.md`
- `docs/EVOLVED_POLICY_PROPOSAL.md`
- `docs/NEXT_TEN_REPORT.md`
- `packages/contracts/src/chips.test.ts`
- `packages/contracts/src/chips.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/lobby.ts`
- `packages/contracts/src/poker.ts`
- `packages/database/package.json`
- `packages/database/src/index.ts`
- `packages/game-spades/src/index.ts`
- `packages/game-spades/src/scoring.test.ts`
- `packages/game-spades/src/scoring.ts`
- `packages/game-spades/src/tricks.test.ts`
- `packages/game-spades/src/tricks.ts`
- `pnpm-lock.yaml`
- `prisma/migrations/202610300001_lobbies/migration.sql`
- `prisma/migrations/202610300002_turn_deadlines/migration.sql`
- `prisma/migrations/202610300003_play_chip_ledger/migration.sql`
- `prisma/rollback/202610300001_lobbies.sql`
- `prisma/rollback/202610300002_turn_deadlines.sql`
- `prisma/rollback/202610300003_play_chip_ledger.sql`
- `prisma/schema.prisma`
- `services/api/src/app.ts`
- `services/api/src/auth/socket.ts`
- `services/api/src/chips.integration.test.ts`
- `services/api/src/lobby.integration.test.ts`
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

- `pnpm ci:quality` runs formatting, lint, strict/test TypeScript, tests, Prisma generation and all builds. Final B028 run passed **204 tests in 31 files and 11 builds**, log `/tmp/deckforge-b028-quality-final.log`. B027 initial check caught test-only ES2023 usage; corrected to the existing ES2022 contract. An initial sandboxed HTTP fixture bind failed EPERM; authorized localhost-test rerun passed.
- `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION='Continue' pnpm ci:database` passed Prisma validate, migrations and **85 database cases in 13 files twice**, including owned rollback/reset/reseed. Log `/tmp/deckforge-b022-database-acceptance.log`. Earlier ticket gates: B019 68, B020 71, B021 76 DB cases twice. No persistent code changed after B022.
- `pnpm --filter @deckforge/game-spades build` and `pnpm exec vitest run packages/game-spades/src` passed, 23 focused cases; `pnpm exec prettier --write ...` and `git diff --check` passed for touched files. `pnpm ci:audit` / hosted dependency audit has no high/critical finding; inherited low advisory remains documented.
- `git switch -c codex/<ticket-branch>`, `git add <explicit-ticket-files>`, `git commit -m ...`, `git push -u origin <ticket-branch>`, `gh pr create --draft --base <previous-ticket-branch> --head <ticket-branch> --body-file <prepared-file>` created the six stacked drafts above. Each was attached to this chat. `gh pr checks` / `gh run list --branch ...` read hosted evidence. No merge/deployment command executed.
- HTTP smoke: `curl --silent --show-error --max-time 10 --output /tmp/deckforge-b028-web-response.html --write-out '%{http_code}\n' http://localhost:8081/` returned **200**. `curl --silent --show-error --max-time 10 http://localhost:3001/health` returned `{"service":"deckforge-api","status":"ok"}`. An initial probe of port 3000 had no listener; that is the optional admin port, not API. Browser access was not retried through another surface, and no visual/native acceptance is claimed.
- A bounded arithmetic enumeration confirmed no Straight-eligible 1,040 bonus and uniform king-high tie 443; full rationale and proposed resolutions are in the policy proposal.

## Exact local launch

From the repository root, use Node 22.22.x and pnpm 10.30.2:

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm infra:up
pnpm db:deploy
```

Verify DATABASE_URL points to your own local Compose database before deployment. Setup copies templates without overwriting existing ignored settings. In separate terminals:

```sh
pnpm dev:api
```

```sh
pnpm dev:web
```

Open [web preview](http://localhost:8081/) and [API health](http://localhost:3001/health). These endpoints were responding at final HTTP verification. Optional admin: `pnpm dev:admin` on port 3000. For owned inventory/authenticated APIs, configure the public development Supabase values described in [AUTH.md](AUTH.md); no provider credentials were invented. The web gallery remains a draft artwork preview without a configured provider. No approved earned reward adapter or admission policy is wired, so funded live hands intentionally remain unavailable.

## Remaining gates and next ticket

The next smallest ticket in this batch is **B023 after owner approval of the explicit Evolved policy**. The exact quantization and numeric example conflict cannot be silently resolved under AGENTS.md. B024–B026 depend on it. The reviewable alternatives preserve Classic and disable live Evolved pending balance review; the backlog is not weakened to hide the issue.

Real identity-provider and physical-device/screen-reader flows, native compilation, Spades realtime B029, populated legacy upgrades, load/chaos/operational backup acceptance and production policy reviews remain open. Xcode compatibility and the inherited low advisory remain documented. Green tests are necessary but do not establish shipping readiness. Secrets remain ignored; no production/shared DB mutation or deployment occurred.
