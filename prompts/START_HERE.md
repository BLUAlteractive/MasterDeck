# Codex ticket execution prompts

**Assumption:** You have copied the pack into the repository. Each prompt below is a separate work session / PR, **not all in one go**. Use your available coding agent; Astra is the reviewing/planning companion, if available.

## Universal preamble (prepend to each ticket)

> Read AGENTS.md, MASTER_SPEC.md, docs/DECISIONS.md and the assigned row of backlog/BUILD_BACKLOG.csv. Treat these as authoritative unless you identify a conflict, in which case document it and ask for product approval. Plan the change in at most ten bullets. Write tests before or alongside production code. Do not implement P2 features or third-party branding. Keep the PR small. Run appropriate lint, typecheck, tests and migration validation, and report what actually ran, with changed files, acceptance proof, remaining risks and next ticket. Never silently claim an unexecuted command passed.

## Prompt 00 — Repository foundation (B001)

> Build a pnpm strict-TypeScript workspace with apps/mobile (Expo), apps/admin (Next.js), services/api (NestJS), services/jobs and packages game-core, game-poker, game-spades, card-domain, contracts and ui. For now, apps can be minimal hello-world shells; do not build gameplay. Add reproducible local setup, .env.example, no committed secrets, package scripts lint/typecheck/test, a README with run commands and basic Vitest smoke tests. No proprietary content. Output a tree and actual verification results.

## Prompt 01 — CI (B002)

> Add CI which clean-installs dependencies, caches carefully, executes lint, typecheck, unit tests and validates Prisma once B004 lands. Provide no production deploy credentials. Confirm a deliberately failing test fails the pipeline and remove the deliberately failing test before finishing.

## Prompt 02 — Database / domain models (B003–B004, sequential PRs)

> Review architecture/schema.prisma for omissions and Prisma version compatibility. Expand and normalize cardinality, audit and FK constraints; create a migration, seed 52 FaceDefinitions and one original sample series. The supplied schema is a draft, not authoritative executable production code. Add isolated tests for uniqueness, one ownership record per instance, enum restrictions and deletion behavior. Show a plan for migration and rollback.

## Prompt 03 — User identity (B005)

> Add guest sign-in and linked accounts with a managed identity adapter. Confirm API and WebSocket token validation, per-user access to private inventory, admin RBAC and account deletion skeleton. No unverified direct client access to card tables. Include forbidden/unauthenticated tests.

## Prompt 04 — Card catalog + starter grant (B006–B008, separate PRs)

> Define 52 rank/suit face IDs, original series/asset manifest, card edition and card instance types. Make `grantStarterDeck(userId, idempotencyKey)` a single transaction: exactly one first-time grant, 52 individually identifiable Level 1 Blue instances covering each face exactly once, and append-only ownership events. Build concurrency and replay tests with multiple simultaneous requests; never trust client-selected card IDs.

## Prompt 05 — Canonical Classic Hold'em evaluator (B012–B013)

> Implement a pure five-card and best-five-of-seven Hold'em evaluator in packages/game-poker with no network or database dependencies. Match conventional hand categories and full tiebreak rules. Run exhaustive 2,598,960 five-card category distribution checks in a CI-suitable suite and compare an independent source-backed oracle. Treat Royal Flush as highest Straight Flush. Include wheel, board-only and tied kickers.

## Prompt 06 — Server poker state engine (B014–B015)

> Implement typed immutable poker state transitions: button/blinds, shuffled 52-face deck, deals, legal turns, call/check/raise/fold/all-in, flop/turn/river, showdown, side pots, splitting and settlement. Engine accepts only declarative commands and a server RNG adapter. Preserve all chip accounting. Use property tests for pot conservation and stale/illegal commands. Don't add a UI or real money.

## Prompt 07 — Real-time poker (B018–B022)

> Wrap pure poker engine in authoritative room actor with WebSocket commands, command idempotency, room stateVersion, server-safe projections, snapshots and reconnect. Hidden opponent hole cards and shuffle state must never be in unauthorized payloads. On hand settlement append a transactional earned-only Play Chips ledger event exactly once. Demonstrate two independent authenticated test clients finishing a legal match and recover a mid-hand disconnect.

## Prompt 08 — Evolved mode (B023–B026)

> Add versioned Evolved score per MASTER_SPEC §4.4 while preserving unchanged Classic evaluation. Use integer category*1000 + monotone 0..499 tie value + clamped <=1200 personal hole-card bonus. For each of the 21 candidate fives, count only owned hole instances included in that five; neutral board gets no bonus. Reproduce the 5500 Straight / 5210 Flush example. Add ranking-collision fallbacks to the exact conventional rank, and property tests showing a two-category upset is impossible. Provide balance-simulation harness to compare starter and evolved players; show output, do not assume balance.

## Prompt 09 — Spades (B027–B031)

> Build a pure four-player fixed-partnership Spades game reducer. Deal 13 cards/player; legal bidding and trick following suit, spades broken, trump, nil, bags, score 500 by configurable ruleset, round/match settlement and replay. Rarity is cosmetic for trick winner. Validate with multi-device or scripted 4-client 13-trick replay before implementing social rooms.

## Prompt 10 — Fusion and walking (B032–B035)

> Implement an idempotent five-instance fusion preview/commit flow with row-locking, parent linkage, one generated child and exact blue 1->3->5 or red 2->4->6 tier model. Add a native HealthKit/Health Connect step bridge as a separately testable adapter, permission and accessible alternative, dedupe overlap and claimed rewards exactly once. Never accept an unverified `steps: 10000` number from the client as truth.

## Prompt 11 — Purchases, tournaments and launch (B038–B054)

> Implement **one assigned** backlog ticket per PR. Before each commerce ticket, enumerate store policy / legal assumptions and require product review; server-verify billing transactions and refunds. Keep Play Chips earned-only and Credits cosmetic-only. Tournaments must provide only in-game nontransferable prizes at v1. Add metrics, report/admin tools, app distribution test plan, threat model and rollback runbook in separate PRs.

## After each session

> Stop at the agreed boundary. Summarize acceptance checked, code review questions for Astra, failing/untested cases and next smallest ticket.

## Prompt 12 — Earned packs, real-money known-content cosmetics, press and exploration (B060–B082)

> Read `MASTER_SPEC.md` §24 and `docs/EXPLORATION_AND_PRESS.md`, DECISIONS D-17..D-22. Do not attempt all features in one change. Start with B060 currency/ledger and B061 idempotent activity aggregation, then B062/B063 packs, B066–B070 Printing Press, B072–B079 safe Explore routes and drops, and B080–B082 QA/admin. Use separate typed server routes and pure validators. For each ticket list authoritative source, test fixtures, abuse cases, schema migration and rollback. Walking 4,000 accepted steps can complete a Basic Blue Screen press job after earning/spending Trail Credits. The ORIGINAL card UUID transitions blue L1->L3 with `PRESS_EVOLVE` lineage; five-to-one fusion remains separate. No purchased item may change card strength or movement earnings. Foreground-only trail laps demand ordered checkpoints and a public-safe route. Real-money card packs must have known contents and verified billing. Avoid all trademarked promotional art until licensed.
